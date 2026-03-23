import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  // Run all queries in parallel
  const [
    companiesRes,
    snapshotsRes,
    reviewRes,
    outreachAttemptsRes,
  ] = await Promise.all([
    supabase.from("companies").select("id, status, created_at"),
    supabase.from("company_snapshots").select("id, company_id, is_latest, passed_headcount_filter, passed_llm_filter, snapshot_date"),
    supabase.from("review_history").select("id, company_id, classification, reviewed_at"),
    supabase.from("outreach_attempts").select("id, company_id, sent_at, email_opened"),
  ]);

  const companies = companiesRes.data || [];
  const snapshots = snapshotsRes.data || [];
  const reviews = reviewRes.data || [];
  const outreachAttempts = outreachAttemptsRes.data || [];

  // Total companies ingested
  const totalIngested = companies.length;

  // Companies by status
  const statusCounts: Record<string, number> = {};
  for (const c of companies) {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  }

  // Passed headcount filter (from latest snapshots)
  const latestSnapshots = snapshots.filter((s) => s.is_latest);
  const passedHeadcount = latestSnapshots.filter((s) => s.passed_headcount_filter).length;
  const passedLLM = latestSnapshots.filter((s) => s.passed_llm_filter).length;

  // Classification breakdown from review history
  const classificationCounts: Record<string, number> = {};
  for (const r of reviews) {
    classificationCounts[r.classification] = (classificationCounts[r.classification] || 0) + 1;
  }

  // Outreach stats
  const emailsSent = outreachAttempts.filter((o) => o.sent_at).length;
  const emailsDrafted = outreachAttempts.length;
  const emailsOpened = outreachAttempts.filter((o) => o.email_opened).length;
  const openRate = emailsSent > 0 ? (emailsOpened / emailsSent) * 100 : 0;

  // Monthly breakdown (last 6 months)
  const now = new Date();
  const months: { label: string; ingested: number; hvt: number; passed: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const label = monthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });

    const monthIngested = companies.filter((c) => {
      const d = new Date(c.created_at);
      return d >= monthDate && d <= monthEnd;
    }).length;

    const monthHVT = reviews.filter((r) => {
      const d = new Date(r.reviewed_at);
      return r.classification === "HVT" && d >= monthDate && d <= monthEnd;
    }).length;

    const monthPassed = reviews.filter((r) => {
      const d = new Date(r.reviewed_at);
      return r.classification !== "HVT" && d >= monthDate && d <= monthEnd;
    }).length;

    months.push({ label, ingested: monthIngested, hvt: monthHVT, passed: monthPassed });
  }

  return NextResponse.json({
    totalIngested,
    passedHeadcount,
    passedLLM,
    statusCounts,
    classificationCounts,
    emailsDrafted,
    emailsSent,
    emailsOpened,
    openRate: Math.round(openRate),
    hvtCount: statusCounts["HVT"] || 0,
    pendingCount: statusCounts["pending"] || 0,
    months,
  });
}
