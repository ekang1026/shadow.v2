import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    // Count all latest snapshots by filter status using parallel queries
    const [hcTrue, hcFalse, hcNull, llmTrue, llmFalse, llmPendingAfterHc] = await Promise.all([
      supabase.from("company_snapshots").select("id", { count: "exact", head: true }).eq("is_latest", true).eq("passed_headcount_filter", true),
      supabase.from("company_snapshots").select("id", { count: "exact", head: true }).eq("is_latest", true).eq("passed_headcount_filter", false),
      supabase.from("company_snapshots").select("id", { count: "exact", head: true }).eq("is_latest", true).is("passed_headcount_filter", null),
      supabase.from("company_snapshots").select("id", { count: "exact", head: true }).eq("is_latest", true).eq("passed_llm_filter", true),
      supabase.from("company_snapshots").select("id", { count: "exact", head: true }).eq("is_latest", true).eq("passed_llm_filter", false),
      // LLM remaining = passed HC but LLM still null
      supabase.from("company_snapshots").select("id", { count: "exact", head: true }).eq("is_latest", true).eq("passed_headcount_filter", true).is("passed_llm_filter", null),
    ]);

    const total = (hcTrue.count || 0) + (hcFalse.count || 0) + (hcNull.count || 0);
    const hcPassedCount = hcTrue.count || 0;
    const llmEvaluated = (llmTrue.count || 0) + (llmFalse.count || 0);
    const llmRemaining = llmPendingAfterHc.count || 0;

    return NextResponse.json({
      total,
      linkedin: {
        scraped: (hcTrue.count || 0) + (hcFalse.count || 0),
        passed: hcPassedCount,
        failed: hcFalse.count || 0,
        remaining: hcNull.count || 0,
      },
      llm: {
        total: hcPassedCount,  // Only HC-passed companies are eligible for LLM
        evaluated: llmEvaluated,
        passed: llmTrue.count || 0,
        failed: llmFalse.count || 0,
        remaining: llmRemaining,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
