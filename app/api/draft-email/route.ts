import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

// Load the email prompt template
function loadEmailPrompt(): string {
  try {
    const promptPath = join(process.cwd(), "pipeline", "prompts", "email_prompt.txt");
    return readFileSync(promptPath, "utf-8");
  } catch {
    throw new Error("Email prompt template not found at pipeline/prompts/email_prompt.txt");
  }
}

// Create a Gmail draft using the Google API
async function createGmailDraft(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ id: string; threadId: string }> {
  // Build the RFC 2822 email message
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody +
      `<br><p style="margin-top:16px;color:#333;font-size:14px;">--<br>Eddie Kang | Managing Partner<br>Gray Line Partners | 415.990.1045</p>`,
  ];
  const rawMessage = messageParts.join("\r\n");

  // Base64url encode
  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        raw: encodedMessage,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gmail API error: ${JSON.stringify(errorData)}`);
  }

  return response.json();
}

// Find CEO/founder email via Apollo.io People Search
async function findCeoViaApollo(
  websiteUrl: string,
  companyName: string
): Promise<{ email: string; name: string } | null> {
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    console.error("[Apollo] APOLLO_API_KEY not set");
    return null;
  }

  // Extract domain from website URL
  let domain = websiteUrl;
  try {
    domain = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).hostname;
    domain = domain.replace(/^www\./, "");
  } catch {
    // Use as-is if URL parsing fails
    domain = websiteUrl.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
  }

  // Search for C-level people at this domain
  const response = await fetch("https://api.apollo.io/v1/mixed_people/api_search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": apolloKey,
    },
    body: JSON.stringify({
      q_organization_domains: domain,
      person_titles: ["CEO", "Chief Executive Officer", "Founder", "Co-Founder", "Co-Founder & CEO"],
      page: 1,
      per_page: 5,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[Apollo] API error ${response.status}: ${err}`);
    return null;
  }

  const data = await response.json();
  if (data.error) {
    console.error(`[Apollo] API error: ${data.error}`);
    return null;
  }
  const people = data.people || [];

  if (people.length === 0) {
    console.log(`[Apollo] No CEO/founder found for ${domain}`);
    return null;
  }

  // Find the best match — prefer CEO, then Founder
  const ceo = people.find((p: { title?: string }) =>
    p.title?.toLowerCase().includes("ceo") || p.title?.toLowerCase().includes("chief executive")
  ) || people.find((p: { title?: string }) =>
    p.title?.toLowerCase().includes("founder")
  ) || people[0];

  console.log(`[Apollo] Found: ${ceo.first_name} (${ceo.title}), revealing email...`);

  // Step 2: Reveal email via people/match
  const matchRes = await fetch("https://api.apollo.io/v1/people/match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": apolloKey,
    },
    body: JSON.stringify({
      id: ceo.id,
      reveal_personal_emails: false,
    }),
  });

  if (!matchRes.ok) {
    const matchErr = await matchRes.text();
    console.error(`[Apollo] Match error ${matchRes.status}: ${matchErr}`);
    return null;
  }

  const matchData = await matchRes.json();
  const person = matchData.person;

  if (!person || !person.email) {
    console.log(`[Apollo] Could not reveal email for ${ceo.first_name}`);
    return null;
  }

  console.log(`[Apollo] Revealed: ${person.name} <${person.email}>`);

  return {
    email: person.email,
    name: person.name || `${person.first_name} ${person.last_name}`,
  };
}

