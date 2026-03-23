"use client";

import React, { useEffect, useState, useCallback } from "react";

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
    pb_hq_city: string | null;
    headcount: number | null;
    headcount_error: boolean | null;
    headcount_growth_1yr: number | null;
    total_capital_raised: number | null;
    last_round_valuation: number | null;
    what_they_do: string | null;
    pb_description: string | null;
    offering_type: string[] | null;
    customer_type: string[] | null;
    market_focus: string | null;
    naics_3digit_name: string | null;
    product_category: string | null;
    revenue_model: string[] | null;
    vertical_type: string | null;
    disfavored_vertical: string | null;
    is_subsidiary: boolean | null;
    customers_named: string[] | null;
    success_indicators_present: boolean | null;
    agentic_features_present: boolean | null;
    agentic_feature_types: string[] | null;
    passed_headcount_filter: boolean | null;
    passed_llm_filter: boolean | null;
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
  if (amount === null || amount === undefined) return "\u2014";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function CompanyRow({
  company,
  index,
  selected,
  onSelect,
  submitting,
  expandedRow,
  onToggleExpand,
  dimmed,
  overrideSlot,
}: {
  company: ReviewCompany;
  index: number;
  selected: Record<string, Classification>;
  onSelect: (id: string, c: Classification) => void;
  submitting: boolean;
  expandedRow: string | null;
  onToggleExpand: (id: string) => void;
  dimmed?: boolean;
  overrideSlot?: React.ReactNode;
}) {
  const s = company.snapshot;
  const currentSelection = selected[company.id];

  const formatGrowth = (growth: number | null) => {
    if (growth === null || growth === undefined) return "\u2014";
    const pct = (growth * 100).toFixed(0);
    const isPositive = growth > 0;
    return (
      <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
        {isPositive ? "+" : ""}{pct}%
      </span>
    );
  };

  // Determine fail reason for dimmed rows
  const getFailReason = (): string | null => {
    if (!s) return "No data";
    if (s.passed_headcount_filter === false) {
      if (s.headcount_error) return "HC: N/A";
      return `HC: ${s.headcount ?? "?"} (outside 8-30)`;
    }
    if (s.passed_llm_filter === false) {
      const reasons: string[] = [];
      const ot = s.offering_type || [];
      const ct = s.customer_type || [];
      if (!ot.includes("Software")) reasons.push("Not software");
      if (!ct.includes("Business")) reasons.push("Not B2B");
      if (s.disfavored_vertical) reasons.push("Disfavored vertical");
      if (ot.length === 1 && ot[0] === "Services") reasons.push("Services-only");
      if (ot.length === 1 && ot[0] === "Marketplace") reasons.push("Pure marketplace");
      if (s.is_subsidiary) reasons.push("Subsidiary");
      return reasons.length > 0 ? reasons.join(" · ") : "Failed LLM";
    }
    return null;
  };

  const failReason = dimmed ? getFailReason() : null;

  return (
    <React.Fragment>
      <tr className={`border-b border-gray-800/50 transition-all duration-200 ${dimmed ? "opacity-50" : ""} ${currentSelection ? "bg-gray-900/40" : "hover:bg-gray-900/30"}`}>
        <td className="py-3 px-4 text-gray-600 tabular-nums">{index + 1}</td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {s?.website ? (
              <a href={s.website.startsWith("http") ? s.website : `https://${s.website}`} target="_blank" rel="noopener noreferrer" className="text-white font-medium hover:text-blue-400 transition-colors">{s?.name || "Unknown"}</a>
            ) : (
              <span className="text-white font-medium">{s?.name || "Unknown"}</span>
            )}
            {s?.pitchbook_url && (
              <a href={s.pitchbook_url} target="_blank" rel="noopener noreferrer" className="px-1 py-0.5 text-[10px] font-bold rounded bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors" title="View on PitchBook">PB</a>
            )}
            {s?.linkedin_url && (
              <a href={s.linkedin_url} target="_blank" rel="noopener noreferrer" className="px-1 py-0.5 text-[10px] font-bold rounded bg-gray-700 text-blue-400 hover:bg-gray-600 hover:text-blue-300 transition-colors" title="View on LinkedIn">LI</a>
            )}
            {company.review_count > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-700 text-gray-300 text-xs font-medium" title={`Reviewed ${company.review_count} time${company.review_count === 1 ? "" : "s"} before`}>{company.review_count}</span>
            )}
          </div>
        </td>
        <td className="py-3 px-4 text-gray-400">{s?.founded_year || "\u2014"}</td>
        <td className="py-3 px-4 text-gray-400">{s?.pb_hq_city || s?.location || "\u2014"}</td>
        <td className="py-3 px-4 text-right tabular-nums">
          {s?.headcount_error ? (
            <span className="text-amber-400 font-medium" title="LinkedIn scrape failed — headcount not available">N/A</span>
          ) : s?.headcount ? (
            <span className="text-gray-300">{s.headcount}</span>
          ) : (
            <span className="text-gray-600">{"\u2014"}</span>
          )}
        </td>
        <td className="py-3 px-4 text-right tabular-nums">{formatGrowth(s?.headcount_growth_1yr ?? null)}</td>
        <td className="py-3 px-4 text-right text-gray-300 tabular-nums">{formatMoney(s?.total_capital_raised)}</td>
        <td className="py-3 px-4 text-right text-gray-300 tabular-nums">{formatMoney(s?.last_round_valuation)}</td>
        <td className="py-3 px-4 text-gray-400 max-w-xs cursor-pointer" onClick={() => onToggleExpand(company.id)} title="Click to expand survey details">
          <p className="line-clamp-2 text-xs leading-relaxed">{s?.what_they_do || s?.pb_description || "\u2014"}</p>
        </td>
        <td className="py-3 px-4 text-center">
          {s?.market_focus ? (
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.market_focus === "Vertical" ? "bg-purple-900/50 text-purple-300" : s.market_focus === "Horizontal" ? "bg-cyan-900/50 text-cyan-300" : "bg-gray-800 text-gray-400"}`} title={s.vertical_type ? `${s.vertical_type}${s.naics_3digit_name ? ` \u2014 ${s.naics_3digit_name}` : ""}` : undefined}>
              {s.market_focus === "Vertical" ? "V" : s.market_focus === "Horizontal" ? "H" : "?"}
            </span>
          ) : <span className="text-gray-600">{"\u2014"}</span>}
        </td>
        <td className="py-3 px-4 text-center">
          {s?.agentic_features_present === true ? (
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" title={s.agentic_feature_types?.join(", ") || "Agentic features present"} />
          ) : <span className="text-gray-600 text-xs">{"\u2014"}</span>}
        </td>
        {dimmed && (
          <td className="py-3 px-4 text-center">
            {failReason && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-900/50 text-red-400">{failReason}</span>
            )}
          </td>
        )}
        {overrideSlot}
        <td className="py-3 px-4">
          <div className="flex items-center justify-center gap-1">
            {classificationOptions.map((opt) => (
              <button key={opt.value} onClick={() => onSelect(company.id, opt.value)} disabled={submitting} className={`px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer ${currentSelection === opt.value ? `${opt.color} bg-gray-700 ring-1 ring-current` : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"} ${submitting ? "cursor-not-allowed opacity-50" : ""}`} title={opt.label}>
                {opt.label}
              </button>
            ))}
          </div>
        </td>
      </tr>
      {expandedRow === company.id && s && (
        <tr className="bg-gray-900/60">
          <td colSpan={12} className="py-4 px-8">
            <div className="grid grid-cols-4 gap-4 text-xs">
              <div><span className="text-gray-500 block mb-1">Offering</span><span className="text-gray-300">{s.offering_type?.join(", ") || "\u2014"}</span></div>
              <div><span className="text-gray-500 block mb-1">Customer Type</span><span className="text-gray-300">{s.customer_type?.join(", ") || "\u2014"}</span></div>
              <div><span className="text-gray-500 block mb-1">Product Category</span><span className="text-gray-300">{s.product_category || "\u2014"}</span></div>
              <div><span className="text-gray-500 block mb-1">Revenue Model</span><span className="text-gray-300">{s.revenue_model?.join(", ") || "\u2014"}</span></div>
              <div><span className="text-gray-500 block mb-1">Market / Vertical</span><span className="text-gray-300">{s.market_focus || "\u2014"}{s.vertical_type ? ` (${s.vertical_type})` : ""}</span></div>
              <div><span className="text-gray-500 block mb-1">NAICS</span><span className="text-gray-300">{s.naics_3digit_name || "\u2014"}</span></div>
              <div><span className="text-gray-500 block mb-1">Success Signals</span><span className="text-gray-300">{s.success_indicators_present ? "Yes" : "No"}</span></div>
              <div><span className="text-gray-500 block mb-1">Agentic</span><span className="text-gray-300">{s.agentic_features_present ? (s.agentic_feature_types?.join(", ") || "Yes") : "No"}</span></div>
              {s.customers_named && s.customers_named.length > 0 && (
                <div className="col-span-4"><span className="text-gray-500 block mb-1">Named Customers</span><span className="text-gray-300">{s.customers_named.join(", ")}</span></div>
              )}
              {s.disfavored_vertical && (
                <div className="col-span-4"><span className="text-red-400 text-xs font-medium">Disfavored vertical: {s.disfavored_vertical}</span></div>
              )}
              {s.pb_description && (
                <div className="col-span-4"><span className="text-gray-500 block mb-1">PitchBook Description</span><span className="text-gray-300">{s.pb_description}</span></div>
              )}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

export default function ReviewPage() {
  const [companies, setCompanies] = useState<ReviewCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Record<string, Classification>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showPassed, setShowPassed] = useState(true);
  const [showFailed, setShowFailed] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [pendingSelected, setPendingSelected] = useState<Set<string>>(new Set());
  const [runningEval, setRunningEval] = useState(false);
  const [evalLogs, setEvalLogs] = useState<string[]>([]);
  const [failedSort, setFailedSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [failedReasonFilter, setFailedReasonFilter] = useState<string | null>(null);
  const [passedSort, setPassedSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [lastIngest, setLastIngest] = useState<{ last_run_at: string | null; stats: { new: number; updated: number; skipped: number; errors: number } | null; file_name?: string } | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  const [ingestLogs, setIngestLogs] = useState<string[]>([]);
  const [ingestSummary, setIngestSummary] = useState<{ new: number; updated: number; skipped: number; errors: number; hc_passed?: number; llm_passed?: number; llm_failed?: number; duration_seconds: number; file_name: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const logPanelRef = React.useRef<HTMLDivElement>(null);

  // Fetch last ingest metadata
  const fetchIngestMeta = useCallback(async () => {
    try {
      const res = await fetch("/api/ingest");
      const data = await res.json();
      setLastIngest(data);
    } catch {}
  }, []);

  const handleIngest = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIngesting(true);
    setIngestStatus(`Running full pipeline on ${file.name}... (ingest → LinkedIn HC → LLM survey)`);
    setIngestLogs([]);
    setIngestSummary(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(600000), // 10 minute timeout for large files
      });
      const data = await res.json();

      if (res.ok && data.success) {
        // Show logs from the pipeline
        if (data.logs && data.logs.length > 0) {
          setIngestLogs(data.logs);
        }
        setIngestSummary({
          ...data.stats,
          duration_seconds: data.duration_seconds,
          file_name: data.file_name,
        });
        const s = data.stats;
        setIngestStatus(`Pipeline complete: ${s.new} ingested, ${s.hc_passed || 0} passed HC, ${s.llm_passed || 0} passed LLM → ready for review`);
        fetchCompanies();
        fetchIngestMeta();
      } else {
        setIngestStatus(`Ingest failed: ${data.error}`);
      }
    } catch (err) {
      console.error("Ingest failed:", err);
      setIngestStatus("Ingest failed");
    } finally {
      setIngesting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/review?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      console.log("[Review] API returned", Array.isArray(data) ? data.length : 0, "companies");
      setCompanies(Array.isArray(data) ? data : []);
      setSelected({});
    } catch (err) {
      console.error("Failed to fetch companies:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);
  useEffect(() => { fetchIngestMeta(); }, [fetchIngestMeta]);

  // Split companies: passed = both HC and LLM are explicitly true
  // Failed/filtered = either filter is false, or not yet evaluated (null)
  const passedCompanies = companies.filter((c) => {
    if (overrides.has(c.id)) return true;
    const s = c.snapshot;
    if (!s) return false;
    return s.passed_headcount_filter === true && s.passed_llm_filter === true;
  });

  const failedCompaniesRaw = companies.filter((c) => {
    if (overrides.has(c.id)) return false;
    const s = c.snapshot;
    if (!s) return false;
    // Only show companies that explicitly FAILED a filter (not pending evaluation)
    return s.passed_headcount_filter === false || s.passed_llm_filter === false;
  });

  // Pending evaluation companies (not yet scraped/surveyed)
  const pendingEvalCompanies = companies.filter((c) => {
    const s = c.snapshot;
    if (!s) return false;
    return (s.passed_headcount_filter === null || s.passed_llm_filter === null)
      && s.passed_headcount_filter !== false && s.passed_llm_filter !== false;
  });
  const pendingEvalCount = pendingEvalCompanies.length;

  // Sort helper
  const getSortValue = (c: ReviewCompany, key: string): string | number => {
    const s = c.snapshot;
    if (!s) return "";
    switch (key) {
      case "name": return s.name || "";
      case "hq": return s.pb_hq_city || s.location || "";
      case "hc": return s.headcount ?? 0;
      case "founded": return s.founded_year ?? 0;
      case "growth": return s.headcount_growth_1yr ?? 0;
      case "raised": return s.total_capital_raised ?? 0;
      case "lastval": return s.last_round_valuation ?? 0;
      case "ingest_count": return c.review_count ?? 0;
      case "reason": {
        if (s.passed_headcount_filter === false) {
          if (s.headcount_error) return "A_HC N/A";
          return `B_HC ${String(s.headcount ?? 0).padStart(5, "0")}`;
        }
        if (s.passed_llm_filter === false) {
          const ot = s.offering_type || [];
          const ct = s.customer_type || [];
          if (!ot.includes("Software")) return "C_Not software";
          if (!ct.includes("Business")) return "D_Not B2B";
          if (s.disfavored_vertical) return "E_Disfavored";
          if (ot.length === 1 && ot[0] === "Services") return "F_Services-only";
          if (ot.length === 1 && ot[0] === "Marketplace") return "G_Marketplace";
          if (s.is_subsidiary) return "H_Subsidiary";
          return "I_Failed LLM";
        }
        return "Z_Unknown";
      }
      default: return "";
    }
  };

  const sortCompanies = (list: ReviewCompany[], sort: { key: string; dir: "asc" | "desc" }) => {
    return [...list].sort((a, b) => {
      const aVal = getSortValue(a, sort.key);
      const bVal = getSortValue(b, sort.key);
      const cmp = typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  };

  const sortedPassedCompanies = sortCompanies(passedCompanies, passedSort);

  // Categorize each failed company by primary reason
  const getReasonCategory = (c: ReviewCompany): string => {
    const s = c.snapshot;
    if (!s) return "Unknown";
    if (s.passed_headcount_filter === false) return "Headcount";
    if (s.passed_llm_filter === false) {
      const ot = s.offering_type || [];
      const ct = s.customer_type || [];
      if (!ot.includes("Software")) return "Not Software";
      if (!ct.includes("Business")) return "Not B2B";
      if (s.is_subsidiary) return "Subsidiary";
      if (s.disfavored_vertical) return "Disfavored Vertical";
      if (ot.length === 1 && ot[0] === "Services") return "Services-only";
      if (ot.length === 1 && ot[0] === "Marketplace") return "Marketplace";
      return "Other LLM Fail";
    }
    return "Pending";
  };

  // Count by reason
  const reasonCounts: Record<string, number> = {};
  for (const c of failedCompaniesRaw) {
    const reason = getReasonCategory(c);
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }

  // Apply reason filter
  const filteredFailedCompanies = failedReasonFilter
    ? failedCompaniesRaw.filter((c) => getReasonCategory(c) === failedReasonFilter)
    : failedCompaniesRaw;

  const failedCompanies = sortCompanies(filteredFailedCompanies, failedSort);

  const handlePassedSort = (key: string) => {
    setPassedSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  };

  const handleFailedSort = (key: string) => {
    setFailedSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  };

  const handleMoveToReview = (companyId: string) => {
    setOverrides((prev) => new Set(prev).add(companyId));
  };

  const handleSelect = (companyId: string, classification: Classification) => {
    setSelected((prev) => {
      if (prev[companyId] === classification) {
        const next = { ...prev };
        delete next[companyId];
        return next;
      }
      return { ...prev, [companyId]: classification };
    });
  };

  const [draftStatus, setDraftStatus] = useState<string | null>(null);

  const handleSubmit = async () => {
    const entries = Object.entries(selected);
    if (entries.length === 0) return;
    setSubmitting(true);
    setDraftStatus(null);

    // Count HVT selections
    const hvtCount = entries.filter(([, c]) => c === "HVT").length;
    if (hvtCount > 0) {
      setDraftStatus(`Classifying and drafting ${hvtCount} email${hvtCount > 1 ? "s" : ""}...`);
    }

    try {
      const responses = await Promise.all(
        entries.map(async ([companyId, classification]) => {
          const res = await fetch("/api/review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companyId, classification }),
          });
          return { companyId, classification, ok: res.ok, data: await res.json() };
        })
      );

      const allOk = responses.every((r) => r.ok);
      if (!allOk) throw new Error("Some classifications failed");

      // Check email draft results
      const hvtResults = responses.filter((r) => r.classification === "HVT");
      if (hvtResults.length > 0) {
        const drafted = hvtResults.filter((r) => r.data.emailDraft?.success);
        const failed = hvtResults.filter((r) => r.data.emailDraft?.error);
        if (drafted.length > 0 && failed.length === 0) {
          setDraftStatus(`${drafted.length} email draft${drafted.length > 1 ? "s" : ""} created in Gmail`);
        } else if (failed.length > 0) {
          setDraftStatus(`${drafted.length} drafted, ${failed.length} failed: ${failed[0].data.emailDraft.error}`);
        }
      }

      const classifiedIds = new Set(entries.map(([id]) => id));
      setCompanies((prev) => prev.filter((c) => !classifiedIds.has(c.id)));
      setSelected({});

      // Clear status after 5 seconds
      setTimeout(() => setDraftStatus(null), 5000);
    } catch (err) {
      console.error("Failed to submit classifications:", err);
      setDraftStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCount = Object.keys(selected).length;

  const handleToggleExpand = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Do for Review</h1>
          <p className="text-gray-400 text-sm mt-1">Classify companies that have passed all pipeline filters.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {passedCompanies.length} passed{failedCompaniesRaw.length > 0 ? ` · ${failedCompaniesRaw.length} filtered out` : ""}{pendingEvalCount > 0 ? ` · ${pendingEvalCount} not yet AI evaluated` : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={ingesting}
              className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-indigo-300 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {ingesting ? "Ingesting..." : "PitchBook Ingest"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleIngest}
              className="hidden"
            />
            {lastIngest?.last_run_at && (
              <span className="text-xs text-gray-500" title={`File: ${lastIngest.file_name || "unknown"}\nNew: ${lastIngest.stats?.new || 0}\nUpdated: ${lastIngest.stats?.updated || 0}\nSkipped: ${lastIngest.stats?.skipped || 0}`}>
                Last: {new Date(lastIngest.last_run_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            )}
          </div>
          <button onClick={fetchCompanies} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors">
            Refresh
          </button>
          {selectedCount > 0 && (
            <button onClick={handleSubmit} disabled={submitting} className="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:text-emerald-300 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed">
              {submitting ? "Submitting..." : `Submit ${selectedCount} ${selectedCount === 1 ? "Classification" : "Classifications"}`}
            </button>
          )}
        </div>
      </div>

      {draftStatus && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${draftStatus.includes("failed") ? "bg-red-900/30 text-red-300" : draftStatus.includes("created") ? "bg-emerald-900/30 text-emerald-300" : "bg-blue-900/30 text-blue-300"}`}>
          {draftStatus}
        </div>
      )}

      {(ingestStatus || ingestLogs.length > 0) && (
        <div className="mb-4 rounded-lg border border-gray-700 overflow-hidden">
          <div className={`px-4 py-2 text-sm flex items-center justify-between ${ingestStatus?.includes("failed") ? "bg-red-900/30 text-red-300" : ingestStatus?.includes("complete") ? "bg-emerald-900/30 text-emerald-300" : "bg-indigo-900/30 text-indigo-300"}`}>
            <div>
              {ingesting && <span className="inline-block w-3 h-3 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin mr-2 align-middle" />}
              {ingestStatus}
            </div>
            {ingestSummary && (
              <span className="text-xs text-gray-400">{ingestSummary.duration_seconds}s</span>
            )}
          </div>
          {ingestLogs.length > 0 && (
            <div ref={logPanelRef} className="bg-gray-950 px-4 py-2 max-h-48 overflow-y-auto font-mono text-xs text-gray-400 space-y-0.5">
              {ingestLogs.map((log, i) => (
                <div key={i} className={log.startsWith("ERROR") ? "text-red-400" : log.includes("Added") ? "text-emerald-400" : log.includes("Updated") ? "text-blue-400" : log.includes("Skipping") ? "text-gray-600" : ""}>
                  {log}
                </div>
              ))}
            </div>
          )}
          {ingestSummary && (
            <div className="bg-gray-900/50 px-4 py-3 border-t border-gray-800">
              <div className="grid grid-cols-7 gap-3 text-center">
                <div><div className="text-lg font-bold text-white">{ingestSummary.new}</div><div className="text-xs text-gray-500">Ingested</div></div>
                <div className="flex items-center justify-center text-gray-600">→</div>
                <div><div className="text-lg font-bold text-blue-400">{ingestSummary.hc_passed ?? "—"}</div><div className="text-xs text-gray-500">Passed HC</div></div>
                <div className="flex items-center justify-center text-gray-600">→</div>
                <div><div className="text-lg font-bold text-emerald-400">{ingestSummary.llm_passed ?? "—"}</div><div className="text-xs text-gray-500">Passed LLM</div></div>
                <div><div className="text-lg font-bold text-red-400">{ingestSummary.llm_failed ?? "—"}</div><div className="text-xs text-gray-500">Failed LLM</div></div>
                <div><div className="text-lg font-bold text-gray-500">{ingestSummary.errors}</div><div className="text-xs text-gray-500">Errors</div></div>
              </div>
              <div className="text-xs text-gray-600 text-center mt-2">Ingested → HC Filter (8-30) → LLM Survey → Ready for Review</div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span className="font-medium text-gray-400">Classifications:</span>
        <span><span className="text-emerald-400 font-medium">HVT</span> High Value Target</span>
        <span><span className="text-red-400 font-medium">PM</span> Pass — Market</span>
        <span><span className="text-orange-400 font-medium">PL</span> Pass — Location</span>
        <span><span className="text-yellow-400 font-medium">PS</span> Pass — Stage <span className="text-gray-600 ml-1">(3mo requeue)</span></span>
        <span><span className="text-blue-400 font-medium">PT</span> Pass — Traction <span className="text-gray-600 ml-1">(3mo requeue)</span></span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500">Loading companies...</div>
        </div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <p className="text-lg font-medium">Review queue is empty</p>
          <p className="text-sm mt-1">All companies have been classified.</p>
        </div>
      ) : (
        <>
          {/* Passed companies — collapsible */}
          <div className="mb-2">
            <button
              onClick={() => setShowPassed(!showPassed)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors w-full"
            >
              <span className={`transition-transform duration-200 ${showPassed ? "rotate-90" : ""}`}>&#9654;</span>
              <span className="font-medium">{passedCompanies.length} {passedCompanies.length === 1 ? "company" : "companies"} passed all filters</span>
              <span className="text-gray-600 text-xs ml-1">(ready for classification)</span>
            </button>
            {showPassed && (
              <div className="overflow-x-auto rounded-lg border border-gray-800 mt-1">
                <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  <th className="text-left py-3 px-4 font-medium text-gray-400">#</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-400 cursor-pointer hover:text-gray-200 select-none" onClick={() => handlePassedSort("name")}>
                    Company {passedSort.key === "name" ? (passedSort.dir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-400 cursor-pointer hover:text-gray-200 select-none" onClick={() => handlePassedSort("founded")}>
                    Founded {passedSort.key === "founded" ? (passedSort.dir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-400 cursor-pointer hover:text-gray-200 select-none" onClick={() => handlePassedSort("hq")}>
                    HQ City {passedSort.key === "hq" ? (passedSort.dir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-gray-400 cursor-pointer hover:text-gray-200 select-none" onClick={() => handlePassedSort("hc")}>
                    HC {passedSort.key === "hc" ? (passedSort.dir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-gray-400 cursor-pointer hover:text-gray-200 select-none" onClick={() => handlePassedSort("growth")}>
                    1yr Growth {passedSort.key === "growth" ? (passedSort.dir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-gray-400 cursor-pointer hover:text-gray-200 select-none" onClick={() => handlePassedSort("raised")}>
                    Raised {passedSort.key === "raised" ? (passedSort.dir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-gray-400 cursor-pointer hover:text-gray-200 select-none" onClick={() => handlePassedSort("lastval")}>
                    Last Val. {passedSort.key === "lastval" ? (passedSort.dir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-400 max-w-xs">What They Do</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-400">Market</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-400">Agentic</th>
                  <th className="text-center py-3 px-4 font-medium text-gray-400 cursor-pointer hover:text-gray-200 select-none" onClick={() => handlePassedSort("ingest_count")}>
                    Classification {passedSort.key === "ingest_count" ? (passedSort.dir === "asc" ? "▲" : "▼") : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPassedCompanies.map((company, index) => (
                  <CompanyRow
                    key={company.id}
                    company={company}
                    index={index}
                    selected={selected}
                    onSelect={handleSelect}
                    submitting={submitting}
                    expandedRow={expandedRow}
                    onToggleExpand={handleToggleExpand}
                  />
                ))}
              </tbody>
              </table>
              </div>
            )}
          </div>

          {/* Failed companies — collapsible */}
          {failedCompaniesRaw.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowFailed(!showFailed)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors w-full"
              >
                <span className={`transition-transform duration-200 ${showFailed ? "rotate-90" : ""}`}>&#9654;</span>
                <span>{failedCompaniesRaw.length} {failedCompaniesRaw.length === 1 ? "company" : "companies"} filtered out</span>
                <span className="text-gray-600 text-xs ml-1">(failed headcount or LLM filter)</span>
              </button>
              {showFailed && (
                <div>
                <div className="flex flex-wrap gap-2 px-4 py-2">
                  <button
                    onClick={() => setFailedReasonFilter(null)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!failedReasonFilter ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
                  >
                    All ({failedCompaniesRaw.length})
                  </button>
                  {Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                    <button
                      key={reason}
                      onClick={() => setFailedReasonFilter(failedReasonFilter === reason ? null : reason)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${failedReasonFilter === reason ? "bg-red-900 text-red-300 ring-1 ring-red-700" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}
                    >
                      {reason} ({count})
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-800/50 mt-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 bg-gray-900/30">
                        <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">#</th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs cursor-pointer hover:text-gray-300" onClick={() => handleFailedSort("name")}>
                          Company {failedSort.key === "name" ? (failedSort.dir === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs cursor-pointer hover:text-gray-300" onClick={() => handleFailedSort("founded")}>
                          Founded {failedSort.key === "founded" ? (failedSort.dir === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs cursor-pointer hover:text-gray-300" onClick={() => handleFailedSort("hq")}>
                          HQ City {failedSort.key === "hq" ? (failedSort.dir === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th className="text-right py-2 px-4 font-medium text-gray-500 text-xs cursor-pointer hover:text-gray-300" onClick={() => handleFailedSort("hc")}>
                          HC {failedSort.key === "hc" ? (failedSort.dir === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th className="text-right py-2 px-4 font-medium text-gray-500 text-xs cursor-pointer hover:text-gray-300" onClick={() => handleFailedSort("growth")}>
                          1yr Growth {failedSort.key === "growth" ? (failedSort.dir === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th className="text-right py-2 px-4 font-medium text-gray-500 text-xs cursor-pointer hover:text-gray-300" onClick={() => handleFailedSort("raised")}>
                          Raised {failedSort.key === "raised" ? (failedSort.dir === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th className="text-right py-2 px-4 font-medium text-gray-500 text-xs cursor-pointer hover:text-gray-300" onClick={() => handleFailedSort("lastval")}>
                          Last Val. {failedSort.key === "lastval" ? (failedSort.dir === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">What They Do</th>
                        <th className="text-center py-2 px-4 font-medium text-gray-500 text-xs cursor-pointer hover:text-gray-300" onClick={() => handleFailedSort("reason")}>
                          Reason {failedSort.key === "reason" ? (failedSort.dir === "asc" ? "▲" : "▼") : ""}
                        </th>
                        <th className="text-center py-2 px-4 font-medium text-gray-500 text-xs">Override</th>
                        <th className="text-center py-2 px-4 font-medium text-gray-500 text-xs">Classification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedCompanies.map((company, index) => (
                        <React.Fragment key={company.id}>
                          <CompanyRow
                            company={company}
                            index={passedCompanies.length + index}
                            selected={selected}
                            onSelect={handleSelect}
                            submitting={submitting}
                            expandedRow={expandedRow}
                            onToggleExpand={handleToggleExpand}
                            dimmed
                            overrideSlot={
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => handleMoveToReview(company.id)}
                                  className="px-2 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded transition-colors"
                                  title="Move this company to the review queue"
                                >
                                  → Review
                                </button>
                              </td>
                            }
                          />
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              )}
            </div>
          )}

          {/* Pending evaluation — 3rd collapsible section */}
          {pendingEvalCompanies.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowPending(!showPending)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors w-full"
              >
                <span className={`transition-transform duration-200 ${showPending ? "rotate-90" : ""}`}>&#9654;</span>
                <span>{pendingEvalCompanies.length} {pendingEvalCompanies.length === 1 ? "company" : "companies"} not yet AI evaluated</span>
                <span className="text-gray-600 text-xs ml-1">(awaiting LinkedIn scrape or LLM survey)</span>
              </button>
              {showPending && (
                <div>
                {pendingSelected.size > 0 && (
                  <div className="flex items-center gap-3 px-4 py-2">
                    <button
                      onClick={async () => {
                        setRunningEval(true);
                        setEvalLogs([]);
                        try {
                          const res = await fetch("/api/evaluate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ companyIds: Array.from(pendingSelected) }),
                          });
                          const reader = res.body?.getReader();
                          const decoder = new TextDecoder();
                          if (reader) {
                            let buffer = "";
                            while (true) {
                              const { done, value } = await reader.read();
                              if (done) break;
                              buffer += decoder.decode(value, { stream: true });
                              const lines = buffer.split("\n\n");
                              buffer = lines.pop() || "";
                              for (const line of lines) {
                                if (line.startsWith("data: ")) {
                                  const data = JSON.parse(line.slice(6));
                                  if (data.type === "processing") {
                                    setEvalLogs((prev) => [...prev, `Evaluating: ${data.name}...`]);
                                  } else if (data.type === "passed") {
                                    setEvalLogs((prev) => [...prev, `✓ ${data.name} — PASSED (${data.market} / ${data.vertical})`]);
                                  } else if (data.type === "failed") {
                                    setEvalLogs((prev) => [...prev, `✗ ${data.name} — FAILED (${data.reasons?.join(", ")})`]);
                                  } else if (data.type === "skip") {
                                    setEvalLogs((prev) => [...prev, `⚠ ${data.name} — Skipped: ${data.reason}`]);
                                  } else if (data.type === "error") {
                                    setEvalLogs((prev) => [...prev, `⚠ Error: ${data.reason}`]);
                                  } else if (data.type === "complete") {
                                    setEvalLogs((prev) => [...prev, `\nDone: ${data.passed} passed, ${data.failed} failed, ${data.errors} errors`]);
                                  }
                                }
                              }
                            }
                          }
                        } catch (err) {
                          setEvalLogs((prev) => [...prev, `Error: ${err}`]);
                        }
                        setRunningEval(false);
                        setPendingSelected(new Set());
                        // Refresh data
                        const res = await fetch(`/api/review?t=${Date.now()}`);
                        if (res.ok) setCompanies(await res.json());
                      }}
                      disabled={runningEval}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:text-purple-300 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      {runningEval ? "Evaluating..." : `Evaluate ${pendingSelected.size} Selected`}
                    </button>
                    <button
                      onClick={() => setPendingSelected(new Set())}
                      className="text-xs text-gray-500 hover:text-gray-300"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => {
                        const allIds = new Set(pendingEvalCompanies.map((c) => c.id));
                        setPendingSelected(allIds);
                      }}
                      className="text-xs text-gray-500 hover:text-gray-300"
                    >
                      Select All
                    </button>
                  </div>
                )}
                {evalLogs.length > 0 && (
                  <div className="mx-4 mb-2 p-3 bg-gray-950 border border-gray-800 rounded-lg max-h-40 overflow-y-auto text-xs font-mono">
                    {evalLogs.map((log, i) => (
                      <div key={i} className={`${log.startsWith("✓") ? "text-emerald-400" : log.startsWith("✗") ? "text-red-400" : log.startsWith("⚠") ? "text-amber-400" : "text-gray-400"}`}>{log}</div>
                    ))}
                  </div>
                )}
                <div className="overflow-x-auto rounded-lg border border-gray-800/50 mt-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 bg-gray-900/30">
                        <th className="py-2 px-4 w-8">
                          <input
                            type="checkbox"
                            checked={pendingSelected.size === pendingEvalCompanies.length && pendingEvalCompanies.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPendingSelected(new Set(pendingEvalCompanies.map((c) => c.id)));
                              } else {
                                setPendingSelected(new Set());
                              }
                            }}
                            className="accent-purple-500"
                          />
                        </th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">#</th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">Company</th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">Founded</th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">HQ City</th>
                        <th className="text-right py-2 px-4 font-medium text-gray-500 text-xs">PB Employees</th>
                        <th className="text-center py-2 px-4 font-medium text-gray-500 text-xs">LinkedIn Scraped</th>
                        <th className="text-center py-2 px-4 font-medium text-gray-500 text-xs">LLM Evaluated</th>
                        <th className="text-left py-2 px-4 font-medium text-gray-500 text-xs">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingEvalCompanies.map((company, index) => {
                        const s = company.snapshot;
                        const isChecked = pendingSelected.has(company.id);
                        return (
                          <tr key={company.id} className={`border-b border-gray-800/50 hover:opacity-80 ${isChecked ? "opacity-70 bg-purple-900/10" : "opacity-40"}`}>
                            <td className="py-2 px-4">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  const next = new Set(pendingSelected);
                                  if (isChecked) next.delete(company.id);
                                  else next.add(company.id);
                                  setPendingSelected(next);
                                }}
                                className="accent-purple-500"
                              />
                            </td>
                            <td className="py-2 px-4 text-gray-600 tabular-nums">{index + 1}</td>
                            <td className="py-2 px-4">
                              <span className="text-gray-300 font-medium">{s?.name || "—"}</span>
                            </td>
                            <td className="py-2 px-4 text-gray-400">{s?.founded_year || "—"}</td>
                            <td className="py-2 px-4 text-gray-400">{s?.pb_hq_city || s?.location || "—"}</td>
                            <td className="py-2 px-4 text-right text-gray-500 tabular-nums">{(s as Record<string, unknown>)?.pb_employees != null ? String((s as Record<string, unknown>).pb_employees) : "—"}</td>
                            <td className="py-2 px-4 text-center">
                              {s?.passed_headcount_filter !== null
                                ? <span className="text-emerald-400 text-xs">✓</span>
                                : <span className="text-yellow-500 text-xs">Pending</span>
                              }
                            </td>
                            <td className="py-2 px-4 text-center">
                              {s?.passed_llm_filter !== null
                                ? <span className="text-emerald-400 text-xs">✓</span>
                                : <span className="text-yellow-500 text-xs">Pending</span>
                              }
                            </td>
                            <td className="py-2 px-4 text-gray-500 max-w-xs">
                              <p className="line-clamp-1 text-xs">{s?.pb_description || s?.what_they_do || "—"}</p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
