"use client";

import { useState, useEffect, useCallback } from "react";

interface ApiStats {
  total_calls: number;
  successful: number;
  failed: number;
  total_cost: number;
  total_credits: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

interface TrendPoint {
  date: string;
  anthropic: number;
  crustdata: number;
  apollo: number;
  total: number;
}

interface RecentCall {
  api: string;
  endpoint: string;
  company: string;
  cost: number;
  success: boolean;
  error: string | null;
  date: string;
  inputTokens: number | null;
  outputTokens: number | null;
  credits: number | null;
}

interface CostsData {
  byApi: Record<string, ApiStats>;
  weekly: Record<string, number>;
  monthly: Record<string, number>;
  totalWeekly: number;
  totalMonthly: number;
  totalAllTime: number;
  totalCalls: number;
  trend: TrendPoint[];
  recentCalls: RecentCall[];
}

const API_COLORS: Record<string, string> = {
  anthropic: "#f59e0b",
  crustdata: "#3b82f6",
  apollo: "#8b5cf6",
  hubspot: "#ef4444",
};

const API_LABELS: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  crustdata: "Crust Data",
  apollo: "Apollo",
  hubspot: "HubSpot",
};

function formatCost(cost: number): string {
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(3)}`;
  if (cost > 0) return `$${cost.toFixed(4)}`;
  return "$0.00";
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function MiniBarChart({ data, maxVal }: { data: TrendPoint[]; maxVal: number }) {
  if (!data.length || maxVal === 0) return <div className="text-gray-600 text-xs italic">No data</div>;
  return (
    <div className="flex items-end gap-[2px] h-20">
      {data.map((d, i) => {
        const h = maxVal > 0 ? (d.total / maxVal) * 100 : 0;
        return (
          <div
            key={i}
            className="flex-1 rounded-t transition-all hover:opacity-80"
            style={{
              height: `${Math.max(h, 2)}%`,
              background: d.total > 0
                ? `linear-gradient(to top, ${API_COLORS.anthropic}, ${API_COLORS.crustdata})`
                : "#1f2937",
            }}
            title={`${d.date}: ${formatCost(d.total)}`}
          />
        );
      })}
    </div>
  );
}

export default function CostsPage() {
  const [data, setData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCosts = useCallback(async () => {
    try {
      const res = await fetch(`/api/costs?t=${Date.now()}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch costs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <span className="animate-spin w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full mr-3" />
        Loading costs...
      </div>
    );
  }

  if (!data) {
    return <div className="text-gray-500 py-10">Failed to load cost data</div>;
  }

  const maxTrend = Math.max(...data.trend.map((t) => t.total), 0.01);
  const apis = Object.keys(data.byApi);

  return (
    <div className="max-w-7xl">
      <h1 className="text-2xl font-bold text-white mb-6">API Costs</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">This Week</div>
          <div className="text-3xl font-bold text-white">{formatCost(data.totalWeekly)}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">This Month</div>
          <div className="text-3xl font-bold text-white">{formatCost(data.totalMonthly)}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">All Time</div>
          <div className="text-3xl font-bold text-white">{formatCost(data.totalAllTime)}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-5">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Total API Calls</div>
          <div className="text-3xl font-bold text-white">{formatNumber(data.totalCalls)}</div>
        </div>
      </div>

      {/* 30-Day Trend */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Daily Spend (Last 30 Days)</h2>
        <MiniBarChart data={data.trend} maxVal={maxTrend} />
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          <span>{data.trend[0]?.date}</span>
          <span>{data.trend[data.trend.length - 1]?.date}</span>
        </div>
      </div>

      {/* Per-API Breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {apis.map((api) => {
          const stats = data.byApi[api];
          const weekCost = data.weekly[api] || 0;
          const monthCost = data.monthly[api] || 0;
          const color = API_COLORS[api] || "#6b7280";
          return (
            <div key={api} className="bg-gray-900 rounded-lg border border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <h3 className="text-sm font-medium text-gray-300">{API_LABELS[api] || api}</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Calls</span>
                  <span className="text-gray-300 font-medium">{stats.total_calls}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Success Rate</span>
                  <span className={stats.failed > 0 ? "text-red-400" : "text-emerald-400"}>
                    {stats.total_calls > 0 ? Math.round((stats.successful / stats.total_calls) * 100) : 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Weekly Cost</span>
                  <span className="text-gray-300">{formatCost(weekCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Monthly Cost</span>
                  <span className="text-gray-300">{formatCost(monthCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">All-Time Cost</span>
                  <span className="text-white font-medium">{formatCost(stats.total_cost)}</span>
                </div>
                {api === "anthropic" && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Input Tokens</span>
                      <span className="text-gray-300">{formatNumber(stats.total_input_tokens)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Output Tokens</span>
                      <span className="text-gray-300">{formatNumber(stats.total_output_tokens)}</span>
                    </div>
                  </>
                )}
                {(api === "crustdata" || api === "apollo") && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Credits Used</span>
                    <span className="text-gray-300">{stats.total_credits}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {apis.length === 0 && (
          <div className="col-span-4 text-center text-gray-500 py-8">
            No API usage data yet. Run a pipeline to see costs.
          </div>
        )}
      </div>

      {/* Cost Estimates Reference */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Cost Reference</h2>
        <div className="grid grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-gray-500 mb-1">Anthropic (Sonnet)</div>
            <div className="text-gray-400">Input: $3/M tokens</div>
            <div className="text-gray-400">Output: $15/M tokens</div>
            <div className="text-gray-400">~$0.024 per LLM survey</div>
            <div className="text-gray-400">~$0.05 per email draft</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Crust Data</div>
            <div className="text-gray-400">1 credit per company</div>
            <div className="text-gray-400">~$0.05 per enrichment</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Apollo</div>
            <div className="text-gray-400">1 credit per person</div>
            <div className="text-gray-400">~$0.03 per email lookup</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">HubSpot</div>
            <div className="text-gray-400">Free (included in plan)</div>
            <div className="text-gray-400">Rate limited: 100/10s</div>
          </div>
        </div>
      </div>

      {/* Recent Calls */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Recent API Calls</h2>
        </div>
        {data.recentCalls.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No API calls logged yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Time</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">API</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Endpoint</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium">Company</th>
                  <th className="text-right py-2 px-4 text-gray-500 font-medium">Cost</th>
                  <th className="text-center py-2 px-4 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCalls.map((call, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 px-4 text-gray-500">
                      {new Date(call.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="py-2 px-4">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: API_COLORS[call.api] || "#6b7280" }} />
                        <span className="text-gray-300">{API_LABELS[call.api] || call.api}</span>
                      </span>
                    </td>
                    <td className="py-2 px-4 text-gray-400 max-w-[200px] truncate">{call.endpoint || "\u2014"}</td>
                    <td className="py-2 px-4 text-gray-400 max-w-[150px] truncate">{call.company || "\u2014"}</td>
                    <td className="py-2 px-4 text-right text-gray-300">{formatCost(call.cost)}</td>
                    <td className="py-2 px-4 text-center">
                      {call.success ? (
                        <span className="text-emerald-400">&#10003;</span>
                      ) : (
                        <span className="text-red-400" title={call.error || "Failed"}>&#10007;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
