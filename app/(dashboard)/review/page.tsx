"use client";

import { useEffect, useState, useCallback } from "react";

type Classification = "HVT" | "PM" | "PS" | "PT" | "PL";

interface ReviewCompany {
  id: string;
  pitchbook_id: string;
  status: string;
  review_count: number;
  snapshot: {
    name: string | null;
    website: string | null;
    linkedin_url: string | null;
    pitchbook_url: string | null;
    founded_year: number | null;
    location: string | null;
    headcount: number | null;
    headcount_growth_1yr: number | null;
    total_capital_raised: number | null;
    last_round_valuation: number | null;
    what_they_do: string | null;
  } | null;
}

const classificationOptions: {
  value: Classification;
  label: string;
  color: string;
}[] = [
  { value: "HVT", label: "HVT", color: "text-emerald-400" },
  { value: "PM", label: "PM", color: "text-red-400" },
  { value: "PL", label: "PL", color: "text-orange-400" },
  { value: "PS", label: "PS", color: "text-yellow-400" },
  { value: "PT", label: "PT", color: "text-blue-400" },
];

function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  if (amount >= 1_000_000_000)
    return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

export default function ReviewPage() {
  const [companies, setCompanies] = useState<ReviewCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Record<string, Classification>>({});

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/review");
      const data = await res.json();
      setCompanies(data);
      setSelected({});
    } catch (err) {
      console.error("Failed to fetch companies:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleSelect = (companyId: string, classification: Classification) => {
    setSelected((prev) => {
      // Toggle off if already selected
      if (prev[companyId] === classification) {
        const next = { ...prev };
        delete next[companyId];
        return next;
      }
      return { ...prev, [companyId]: classification };
    });
  };

  const handleSubmit = async () => {
    const entries = Object.entries(selected);
    if (entries.length === 0) return;

    setSubmitting(true);
    try {
      const results = await Promise.all(
        entries.map(([companyId, classification]) =>
          fetch("/api/review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companyId, classification }),
          })
        )
      );

      const allOk = results.every((r) => r.ok);
      if (!allOk) throw new Error("Some classifications failed");

      // Remove classified companies from the list
      const classifiedIds = new Set(entries.map(([id]) => id));
      setCompanies((prev) => prev.filter((c) => !classifiedIds.has(c.id)));
      setSelected({});
    } catch (err) {
      console.error("Failed to submit classifications:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCount = Object.keys(selected).length;

  const formatGrowth = (growth: number | null) => {
    if (growth === null || growth === undefined) return "—";
    const pct = (growth * 100).toFixed(0);
    const isPositive = growth > 0;
    return (
      <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
        {isPositive ? "+" : ""}
        {pct}%
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Do for Review</h1>
          <p className="text-gray-400 text-sm mt-1">
            Classify companies that have passed all pipeline filters.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {companies.length}{" "}
            {companies.length === 1 ? "company" : "companies"} in queue
          </span>
          <button
            onClick={fetchCompanies}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
          >
            Refresh
          </button>
          {selectedCount > 0 && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:text-emerald-300 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting
                ? "Submitting..."
                : `Submit ${selectedCount} ${selectedCount === 1 ? "Classification" : "Classifications"}`}
            </button>
          )}
        </div>
      </div>

      {/* Classification Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span className="font-medium text-gray-400">Classifications:</span>
        <span>
          <span className="text-emerald-400 font-medium">HVT</span> High Value
          Target
        </span>
        <span>
          <span className="text-red-400 font-medium">PM</span> Pass — Market
        </span>
        <span>
          <span className="text-orange-400 font-medium">PL</span> Pass —
          Location
        </span>
        <span>
          <span className="text-yellow-400 font-medium">PS</span> Pass — Stage
          <span className="text-gray-600 ml-1">(3mo requeue)</span>
        </span>
        <span>
          <span className="text-blue-400 font-medium">PT</span> Pass — Traction
          <span className="text-gray-600 ml-1">(3mo requeue)</span>
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500">Loading companies...</div>
        </div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <span className="text-4xl mb-3">✓</span>
          <p className="text-lg font-medium">Review queue is empty</p>
          <p className="text-sm mt-1">All companies have been classified.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="text-left py-3 px-4 font-medium text-gray-400">
                  #
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-400">
                  Company
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-400">
                  Founded
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-400">
                  Location
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">
                  HC
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">
                  1yr Growth
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">
                  Raised
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">
                  Last Val.
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-400 max-w-xs">
                  What They Do
                </th>
                <th className="text-center py-3 px-4 font-medium text-gray-400">
                  Classification
                </th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company, index) => {
                const s = company.snapshot;
                const currentSelection = selected[company.id];

                return (
                  <tr
                    key={company.id}
                    className={`border-b border-gray-800/50 transition-all duration-200 ${
                      currentSelection
                        ? "bg-gray-900/40"
                        : "hover:bg-gray-900/30"
                    }`}
                  >
                    {/* Row number */}
                    <td className="py-3 px-4 text-gray-600 tabular-nums">
                      {index + 1}
                    </td>

                    {/* Company name + PB/LI links + review count */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {s?.website ? (
                          <a
                            href={s.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white font-medium hover:text-blue-400 transition-colors"
                          >
                            {s?.name || "Unknown"}
                          </a>
                        ) : (
                          <span className="text-white font-medium">
                            {s?.name || "Unknown"}
                          </span>
                        )}
                        {s?.pitchbook_url && (
                          <a
                            href={s.pitchbook_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-1 py-0.5 text-[10px] font-bold rounded bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
                            title="View on PitchBook"
                          >
                            PB
                          </a>
                        )}
                        {s?.linkedin_url && (
                          <a
                            href={s.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-1 py-0.5 text-[10px] font-bold rounded bg-gray-700 text-blue-400 hover:bg-gray-600 hover:text-blue-300 transition-colors"
                            title="View on LinkedIn"
                          >
                            LI
                          </a>
                        )}
                        {company.review_count > 0 && (
                          <span
                            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-700 text-gray-300 text-xs font-medium"
                            title={`Reviewed ${company.review_count} time${company.review_count === 1 ? "" : "s"} before`}
                          >
                            {company.review_count}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Founded */}
                    <td className="py-3 px-4 text-gray-400">
                      {s?.founded_year || "—"}
                    </td>

                    {/* Location */}
                    <td className="py-3 px-4 text-gray-400">
                      {s?.location || "—"}
                    </td>

                    {/* Headcount */}
                    <td className="py-3 px-4 text-right text-gray-300 tabular-nums">
                      {s?.headcount || "—"}
                    </td>

                    {/* Growth */}
                    <td className="py-3 px-4 text-right tabular-nums">
                      {formatGrowth(s?.headcount_growth_1yr ?? null)}
                    </td>

                    {/* Raised to Date */}
                    <td className="py-3 px-4 text-right text-gray-300 tabular-nums">
                      {formatMoney(s?.total_capital_raised)}
                    </td>

                    {/* Last Round Valuation */}
                    <td className="py-3 px-4 text-right text-gray-300 tabular-nums">
                      {formatMoney(s?.last_round_valuation)}
                    </td>

                    {/* What they do */}
                    <td className="py-3 px-4 text-gray-400 max-w-xs">
                      <p className="line-clamp-2 text-xs leading-relaxed">
                        {s?.what_they_do || "—"}
                      </p>
                    </td>

                    {/* Classification radio buttons */}
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        {classificationOptions.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() =>
                              handleSelect(company.id, opt.value)
                            }
                            disabled={submitting}
                            className={`px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                              currentSelection === opt.value
                                ? `${opt.color} bg-gray-700 ring-1 ring-current`
                                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                            } ${submitting ? "cursor-not-allowed opacity-50" : ""}`}
                            title={opt.label}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
