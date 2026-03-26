import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    // Get all usage data from last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: usage, error } = await supabase
      .from("api_usage")
      .select("*")
      .gte("created_at", ninetyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = usage || [];

    // Aggregate by API
    const byApi: Record<string, {
      total_calls: number;
      successful: number;
      failed: number;
      total_cost: number;
      total_credits: number;
      total_input_tokens: number;
      total_output_tokens: number;
    }> = {};

    // Weekly and monthly aggregation
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const weekly: Record<string, number> = {};
    const monthly: Record<string, number> = {};

    // Daily trend (last 30 days)
    const dailyCosts: Record<string, Record<string, number>> = {};

    for (const row of rows) {
      const api = row.api_name;
      const cost = Number(row.estimated_cost_usd) || 0;
      const created = new Date(row.created_at);
      const dateKey = created.toISOString().slice(0, 10);

      // By API totals
      if (!byApi[api]) {
        byApi[api] = { total_calls: 0, successful: 0, failed: 0, total_cost: 0, total_credits: 0, total_input_tokens: 0, total_output_tokens: 0 };
      }
      byApi[api].total_calls++;
      if (row.success) byApi[api].successful++;
      else byApi[api].failed++;
      byApi[api].total_cost += cost;
      byApi[api].total_credits += row.credits_used || 0;
      byApi[api].total_input_tokens += row.input_tokens || 0;
      byApi[api].total_output_tokens += row.output_tokens || 0;

      // Weekly
      if (created >= weekAgo) {
        weekly[api] = (weekly[api] || 0) + cost;
      }

      // Monthly
      if (created >= monthAgo) {
        monthly[api] = (monthly[api] || 0) + cost;
      }

      // Daily trend
      if (created >= monthAgo) {
        if (!dailyCosts[dateKey]) dailyCosts[dateKey] = {};
        dailyCosts[dateKey][api] = (dailyCosts[dateKey][api] || 0) + cost;
      }
    }

    // Total costs
    const totalWeekly = Object.values(weekly).reduce((a, b) => a + b, 0);
    const totalMonthly = Object.values(monthly).reduce((a, b) => a + b, 0);

    // Recent calls (last 50)
    const recentCalls = rows.slice(0, 50).map(r => ({
      api: r.api_name,
      endpoint: r.endpoint,
      company: r.company_name,
      cost: Number(r.estimated_cost_usd) || 0,
      success: r.success,
      error: r.error_message,
      date: r.created_at,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      credits: r.credits_used,
    }));

    // Build daily trend array (last 30 days)
    const trend = [];
    for (let d = 0; d < 30; d++) {
      const date = new Date(now.getTime() - (29 - d) * 24 * 60 * 60 * 1000);
      const key = date.toISOString().slice(0, 10);
      trend.push({
        date: key,
        anthropic: dailyCosts[key]?.anthropic || 0,
        crustdata: dailyCosts[key]?.crustdata || 0,
        apollo: dailyCosts[key]?.apollo || 0,
        total: Object.values(dailyCosts[key] || {}).reduce((a: number, b: number) => a + b, 0),
      });
    }

    return NextResponse.json({
      byApi,
      weekly,
      monthly,
      totalWeekly,
      totalMonthly,
      totalAllTime: Object.values(byApi).reduce((a, b) => a + b.total_cost, 0),
      totalCalls: rows.length,
      trend,
      recentCalls,
    });
  } catch (error) {
    console.error("[Costs API]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch costs" },
      { status: 500 }
    );
  }
}
