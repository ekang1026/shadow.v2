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
    htmlBody,
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

  // Check for recipient email
  const recipientEmail = snapshot.pb_primary_contact_email;
  const recipientName = snapshot.pb_primary_contact;
  const companyName = snapshot.name || "Unknown Company";
  const websiteUrl = snapshot.website;

  if (!recipientEmail) {
    return NextResponse.json(
      { error: "No contact email found for this company (pb_primary_contact_email is empty)" },
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
      // If not valid JSON, use the raw response
      emailHtml = responseText;
    }

    // Extract first name for subject line
    const firstName = recipientName?.split(" ")[0] || "there";
    const subject = `${firstName} - Gray Line Partners`;

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
