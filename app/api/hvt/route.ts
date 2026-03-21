import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET: Fetch all HVT companies with snapshots, outreach, website changes, and LinkedIn posts
export async function GET() {
  const supabase = await createClient();

  // Get HVT companies
  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("*")
    .eq("status", "HVT")
    .order("updated_at", { ascending: false });

  if (companiesError) {
    return NextResponse.json(
      { error: companiesError.message },
      { status: 500 }
    );
  }

  if (!companies || companies.length === 0) {
    return NextResponse.json([]);
  }

  const companyIds = companies.map((c) => c.id);

  // Fetch all related data in parallel
  const [snapshotsRes, outreachRes, websiteRes, postsRes] = await Promise.all([
    supabase
      .from("company_snapshots")
      .select("*")
      .in("company_id", companyIds)
      .eq("is_latest", true),
    supabase
      .from("outreach_summary")
      .select("*")
      .in("company_id", companyIds),
    supabase
      .from("website_snapshots")
      .select("*")
      .in("company_id", companyIds)
      .order("checked_at", { ascending: false }),
    supabase
      .from("linkedin_posts")
      .select("*")
      .in("company_id", companyIds)
      .order("posted_at", { ascending: false }),
  ]);

  // Build lookup maps
  const snapshotMap = new Map(
    (snapshotsRes.data || []).map((s) => [s.company_id, s])
  );
  const outreachMap = new Map(
    (outreachRes.data || []).map((o) => [o.company_id, o])
  );

  // For website snapshots, get the latest one with a change detected per company
  const latestChangeMap = new Map<string, (typeof websiteRes.data)[0]>();
  for (const ws of websiteRes.data || []) {
    if (ws.change_detected && !latestChangeMap.has(ws.company_id)) {
      latestChangeMap.set(ws.company_id, ws);
    }
  }

  // For LinkedIn posts, group by company (limit to 3 most recent per company)
  const postsMap = new Map<string, typeof postsRes.data>();
  for (const post of postsRes.data || []) {
    const existing = postsMap.get(post.company_id) || [];
    if (existing.length < 3) {
      existing.push(post);
      postsMap.set(post.company_id, existing);
    }
  }

  // Join everything together
  const result = companies.map((company) => ({
    ...company,
    snapshot: snapshotMap.get(company.id) || null,
    outreach: outreachMap.get(company.id) || null,
    latest_website_change: latestChangeMap.get(company.id) || null,
    recent_posts: postsMap.get(company.id) || [],
  }));

  return NextResponse.json(result);
}
