"use client";

import { useEffect, useState, useCallback } from "react";

interface Metrics {
  totalIngested: number;
  passedHeadcount: number;
  passedLLM: number;
  statusCounts: Record<string, number>;
  classificationCounts: Record<string, number>;
  emailsDrafted: number;
  emailsSent: number;
  emailsOpened: number;
  openRate: number;
  hvtCount: number;
  pendingCount: number;
  months: { label: string; ingested: number; hvt: number; passed: number }[];
}

function StatCard({ label, value, subtext, color = "text-white" }: {
  label: string; value: string | number; subtext?: string; color?: string;
}) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
      {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
    </div>
  );
}

function FunnelBar({ label, value, maxValue, color }: {
  label: string; value: number; maxValue: number; color: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="w-44 text-sm text-gray-400 text-right shrink-0">{label}</div>
      <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <div className="w-12 text-sm text-gray-300 tabular-nums">{value}</div>
    </div>
  );
}

const passLabels: Record<string, string> = { PM: "Pass \u2014 Market", PL: "Pass \u2014 Location", PS: "Pass \u2014 Stage", PT: "Pass \u2014 Traction" };
const passColors: Record<string, string> = { PM: "text-red-400", PL: "text-orange-400", PS: "text-yellow-400", PT: "text-blue-400" };

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/metrics");
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      console.error("Failed to fetch metrics:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-gray-500">Loading metrics...</div></div>;
  if (!metrics) return <div className="flex items-center justify-center py-20"><div className="text-gray-500">Failed to load metrics.</div></div>;

  const maxFunnel = Math.max(metrics.totalIngested, metrics.passedHeadcount, metrics.passedLLM, metrics.hvtCount, 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Monthly Metrics</h1>
          <p className="text-gray-400 text-sm mt-1">Pipeline funnel and overall health.</p>
        </div>
        <button onClick={fetchMetrics} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors">Refresh</button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Ingested" value={metrics.totalIngested} subtext="From PitchBook" />
        <StatCard label="HVT Companies" value={metrics.hvtCount} color="text-emerald-400" />
        <StatCard label="In Review Queue" value={metrics.pendingCount} color="text-yellow-400" />
        <StatCard label="Email Open Rate" value={metrics.emailsSent > 0 ? `${metrics.openRate}%` : "N/A"} subtext={metrics.emailsSent > 0 ? `${metrics.emailsOpened} of ${metrics.emailsSent} opened` : "No emails sent yet"} />
      </div>

      {/* Funnel */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 mb-8">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-5">Pipeline Funnel</h3>
        <div className="space-y-3">
          <FunnelBar label="Companies Ingested" value={metrics.totalIngested} maxValue={maxFunnel} color="bg-gray-500" />
          <FunnelBar label="Passed HC Filter (8-30)" value={metrics.passedHeadcount} maxValue={maxFunnel} color="bg-blue-500" />
          <FunnelBar label="Passed LLM Filter" value={metrics.passedLLM} maxValue={maxFunnel} color="bg-purple-500" />
          <FunnelBar label="Classified as HVT" value={metrics.hvtCount} maxValue={maxFunnel} color="bg-emerald-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Classification breakdown */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Classification Breakdown</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-emerald-400 font-medium">HVT \u2014 High Value Target</span>
              <span className="text-sm text-gray-300 tabular-nums font-medium">{metrics.classificationCounts["HVT"] || 0}</span>
            </div>
            {["PM", "PL", "PS", "PT"].map((code) => (
              <div key={code} className="flex items-center justify-between">
                <span className={`text-sm ${passColors[code]}`}>{passLabels[code]}</span>
                <span className="text-sm text-gray-300 tabular-nums">{metrics.classificationCounts[code] || 0}</span>
              </div>
            ))}
            <div className="border-t border-gray-700 pt-3 mt-3 flex items-center justify-between">
              <span className="text-sm text-gray-400 font-medium">Total Classifications</span>
              <span className="text-sm text-white tabular-nums font-medium">{Object.values(metrics.classificationCounts).reduce((a, b) => a + b, 0)}</span>
            </div>
          </div>
        </div>

        {/* Outreach stats */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Outreach Activity</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Emails Drafted</span>
              <span className="text-sm text-gray-300 tabular-nums">{metrics.emailsDrafted}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Emails Sent</span>
              <span className="text-sm text-gray-300 tabular-nums">{metrics.emailsSent}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Emails Opened</span>
              <span className="text-sm text-emerald-400 tabular-nums">{metrics.emailsOpened}</span>
            </div>
            <div className="border-t border-gray-700 pt-3 mt-3 flex items-center justify-between">
              <span className="text-sm text-gray-400 font-medium">Open Rate</span>
              <span className="text-sm text-white tabular-nums font-medium">{metrics.emailsSent > 0 ? `${metrics.openRate}%` : "N/A"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Monthly Trend (Last 6 Months)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 px-3 font-medium text-gray-400">Month</th>
              <th className="text-right py-2 px-3 font-medium text-gray-400">Ingested</th>
              <th className="text-right py-2 px-3 font-medium text-gray-400">HVT</th>
              <th className="text-right py-2 px-3 font-medium text-gray-400">Passed</th>
            </tr>
          </thead>
          <tbody>
            {metrics.months.map((month) => (
              <tr key={month.label} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-2 px-3 text-gray-300">{month.label}</td>
                <td className="py-2 px-3 text-right text-gray-300 tabular-nums">{month.ingested}</td>
                <td className="py-2 px-3 text-right text-emerald-400 tabular-nums">{month.hvt}</td>
                <td className="py-2 px-3 text-right text-gray-400 tabular-nums">{month.passed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
