import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HUBSPOT_TOKEN = process.env.HUBSPOT_API_KEY;
const HUBSPOT_API = "https://api.hubapi.com";

interface HubSpotEmail {
  date: string;
  subject: string;
  direction: string;
  sender: string;
  recipient: string;
  opens: number;
  isFirstOutreach: boolean;
}

interface HubSpotMeeting {
  date: string;
  title: string;
}

interface HubSpotEngagement {
  companyId: string;
  companyName: string;
  contacts: { name: string; email: string; title: string }[];
  emails: HubSpotEmail[];
  meetings: HubSpotMeeting[];
  totalEmails: number;
  totalOpens: number;
  totalMeetings: number;
  firstOutreachDate: string | null;
  lastActivityDate: string | null;
}

async function hubspotFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function getEngagementForDomain(domain: string, companyId: string, companyName: string): Promise<HubSpotEngagement> {
  const engagement: HubSpotEngagement = {
    companyId,
    companyName,
    contacts: [],
    emails: [],
    meetings: [],
    totalEmails: 0,
    totalOpens: 0,
    totalMeetings: 0,
    firstOutreachDate: null,
    lastActivityDate: null,
  };

  try {
    // Step 1: Search for contacts by email domain
    const contactsRes = await hubspotFetch("/crm/v3/objects/contacts/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: "email",
            operator: "CONTAINS_TOKEN",
            value: domain.replace("www.", "").split(".")[0], // e.g., "archiveintel"
          }],
        }],
        properties: ["email", "firstname", "lastname", "jobtitle"],
        limit: 20,
      }),
    });

    const contacts = contactsRes.results || [];
    engagement.contacts = contacts.map((c: { properties: Record<string, string> }) => ({
      name: `${c.properties.firstname || ""} ${c.properties.lastname || ""}`.trim(),
      email: c.properties.email || "",
      title: c.properties.jobtitle || "",
    }));

    if (contacts.length === 0) return engagement;

    // Step 2: Get email associations for each contact
    const allEmailIds = new Set<string>();
    const allMeetingIds = new Set<string>();

    for (const contact of contacts.slice(0, 5)) {
      try {
        const emailAssoc = await hubspotFetch(`/crm/v3/objects/contacts/${contact.id}/associations/emails`);
        (emailAssoc.results || []).forEach((r: { id: string }) => allEmailIds.add(r.id));

        const meetingAssoc = await hubspotFetch(`/crm/v3/objects/contacts/${contact.id}/associations/meetings`);
        (meetingAssoc.results || []).forEach((r: { id: string }) => allMeetingIds.add(r.id));
      } catch {
        // Some associations may not exist
      }
    }

    // Step 3: Batch read emails (max 100 at a time, get most recent)
    const emailIdList = Array.from(allEmailIds).slice(-100); // last 100
    if (emailIdList.length > 0) {
      const emailsRes = await hubspotFetch("/crm/v3/objects/emails/batch/read", {
        method: "POST",
        body: JSON.stringify({
          inputs: emailIdList.map((id) => ({ id })),
          properties: [
            "hs_email_subject", "hs_email_status", "hs_email_direction",
            "hs_timestamp", "hs_email_sender_email", "hs_email_to_email",
            "hs_email_open_count", "hs_email_click_count",
          ],
        }),
      });

      const rawEmails = (emailsRes.results || [])
        .map((r: { properties: Record<string, string | null> }) => ({
          date: r.properties.hs_timestamp || "",
          subject: r.properties.hs_email_subject || "(no subject)",
          direction: r.properties.hs_email_direction || "",
          sender: r.properties.hs_email_sender_email || "",
          recipient: r.properties.hs_email_to_email || "",
          opens: parseInt(r.properties.hs_email_open_count || "0", 10) || 0,
          isFirstOutreach: false,
        }))
        .sort((a: HubSpotEmail, b: HubSpotEmail) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Mark first outreach
      if (rawEmails.length > 0) {
        rawEmails[0].isFirstOutreach = true;
        engagement.firstOutreachDate = rawEmails[0].date;
        engagement.lastActivityDate = rawEmails[rawEmails.length - 1].date;
      }

      engagement.emails = rawEmails;
      engagement.totalEmails = allEmailIds.size;
      engagement.totalOpens = rawEmails.reduce((sum: number, e: HubSpotEmail) => sum + e.opens, 0);
    }

    // Step 4: Batch read meetings
    const meetingIdList = Array.from(allMeetingIds).slice(-20);
    if (meetingIdList.length > 0) {
      const meetingsRes = await hubspotFetch("/crm/v3/objects/meetings/batch/read", {
        method: "POST",
        body: JSON.stringify({
          inputs: meetingIdList.map((id) => ({ id })),
          properties: ["hs_meeting_title", "hs_timestamp", "hs_meeting_start_time"],
        }),
      });

      engagement.meetings = (meetingsRes.results || [])
        .map((r: { properties: Record<string, string | null> }) => ({
          date: r.properties.hs_meeting_start_time || r.properties.hs_timestamp || "",
          title: r.properties.hs_meeting_title || "(untitled meeting)",
        }))
        .sort((a: HubSpotMeeting, b: HubSpotMeeting) => new Date(a.date).getTime() - new Date(b.date).getTime());

      engagement.totalMeetings = allMeetingIds.size;
    }
  } catch (error) {
    console.error(`HubSpot error for ${domain}:`, error);
  }

  return engagement;
}

// GET: Fetch HubSpot engagement for all HVT companies
export async function GET(request: Request) {
  if (!HUBSPOT_TOKEN) {
    return NextResponse.json({ error: "HUBSPOT_API_KEY not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  const supabase = await createClient();

  // Get HVT companies (or specific one)
  let query = supabase.from("companies").select("id,status").eq("status", "HVT");
  if (companyId) {
    query = supabase.from("companies").select("id,status").eq("id", companyId);
  }
  const { data: companies } = await query;

  if (!companies || companies.length === 0) {
    return NextResponse.json([]);
  }

  // Get snapshots for website domains
  const companyIds = companies.map((c) => c.id);
  const { data: snapshots } = await supabase
    .from("company_snapshots")
    .select("company_id, name, website")
    .in("company_id", companyIds)
    .eq("is_latest", true);

  if (!snapshots) return NextResponse.json([]);

  // Fetch engagement for each company
  const engagements: HubSpotEngagement[] = [];
  for (const snap of snapshots) {
    const website = snap.website || "";
    const domain = website
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    if (!domain) continue;

    const engagement = await getEngagementForDomain(domain, snap.company_id, snap.name || "Unknown");
    engagements.push(engagement);
  }

  if (companyId && engagements.length === 1) {
    return NextResponse.json(engagements[0]);
  }

  return NextResponse.json(engagements);
}