// POST: Generate email draft for an HVT company
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { companyId } = await request.json();
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  // Get Google access token from cookie
  const cookieStore = await cookies();
  const googleToken = cookieStore.get("google_access_token")?.value;
  if (!googleToken) {
    return NextResponse.json(
      { error: "Google access token not found. Please sign out and sign back in to grant Gmail permissions." },
      { status: 401 }
    );
  }

  // Fetch company and snapshot data
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from("company_snapshots")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_latest", true)
    .single();

  if (snapshotError || !snapshot) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  // Get CEO email via Apollo (primary source)
  let recipientEmail: string | null = null;
  let recipientName: string | null = snapshot.pb_primary_contact;
  const companyName = snapshot.name || "Unknown Company";
  const websiteUrl = snapshot.website;

  if (websiteUrl) {
    console.log(`[Draft] Looking up CEO for ${companyName} via Apollo...`);
    try {
      const apolloResult = await findCeoViaApollo(websiteUrl, companyName);
      if (apolloResult) {
        recipientEmail = apolloResult.email;
        recipientName = apolloResult.name;
        console.log(`[Draft] Apollo found: ${recipientName} <${recipientEmail}>`);

        // Save the Apollo-found contact back to the snapshot
        await supabase
          .from("company_snapshots")
          .update({
            ceo_email: apolloResult.email,
            ceo_name: apolloResult.name,
          })
          .eq("id", snapshot.id);
      }
    } catch (err) {
      console.error(`[Draft] Apollo lookup failed:`, err);
    }
  }

  if (!recipientEmail) {
    return NextResponse.json(
      { error: `No CEO email found for ${companyName} via Apollo.` },
      { status: 400 }
    );
  }

  // Scrape the website for content to feed the LLM
  let websiteContent = "";
  if (websiteUrl) {
    try {
      const url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ShadowBot/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      // Strip HTML tags for clean text
      websiteContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 15000);
    } catch {
      websiteContent = snapshot.pb_description || snapshot.what_they_do || "";
    }
  }

  // Build context for the LLM
  const companyContext = [
    `Company Name: ${companyName}`,
    `Website: ${websiteUrl}`,
    `CEO/Contact: ${recipientName || "Unknown"}`,
    `Title: ${snapshot.pb_primary_contact_title || "Unknown"}`,
    `Description (PitchBook): ${snapshot.pb_description || "N/A"}`,
    `What They Do (LLM): ${snapshot.what_they_do || "N/A"}`,
    `Market Focus: ${snapshot.market_focus || "N/A"}`,
    `Vertical Type: ${snapshot.vertical_type || "N/A"}`,
    `NAICS: ${snapshot.naics_3digit_name || "N/A"}`,
    `Offering Type: ${snapshot.offering_type?.join(", ") || "N/A"}`,
    `Customer Type: ${snapshot.customer_type?.join(", ") || "N/A"}`,
    `Agentic Features: ${snapshot.agentic_features_present ? "Yes" : "No"}`,
    `Agentic Feature Types: ${snapshot.agentic_feature_types?.join(", ") || "N/A"}`,
    `Named Customers: ${snapshot.customers_named?.join(", ") || "None found"}`,
    `Success Indicators: ${snapshot.success_indicators?.join(", ") || "None found"}`,
    `Keywords: ${snapshot.pb_keywords || "N/A"}`,
    `Location: ${snapshot.pb_hq_city || snapshot.location || "N/A"}`,
    `Founded: ${snapshot.founded_year || "N/A"}`,
    `Employees: ${snapshot.headcount || snapshot.pb_employees || "N/A"}`,
  ].join("\n");

  // Load prompt template and fill in variables
  const promptTemplate = loadEmailPrompt();
  const prompt = promptTemplate
    .replace(/\{company_name\}/g, companyName)
    .replace(/\{target_domain\}/g, websiteUrl || "unknown");

  // Call Claude to generate the email
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\n<company-context>\n${companyContext}\n</company-context>\n\n<website-content>\n${websiteContent}\n</website-content>`,
        },
      ],
    });

    // Extract the response text
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Parse the JSON array response
    let emailHtml: string;
    try {
      const parsed = JSON.parse(responseText);
      emailHtml = Array.isArray(parsed) ? parsed[0] : responseText;
    } catch {
      emailHtml = responseText;
    }

    // Clean up: strip any trailing "] or similar JSON artifacts
    emailHtml = emailHtml.replace(/"\s*\]\s*$/, "").trim();

    // Strip research notes - keep only the HTML email
    // Find the first <p> tag which is the start of the actual email
    const firstPTag = emailHtml.indexOf('<p>');
    if (firstPTag > 0) {
      emailHtml = emailHtml.substring(firstPTag);
    }

    // Strip trailing non-HTML artifacts (closing brackets, quotes)
    emailHtml = emailHtml.replace(/[\]\["'\s]+$/, "").trim();
    // Ensure it ends with a closing tag
    if (!emailHtml.endsWith('>')) {
      const lastClose = emailHtml.lastIndexOf('</p>');
      if (lastClose > 0) {
        emailHtml = emailHtml.substring(0, lastClose + 4);
      }
    }

    // Unescape any escaped quotes from JSON parsing FIRST
    emailHtml = emailHtml.replace(/\\"/g, '"');
    emailHtml = emailHtml.replace(/\\\\/g, '\\');

    // Determine confidence level and apply font color
    let fontColor = "";
    if (/Competitor confidence\s*-\s*HIGH/i.test(emailHtml)) {
      fontColor = "green";
    } else if (/Competitor confidence\s*-\s*MIXED/i.test(emailHtml)) {
      fontColor = "#cc8800";
    } else if (/Competitor confidence\s*-\s*LOW/i.test(emailHtml)) {
      fontColor = "red";
    }

    if (fontColor) {
      // Replace the <i style="color: ..."> with correct confidence color
      emailHtml = emailHtml.replace(
        /<i\s+style="[^"]*">/i,
        `<i style="color: ${fontColor};">`
      );
    }

    // Subject line: "Company Name || Gray Line Partners"
    const subject = `${companyName} || Gray Line Partners`;

    // Create Gmail draft
    const draft = await createGmailDraft(
      googleToken,
      recipientEmail,
      subject,
      emailHtml
    );

    // Store draft info in outreach_summary
    await supabase.from("outreach_summary").upsert({
      company_id: companyId,
      email_draft_id: draft.id,
      email_status: "draft",
      last_email_date: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      draftId: draft.id,
      to: recipientEmail,
      subject,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Draft email error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
