"use client";

import { useEffect, useState, useCallback } from "react";

interface PipelineRun {
  id: string;
  run_type: string;
  file_name: string | null;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  status: string;
  stats: {
    new?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
  } | null;
  error_message: string | null;
}

function formatRunType(type: string): string {
  const map: Record<string, string> = {
    pitchbook_ingest: "PitchBook Ingest",
    linkedin_scrape: "LinkedIn Scrape",
    llm_survey: "LLM Survey",
    competitor_research: "Competitor Research",
    crustdata_enrich: "Crust Data Enrichment",
    hvt_monitor: "HVT Weekly Monitor",
  };
  return map[type] || type;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "\u2014";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function IngestionsPage() {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ingestions");
      const data = await res.json();
      setRuns(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch ingestion runs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Compute summary stats
  const totalRuns = runs.length;
  const totalNew = runs.reduce((sum, r) => sum + (r.stats?.new || 0), 0);
  const totalErrors = runs.reduce((sum, r) => sum + (r.stats?.errors || 0), 0);
  const failedRuns = runs.filter((r) => r.status === "failed").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Ingestion History</h1>
          <p className="text-gray-400 text-sm mt-1">Track all pipeline runs and their results.</p>
        </div>
        <button onClick={fetchRuns} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors">
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
          <div className="text-2xl font-bold text-white">{totalRuns}</div>
          <div className="text-xs text-gray-500 mt-1">Total Runs</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
          <div className="text-2xl font-bold text-emerald-400">{totalNew}</div>
          <div className="text-xs text-gray-500 mt-1">Companies Added</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
          <div className="text-2xl font-bold text-red-400">{totalErrors}</div>
          <div className="text-xs text-gray-500 mt-1">Total Errors</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
          <div className="text-2xl font-bold text-yellow-400">{failedRuns}</div>
          <div className="text-xs text-gray-500 mt-1">Failed Runs</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500">Loading ingestion history...</div>
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <p className="text-lg font-medium">No ingestion runs yet</p>
          <p className="text-sm mt-1">Upload a PitchBook file on the Do for Review page to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="text-left py-3 px-4 font-medium text-gray-400">Date</th>
                <th className="text-left py-3 px-4 font-medium text-gray-400">Run Type</th>
                <th className="text-left py-3 px-4 font-medium text-gray-400">File</th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">New</th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">Updated</th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">Skipped</th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">Errors</th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">Duration</th>
                <th className="text-center py-3 px-4 font-medium text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-gray-800/50 hover:bg-gray-900/30 transition-colors">
                  <td className="py-3 px-4 text-gray-300 whitespace-nowrap">{formatDate(run.started_at)}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-indigo-900/50 text-indigo-300">
                      {formatRunType(run.run_type)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-400 max-w-48 truncate" title={run.file_name || ""}>
                    {run.file_name || "\u2014"}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-emerald-400 font-medium">
                    {run.stats?.new ?? "\u2014"}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-blue-400">
                    {run.stats?.updated ?? "\u2014"}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-gray-500">
                    {run.stats?.skipped ?? "\u2014"}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-red-400">
                    {run.stats?.errors ?? "\u2014"}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-gray-400">
                    {formatDuration(run.duration_seconds)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                      run.status === "completed" ? "bg-emerald-900/50 text-emerald-300" :
                      run.status === "running" ? "bg-blue-900/50 text-blue-300" :
                      "bg-red-900/50 text-red-300"
                    }`}>
                      {run.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
