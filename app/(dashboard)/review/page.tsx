"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";

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

// ── Column configuration ──────────────────────────────────────────────
interface ColumnDef {
  id: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  align?: "left" | "right" | "center";
  sortKey?: string; // if sortable, the key to use
}

const PASSED_COLUMNS: ColumnDef[] = [
  { id: "name", label: "Company", defaultWidth: 200, minWidth: 120, align: "left", sortKey: "name" },
  { id: "founded", label: "Founded", defaultWidth: 90, minWidth: 60, align: "left", sortKey: "founded" },
  { id: "hqCity", label: "HQ City", defaultWidth: 120, minWidth: 70, align: "left", sortKey: "hq" },
  { id: "hc", label: "HC", defaultWidth: 70, minWidth: 50, align: "right", sortKey: "hc" },
  { id: "growth", label: "1yr Growth", defaultWidth: 100, minWidth: 70, align: "right", sortKey: "growth" },
  { id: "raised", label: "Raised", defaultWidth: 100, minWidth: 70, align: "right", sortKey: "raised" },
  { id: "lastVal", label: "Last Val.", defaultWidth: 100, minWidth: 70, align: "right", sortKey: "lastval" },
  { id: "whatTheyDo", label: "What They Do", defaultWidth: 260, minWidth: 120, align: "left" },
  { id: "market", label: "Market", defaultWidth: 80, minWidth: 50, align: "center" },
  { id: "agentic", label: "Agentic", defaultWidth: 80, minWidth: 50, align: "center" },
];

const FAILED_COLUMNS: ColumnDef[] = [
  { id: "name", label: "Company", defaultWidth: 200, minWidth: 120, align: "left", sortKey: "name" },
  { id: "founded", label: "Founded", defaultWidth: 90, minWidth: 60, align: "left", sortKey: "founded" },
  { id: "hqCity", label: "HQ City", defaultWidth: 120, minWidth: 70, align: "left", sortKey: "hq" },
  { id: "hc", label: "HC", defaultWidth: 70, minWidth: 50, align: "right", sortKey: "hc" },
  { id: "growth", label: "1yr Growth", defaultWidth: 100, minWidth: 70, align: "right", sortKey: "growth" },
  { id: "raised", label: "Raised", defaultWidth: 100, minWidth: 70, align: "right", sortKey: "raised" },
  { id: "lastVal", label: "Last Val.", defaultWidth: 100, minWidth: 70, align: "right", sortKey: "lastval" },
  { id: "whatTheyDo", label: "What They Do", defaultWidth: 220, minWidth: 120, align: "left" },
  { id: "reason", label: "Reason", defaultWidth: 140, minWidth: 80, align: "center", sortKey: "reason" },
  { id: "override", label: "Override", defaultWidth: 90, minWidth: 70, align: "center" },
];

// Classification column is always last — not part of the reorderable set
const CLASSIFICATION_COL: ColumnDef = {
  id: "classification",
  label: "Classification",
  defaultWidth: 180,
  minWidth: 120,
  align: "center",
  sortKey: "ingest_count",
};

const LS_KEY_PREFIX = "review_cols_";

function loadColumnState(
  key: string,
  columns: ColumnDef[],
): { widths: Record<string, number>; order: string[] } {
  const defaults = {
    widths: Object.fromEntries(columns.map((c) => [c.id, c.defaultWidth])),
    order: columns.map((c) => c.id),
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(LS_KEY_PREFIX + key);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    // Validate: ensure all column ids are present
    const savedIds = new Set<string>(parsed.order ?? []);
    const defIds = new Set(columns.map((c) => c.id));
    // If column set changed, reset
    if (savedIds.size !== defIds.size || [...defIds].some((id) => !savedIds.has(id))) {
      return defaults;
    }
    return {
      widths: { ...defaults.widths, ...parsed.widths },
      order: parsed.order,
    };
  } catch {
    return defaults;
  }
}

function saveColumnState(
  key: string,
  widths: Record<string, number>,
  order: string[],
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY_PREFIX + key, JSON.stringify({ widths, order }));
  } catch { /* quota or SSR */ }
}

// ── useColumnControls hook ────────────────────────────────────────────
function useColumnControls(storageKey: string, columns: ColumnDef[]) {
  const [state, setState] = useState(() => loadColumnState(storageKey, columns));
  const { widths, order } = state;

  const setWidths = useCallback((next: Record<string, number>) => {
    setState((prev) => {
      const updated = { ...prev, widths: next };
      saveColumnState(storageKey, next, prev.order);
      return updated;
    });
  }, [storageKey]);

  const setOrder = useCallback((next: string[]) => {
    setState((prev) => {
      const updated = { ...prev, order: next };
      saveColumnState(storageKey, prev.widths, next);
      return updated;
    });
  }, [storageKey]);

  // Resize via mouse drag
  const startResize = useCallback(
    (colId: string, startX: number) => {
      const col = columns.find((c) => c.id === colId);
      if (!col) return;
      const startWidth = widths[colId] ?? col.defaultWidth;
      const onMove = (e: MouseEvent) => {
        const delta = e.clientX - startX;
        const newW = Math.max(col.minWidth, startWidth + delta);
        setWidths({ ...widths, [colId]: newW });
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [columns, widths, setWidths],
  );

  // Column reorder via pure mouse events (no HTML5 drag API)
  const dragRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const headerRefs = useRef<Map<string, HTMLElement>>(new Map());

  const registerHeaderRef = useCallback((colId: string, el: HTMLElement | null) => {
    if (el) headerRefs.current.set(colId, el);
    else headerRefs.current.delete(colId);
  }, []);

  const startReorder = useCallback(
    (colId: string, startX: number) => {
      dragRef.current = colId;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";

      const onMove = (e: MouseEvent) => {
        // Find which header the mouse is over
        let hoveredCol: string | null = null;
        headerRefs.current.forEach((el, id) => {
          const rect = el.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right) {
            hoveredCol = id;
          }
        });
        setDragOverId(hoveredCol && hoveredCol !== colId ? hoveredCol : null);
      };

      const onUp = (e: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";

        // Find drop target
        let targetCol: string | null = null;
        headerRefs.current.forEach((el, id) => {
          const rect = el.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right) {
            targetCol = id;
          }
        });

        const srcId = dragRef.current;
        if (srcId && targetCol && srcId !== targetCol) {
          const newOrder = [...order];
          const srcIdx = newOrder.indexOf(srcId);
          const tgtIdx = newOrder.indexOf(targetCol);
          if (srcIdx !== -1 && tgtIdx !== -1) {
            newOrder.splice(srcIdx, 1);
            newOrder.splice(tgtIdx, 0, srcId);
            setOrder(newOrder);
          }
        }

        dragRef.current = null;
        setDragOverId(null);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [order, setOrder],
  );

  return { widths, order, startResize, startReorder, registerHeaderRef, dragRef, dragOverId };
}

// ── Cell renderer ─────────────────────────────────────────────────────
function renderCell(
  colId: string,
  company: ReviewCompany,
  index: number,
  {
    expandedRow,
    onToggleExpand,
    selected,
    onSelect,
    submitting,
    dimmed,
    overrideSlot,
    handleMoveToReview,
  }: {
    expandedRow: string | null;
    onToggleExpand: (id: string) => void;
    selected: Record<string, Classification>;
    onSelect: (id: string, c: Classification) => void;
    submitting: boolean;
    dimmed?: boolean;
    overrideSlot?: React.ReactNode;
    handleMoveToReview?: (id: string) => void;
  },
): React.ReactNode {
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
      return reasons.length > 0 ? reasons.join(" \u00b7 ") : "Failed LLM";
    }
    return null;
  };

  switch (colId) {
    case "name":
      return (
        <td key={colId} className="py-3 px-4">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs mr-1 select-none">{expandedRow === company.id ? "\u25BE" : "\u25B8"}</span>
            {s?.website ? (
              <a href={s.website.startsWith("http") ? s.website : `https://${s.website}`} target="_blank" rel="noopener noreferrer" className="text-white font-medium hover:text-blue-400 transition-colors" onClick={(e) => e.stopPropagation()}>{s?.name || "Unknown"}</a>
            ) : (
              <span className="text-white font-medium">{s?.name || "Unknown"}</span>
            )}
            {s?.pitchbook_url && (
              <a href={s.pitchbook_url} target="_blank" rel="noopener noreferrer" className="px-1 py-0.5 text-[10px] font-bold rounded bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors" title="View on PitchBook" onClick={(e) => e.stopPropagation()}>PB</a>
            )}
            {s?.linkedin_url && (
              <a href={s.linkedin_url} target="_blank" rel="noopener noreferrer" className="px-1 py-0.5 text-[10px] font-bold rounded bg-gray-700 text-blue-400 hover:bg-gray-600 hover:text-blue-300 transition-colors" title="View on LinkedIn" onClick={(e) => e.stopPropagation()}>LI</a>
            )}
            {company.review_count > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-700 text-gray-300 text-xs font-medium" title={`Reviewed ${company.review_count} time${company.review_count === 1 ? "" : "s"} before`}>{company.review_count}</span>
            )}
          </div>
        </td>
      );

    case "founded":
      return <td key={colId} className="py-3 px-4 text-gray-400">{s?.founded_year || "\u2014"}</td>;

    case "hqCity":
      return <td key={colId} className="py-3 px-4 text-gray-400">{s?.pb_hq_city || s?.location || "\u2014"}</td>;

    case "hc":
      return (
        <td key={colId} className="py-3 px-4 text-right tabular-nums">
          {s?.headcount_error ? (
            <span className="text-amber-400 font-medium" title="LinkedIn scrape failed \u2014 headcount not available">N/A</span>
          ) : s?.headcount ? (
            <span className="text-gray-300">{s.headcount}</span>
          ) : (
            <span className="text-gray-600">{"\u2014"}</span>
          )}
        </td>
      );

    case "growth":
      return <td key={colId} className="py-3 px-4 text-right tabular-nums">{formatGrowth(s?.headcount_growth_1yr ?? null)}</td>;

    case "raised":
      return <td key={colId} className="py-3 px-4 text-right text-gray-300 tabular-nums">{formatMoney(s?.total_capital_raised)}</td>;

    case "lastVal":
      return <td key={colId} className="py-3 px-4 text-right text-gray-300 tabular-nums">{formatMoney(s?.last_round_valuation)}</td>;

    case "whatTheyDo":
      return (
        <td key={colId} className="py-3 px-4 text-gray-400 cursor-pointer overflow-hidden" onClick={() => onToggleExpand(company.id)} title="Click to expand survey details">
          <p className="line-clamp-2 text-xs leading-relaxed">{s?.what_they_do || s?.pb_description || "\u2014"}</p>
        </td>
      );

    case "market":
      return (
        <td key={colId} className="py-3 px-4 text-center">
          {s?.market_focus ? (
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.market_focus === "Vertical" ? "bg-purple-900/50 text-purple-300" : s.market_focus === "Horizontal" ? "bg-cyan-900/50 text-cyan-300" : "bg-gray-800 text-gray-400"}`} title={s.vertical_type ? `${s.vertical_type}${s.naics_3digit_name ? ` \u2014 ${s.naics_3digit_name}` : ""}` : undefined}>
              {s.market_focus === "Vertical" ? "V" : s.market_focus === "Horizontal" ? "H" : "?"}
            </span>
          ) : <span className="text-gray-600">{"\u2014"}</span>}
        </td>
      );

    case "agentic":
      return (
        <td key={colId} className="py-3 px-4 text-center">
          {s?.agentic_features_present === true ? (
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" title={s.agentic_feature_types?.join(", ") || "Agentic features present"} />
          ) : <span className="text-gray-600 text-xs">{"\u2014"}</span>}
        </td>
      );

    case "reason": {
      const failReason = getFailReason();
      return (
        <td key={colId} className="py-3 px-4 text-center">
          {failReason && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-900/50 text-red-400">{failReason}</span>
          )}
        </td>
      );
    }

    case "override":
      return (
        <td key={colId} className="py-3 px-4 text-center">
          {handleMoveToReview && (
            <button
              onClick={(e) => { e.stopPropagation(); handleMoveToReview(company.id); }}
              className="px-2 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 rounded transition-colors"
              title="Move this company to the review queue"
            >
              &rarr; Review
            </button>
          )}
        </td>
      );

    case "classification":
      return (
        <td key={colId} className="py-3 px-4">
          <div className="flex items-center justify-center gap-1">
            {classificationOptions.map((opt) => (
              <button key={opt.value} onClick={(e) => { e.stopPropagation(); onSelect(company.id, opt.value); }} disabled={submitting} className={`px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer ${currentSelection === opt.value ? `${opt.color} bg-gray-700 ring-1 ring-current` : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"} ${submitting ? "cursor-not-allowed opacity-50" : ""}`} title={opt.label}>
                {opt.label}
              </button>
            ))}
          </div>
        </td>
      );

    default:
      return <td key={colId} className="py-3 px-4" />;
  }
}

// ── CompanyRow ─────────────────────────────────────────────────────────
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
  columnOrder,
  handleMoveToReview,
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
  columnOrder: string[];
  handleMoveToReview?: (id: string) => void;
}) {
  const s = company.snapshot;
  const currentSelection = selected[company.id];
  const totalCols = columnOrder.length + 1; // +1 for classification

  return (
    <React.Fragment>
      <tr className={`border-b border-gray-800/50 transition-all duration-200 cursor-pointer ${dimmed ? "opacity-50" : ""} ${currentSelection ? "bg-gray-900/40" : "hover:bg-gray-900/30"}`} onClick={() => onToggleExpand(company.id)}>
        {columnOrder.map((colId) =>
          renderCell(colId, company, index, {
            expandedRow,
            onToggleExpand,
            selected,
            onSelect,
            submitting,
            dimmed,
            overrideSlot,
            handleMoveToReview,
          })
        )}
        {/* Classification is always last */}
        {renderCell("classification", company, index, {
          expandedRow,
          onToggleExpand,
          selected,
          onSelect,
          submitting,
          dimmed,
          overrideSlot,
          handleMoveToReview,
        })}
      </tr>
      {expandedRow === company.id && s && (() => {
        const cd = s.crustdata_enrichment as Record<string, unknown> | null;
        const hc = cd?.headcount as Record<string, unknown> | null;
        const wt = cd?.web_traffic as Record<string, unknown> | null;
        const funding = cd?.funding_and_investment as Record<string, unknown> | null;
        const founders = cd?.founders as Record<string, unknown> | null;
        const seoData = cd?.seo as Record<string, unknown> | null;
        const dms = cd?.decision_makers as Array<Record<string, unknown>> | null;
        const competitors_cd = cd?.competitors as Record<string, unknown> | null;
        const hcTimeseries = hc?.linkedin_headcount_timeseries as Array<Record<string, unknown>> | null;
        const wtTimeseries = wt?.monthly_visitors_timeseries as Array<Record<string, unknown>> | null;
        const rolePercent = hc?.linkedin_headcount_by_role_percent as Record<string, number> | null;
        const roleSixMo = hc?.linkedin_headcount_by_role_six_months_growth_percent as Record<string, number> | null;
        const fundingMilestones = funding?.funding_milestones_timeseries as Array<Record<string, unknown>> | null;
        const paidSeoComps = competitors_cd?.paid_seo_competitors_website_domains as string[] | null;
        const organicSeoComps = competitors_cd?.organic_seo_competitors_website_domains as string[] | null;

        const MiniBar = ({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) => (
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div className={`${color} h-1.5 rounded-full`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
          </div>
        );
        const Sparkline = ({ data, color = "#60a5fa" }: { data: number[]; color?: string }) => {
          if (!data || data.length < 2) return null;
          const min = Math.min(...data); const max = Math.max(...data); const range = max - min || 1;
          const w = 200; const h = 40;
          const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
          return <svg width={w} height={h} className="overflow-visible"><polyline fill="none" stroke={color} strokeWidth="1.5" points={points} /></svg>;
        };

        return (
        <tr className="bg-gray-900/60">
          <td colSpan={totalCols} className="py-4 px-6">
            {/* Row 1: Core Info — 4 panels */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
              {/* Panel 1: What They Do + Leadership */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">What They Do</h4>
                <p className="text-sm text-gray-300 leading-relaxed">{s.what_they_do || s.pb_description || "\u2014"}</p>
                <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-2 gap-2 text-[10px]">
                  <div><span className="text-gray-500 block">Offering</span><span className="text-gray-300">{s.offering_type?.join(", ") || "\u2014"}</span></div>
                  <div><span className="text-gray-500 block">Customer</span><span className="text-gray-300">{s.customer_type?.join(", ") || "\u2014"}</span></div>
                  <div><span className="text-gray-500 block">Revenue</span><span className="text-gray-300">{s.revenue_model?.join(", ") || "\u2014"}</span></div>
                  <div><span className="text-gray-500 block">Market</span><span className="text-gray-300">{s.market_focus || "\u2014"}{s.vertical_type ? ` (${s.vertical_type})` : ""}</span></div>
                  {s.agentic_features_present && <div><span className="text-gray-500 block">Agentic</span><span className="text-emerald-400">{s.agentic_feature_types?.join(", ") || "Yes"}</span></div>}
                  {s.success_indicators_present && <div><span className="text-gray-500 block">Traction</span><span className="text-emerald-400">Yes</span></div>}
                </div>
                {s.customers_named && s.customers_named.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-700">
                    <span className="text-[10px] text-gray-500 block mb-0.5">Named Customers</span>
                    <span className="text-[10px] text-gray-300">{s.customers_named.join(", ")}</span>
                  </div>
                )}
                {dms && dms.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-700">
                    <span className="text-[10px] text-gray-500 block mb-1">Leadership</span>
                    {dms.slice(0, 5).map((dm, i) => (
                      <div key={i} className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-gray-300">{dm.name as string}</span>
                        <span className="text-[9px] text-gray-500">{dm.title as string}</span>
                        {dm.location && <span className="text-[9px] text-gray-600">({dm.location as string})</span>}
                        {dm.linkedin_flagship_url && <a href={dm.linkedin_flagship_url as string} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-400" onClick={(e) => e.stopPropagation()}>LI</a>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Panel 2: Competitors */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Competitors</h4>
                {s.competitors && s.competitors.length > 0 ? (
                  <div className="space-y-2">
                    {s.competitors.map((comp: {name:string;source:string;rationale:string}, idx: number) => (
                      <div key={idx} className="border-l-2 border-gray-700 pl-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-200 font-medium">{comp.name}</span>
                          <span className={`text-[9px] px-1 py-0.5 rounded ${comp.source === "website_positioning" ? "bg-purple-900/50 text-purple-300" : comp.source === "market_overlap" ? "bg-blue-900/50 text-blue-300" : "bg-gray-700 text-gray-400"}`}>{comp.source?.replace("_", " ")}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{comp.rationale}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-500 italic">No competitors identified.</p>}
                {(paidSeoComps && paidSeoComps.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <span className="text-[10px] text-gray-500 block mb-1">SEO Competitors (Paid)</span>
                    <div className="flex flex-wrap gap-1">{paidSeoComps.slice(0, 5).map((c, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 bg-amber-900/30 text-amber-300 rounded">{c.trim()}</span>)}</div>
                  </div>
                )}
                {(organicSeoComps && organicSeoComps.length > 0) && (
                  <div className="mt-2">
                    <span className="text-[10px] text-gray-500 block mb-1">SEO Competitors (Organic)</span>
                    <div className="flex flex-wrap gap-1">{organicSeoComps.slice(0, 5).map((c, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-900/30 text-blue-300 rounded">{c.trim()}</span>)}</div>
                  </div>
                )}
              </div>

              {/* Panel 3: Survey Details (replaces Engagement History for non-HVT) */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Survey Details</h4>
                <div className="space-y-2 text-[10px]">
                  <div><span className="text-gray-500 block">NAICS</span><span className="text-gray-300">{s.naics_3digit_code} {s.naics_3digit_name || "\u2014"}</span></div>
                  <div><span className="text-gray-500 block">Product Category</span><span className="text-gray-300">{s.product_category || "\u2014"}</span></div>
                  {s.success_indicators && s.success_indicators.length > 0 && (
                    <div><span className="text-gray-500 block">Success Signals</span><span className="text-gray-300">{s.success_indicators.join("; ")}</span></div>
                  )}
                  {s.disfavored_vertical && (
                    <div><span className="text-red-400 font-medium">Disfavored: {s.disfavored_vertical}</span></div>
                  )}
                  {s.pb_description && s.pb_description !== s.what_they_do && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <span className="text-gray-500 block mb-0.5">PitchBook Description</span>
                      <span className="text-gray-400">{s.pb_description}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Panel 4: Market & TAM */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Market & TAM</h4>
                {s.icp_description ? (
                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] text-gray-500 block mb-1">Ideal Customer Profile</span>
                      <p className="text-sm text-gray-200 font-medium">{s.icp_description}</p>
                    </div>
                    {s.us_tam_customer_count != null && s.us_tam_customer_count > 0 && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-gray-500">US Customers</span>
                        <span className="text-sm font-medium text-white">{s.us_tam_customer_count.toLocaleString()}</span>
                      </div>
                    )}
                    {s.us_tam_customer_count_source && <p className="text-[10px] text-gray-500 -mt-1">{s.us_tam_customer_count_source}</p>}
                    {s.estimated_annual_contract_value != null && s.estimated_annual_contract_value > 0 && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-gray-500">Est. ACV</span>
                        <span className="text-sm font-medium text-white">{formatMoney(s.estimated_annual_contract_value)}/yr</span>
                      </div>
                    )}
                    {s.estimated_tam_usd != null && s.estimated_tam_usd > 0 && (
                      <div className="flex justify-between items-baseline pt-2 border-t border-gray-700">
                        <span className="text-xs text-gray-400 font-medium">US TAM</span>
                        <span className="text-lg font-bold text-emerald-400">{formatMoney(s.estimated_tam_usd)}</span>
                      </div>
                    )}
                  </div>
                ) : <p className="text-sm text-gray-500 italic">No market data yet.</p>}
              </div>
            </div>

            {/* Row 2: Crust Data Enrichment — 4 panels */}
            {cd ? (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Panel 5: Headcount Breakdown */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Headcount Breakdown</h4>
                  {hcTimeseries && hcTimeseries.length > 0 && (
                    <div className="mb-3">
                      <span className="text-[10px] text-gray-500 block mb-1">Historical Headcount</span>
                      <Sparkline data={hcTimeseries.map(t => (t.employee_count || t.headcount || t.value || 0) as number)} color="#34d399" />
                      <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                        <span>{hcTimeseries[0]?.date as string || ""}</span>
                        <span>{hcTimeseries[hcTimeseries.length - 1]?.date as string || ""}</span>
                      </div>
                    </div>
                  )}
                  {rolePercent && Object.keys(rolePercent).length > 0 && (
                    <div>
                      <span className="text-[10px] text-gray-500 block mb-1">Role Breakdown (%)</span>
                      {Object.entries(rolePercent).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([role, pct]) => (
                        <div key={role} className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-400 w-24 truncate">{role}</span>
                          <MiniBar value={pct} max={Math.max(...Object.values(rolePercent))} color="bg-emerald-500" />
                          <span className="text-[10px] text-gray-500 w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {roleSixMo && typeof roleSixMo === 'object' && Object.keys(roleSixMo).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <span className="text-[10px] text-gray-500 block mb-1">6M Growth by Department</span>
                      {Object.entries(roleSixMo).filter(([, v]) => v !== null).map(([dept, growth]) => (
                        <div key={dept} className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-gray-400 capitalize">{dept.replace("_", " ")}</span>
                          <span className={`text-[10px] font-medium ${(growth as number) > 0 ? "text-emerald-400" : (growth as number) < 0 ? "text-red-400" : "text-gray-500"}`}>
                            {(growth as number) > 0 ? "+" : ""}{(growth as number).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Panel 6: Web Traffic */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Web Traffic</h4>
                  {wt && (
                    <>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-xl font-bold text-white">{((wt.monthly_visitors as number) || 0).toLocaleString()}</span>
                        <span className="text-xs text-gray-500">monthly visitors</span>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        {wt.monthly_visitor_qoq_pct != null && (
                          <span className={`text-xs font-medium ${(wt.monthly_visitor_qoq_pct as number) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {(wt.monthly_visitor_qoq_pct as number) > 0 ? "+" : ""}{(wt.monthly_visitor_qoq_pct as number).toFixed(1)}% QoQ
                          </span>
                        )}
                        {wt.monthly_visitor_mom_pct != null && (
                          <span className={`text-xs font-medium ${(wt.monthly_visitor_mom_pct as number) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {(wt.monthly_visitor_mom_pct as number) > 0 ? "+" : ""}{(wt.monthly_visitor_mom_pct as number).toFixed(1)}% MoM
                          </span>
                        )}
                      </div>
                      {wtTimeseries && wtTimeseries.length > 0 && (
                        <div className="mb-3">
                          <Sparkline data={wtTimeseries.map(t => ((t.monthly_visitors ?? t.value ?? 0) as number))} color="#60a5fa" />
                        </div>
                      )}
                      <span className="text-[10px] text-gray-500 block mb-1">Traffic Sources</span>
                      {[
                        ["Direct", wt.traffic_source_direct_pct, "bg-blue-500"],
                        ["Search", wt.traffic_source_search_pct, "bg-emerald-500"],
                        ["Social", wt.traffic_source_social_pct, "bg-purple-500"],
                        ["Paid", wt.traffic_source_paid_referral_pct, "bg-amber-500"],
                        ["Referral", wt.traffic_source_referral_pct, "bg-cyan-500"],
                      ].filter(([, v]) => v != null).map(([label, pct, color]) => (
                        <div key={label as string} className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-400 w-14">{label as string}</span>
                          <MiniBar value={pct as number} max={100} color={color as string} />
                          <span className="text-[10px] text-gray-500 w-10 text-right">{(pct as number).toFixed(1)}%</span>
                        </div>
                      ))}
                    </>
                  )}
                  {!wt && <p className="text-sm text-gray-500 italic">No web traffic data.</p>}
                </div>

                {/* Panel 7: Funding & Investors */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Funding & Investors</h4>
                  {funding ? (
                    <>
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between"><span className="text-xs text-gray-500">Total Raised</span><span className="text-sm font-medium text-white">{formatMoney(funding.crunchbase_total_investment_usd as number)}</span></div>
                        <div className="flex justify-between"><span className="text-xs text-gray-500">Last Round</span><span className="text-xs text-gray-300 capitalize">{(funding.last_funding_round_type as string) || "\u2014"}</span></div>
                        <div className="flex justify-between"><span className="text-xs text-gray-500">Last Round Size</span><span className="text-xs text-gray-300">{formatMoney(funding.last_funding_round_investment_usd as number)}</span></div>
                        {funding.days_since_last_fundraise != null && <div className="flex justify-between"><span className="text-xs text-gray-500">Days Since Raise</span><span className="text-xs text-gray-300">{funding.days_since_last_fundraise as number}d</span></div>}
                      </div>
                      {funding.crunchbase_investors && (
                        <div><span className="text-[10px] text-gray-500 block mb-1">Investors</span><div className="flex flex-wrap gap-1">{(funding.crunchbase_investors as string[]).map((inv, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">{inv}</span>)}</div></div>
                      )}
                      {founders && (
                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <span className="text-[10px] text-gray-500 block mb-1">Founder Background</span>
                          {(() => {
                            const schools = Array.isArray(founders.founders_education_institute) ? founders.founders_education_institute as string[] : founders.founders_education_institute ? [founders.founders_education_institute as string] : [];
                            const degrees = Array.isArray(founders.founders_degree_name) ? founders.founders_degree_name as string[] : founders.founders_degree_name ? [founders.founders_degree_name as string] : [];
                            return schools.map((school, i) => <div key={i} className="flex items-center gap-2 mt-1"><span className="text-[10px] text-gray-300">{school}</span>{degrees[i] && <span className="text-[9px] text-gray-500">({degrees[i]})</span>}</div>);
                          })()}
                          {founders.founders_previous_companies && (
                            <div className="mt-2"><span className="text-[10px] text-gray-500 block mb-0.5">Previous Companies</span><div className="flex flex-wrap gap-1">{(Array.isArray(founders.founders_previous_companies) ? founders.founders_previous_companies as string[] : [founders.founders_previous_companies as string]).slice(0, 6).map((c, i) => <span key={i} className="text-[9px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">{c}</span>)}</div></div>
                          )}
                        </div>
                      )}
                    </>
                  ) : <p className="text-sm text-gray-500 italic">No funding data.</p>}
                </div>

                {/* Panel 8: SEO & Paid Search */}
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">SEO & Paid Search</h4>
                  {seoData ? (
                    <div className="space-y-2">
                      {seoData.monthly_google_ads_budget != null && <div className="flex justify-between"><span className="text-xs text-gray-500">Google Ads Budget</span><span className="text-sm font-medium text-amber-400">${((seoData.monthly_google_ads_budget as number)).toLocaleString()}/mo</span></div>}
                      {seoData.monthly_paid_clicks != null && <div className="flex justify-between"><span className="text-xs text-gray-500">Paid Clicks</span><span className="text-xs text-gray-300">{(seoData.monthly_paid_clicks as number).toLocaleString()}/mo</span></div>}
                      {seoData.monthly_organic_clicks != null && <div className="flex justify-between"><span className="text-xs text-gray-500">Organic Clicks</span><span className="text-xs text-gray-300">{(seoData.monthly_organic_clicks as number).toLocaleString()}/mo</span></div>}
                      {seoData.monthly_organic_value != null && <div className="flex justify-between"><span className="text-xs text-gray-500">Organic Value</span><span className="text-xs text-gray-300">${((seoData.monthly_organic_value as number)).toLocaleString()}/mo</span></div>}
                      {seoData.total_ads_purchased != null && <div className="flex justify-between"><span className="text-xs text-gray-500">Ads Running</span><span className="text-xs text-gray-300">{seoData.total_ads_purchased as number}</span></div>}
                      {seoData.total_organic_results != null && <div className="flex justify-between"><span className="text-xs text-gray-500">Organic Rankings</span><span className="text-xs text-gray-300">{(seoData.total_organic_results as number).toLocaleString()}</span></div>}
                      {seoData.newly_ranked_seo_keywords != null && <div className="flex justify-between"><span className="text-[10px] text-gray-500">New Keywords</span><span className="text-[10px] text-emerald-400">+{seoData.newly_ranked_seo_keywords as number}</span></div>}
                    </div>
                  ) : <p className="text-sm text-gray-500 italic">No SEO data.</p>}
                  {cd?.estimated_revenue_lower_bound_usd != null && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <span className="text-[10px] text-gray-500 block mb-1">Estimated Revenue</span>
                      <span className="text-sm text-white font-medium">{formatMoney(cd.estimated_revenue_lower_bound_usd as number)} - {formatMoney(cd.estimated_revenue_higher_bound_usd as number)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-xs text-gray-500 italic">No Crust Data enrichment yet. Classify as HVT to trigger enrichment.</p>
              </div>
            )}
          </td>
        </tr>
        );
      })()}
    </React.Fragment>
  );
}

// ── Resizable / Reorderable table header ──────────────────────────────
function TableHeader({
  columns,
  columnOrder,
  widths,
  sort,
  onSort,
  startResize,
  startReorder,
  registerHeaderRef,
  dragRef,
  dragOverId,
  classLabel,
  thClass,
}: {
  columns: ColumnDef[];
  columnOrder: string[];
  widths: Record<string, number>;
  sort: { key: string; dir: "asc" | "desc" };
  onSort: (key: string) => void;
  startResize: (colId: string, startX: number) => void;
  startReorder: (colId: string, startX: number) => void;
  registerHeaderRef: (colId: string, el: HTMLElement | null) => void;
  dragRef: React.RefObject<string | null>;
  dragOverId: string | null;
  classLabel?: string;
  thClass: string;
}) {
  const colMap = Object.fromEntries(columns.map((c) => [c.id, c]));

  return (
    <>
      <colgroup>
        {columnOrder.map((id) => (
          <col key={id} style={{ width: widths[id] ?? colMap[id]?.defaultWidth ?? 100 }} />
        ))}
        {/* classification col */}
        <col style={{ width: widths["classification"] ?? CLASSIFICATION_COL.defaultWidth }} />
      </colgroup>
      <thead>
        <tr className="border-b border-gray-800 bg-gray-900/50">
          {columnOrder.map((id) => {
            const col = colMap[id];
            if (!col) return null;
            const isSortable = !!col.sortKey;
            const isSorted = col.sortKey === sort.key;
            const isBeingDragged = dragRef.current === id;
            const isDropTarget = dragOverId === id && dragRef.current !== null && dragRef.current !== id;
            return (
              <th
                key={id}
                ref={(el) => registerHeaderRef(id, el)}
                className={`${thClass} relative group transition-all duration-150 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${isSortable ? "hover:text-gray-200 select-none" : ""} ${isBeingDragged ? "opacity-40 bg-gray-800" : ""} ${isDropTarget ? "bg-blue-900/30" : ""}`}
                style={{ position: "relative", cursor: isBeingDragged ? "grabbing" : "grab", borderLeft: isDropTarget ? "2px solid #60a5fa" : undefined }}
                onMouseDown={(e) => {
                  // Only start reorder on left click, not on resize handle
                  if ((e.target as HTMLElement).dataset.resizeHandle) return;
                  if (e.button !== 0) return;
                  // Distinguish click (sort) from drag (reorder) via movement threshold
                  const startX = e.clientX;
                  const startY = e.clientY;
                  let moved = false;
                  const onMove = (me: MouseEvent) => {
                    if (Math.abs(me.clientX - startX) > 5 || Math.abs(me.clientY - startY) > 5) {
                      moved = true;
                      document.removeEventListener("mousemove", onMove);
                      document.removeEventListener("mouseup", onClickUp);
                      startReorder(id, startX);
                    }
                  };
                  const onClickUp = () => {
                    document.removeEventListener("mousemove", onMove);
                    document.removeEventListener("mouseup", onClickUp);
                    if (!moved && isSortable && col.sortKey) {
                      onSort(col.sortKey);
                    }
                  };
                  document.addEventListener("mousemove", onMove);
                  document.addEventListener("mouseup", onClickUp);
                }}
              >
                {col.label}{" "}
                {isSorted ? (sort.dir === "asc" ? "\u25b2" : "\u25bc") : ""}
                {/* Resize handle */}
                <div
                  data-resize-handle="true"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    startResize(id, e.clientX);
                  }}
                  className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-blue-500/50 transition-opacity"
                />
              </th>
            );
          })}
          {/* Classification header — not draggable/reorderable */}
          <th className={`${thClass} text-center ${CLASSIFICATION_COL.sortKey ? "cursor-pointer hover:text-gray-200 select-none" : ""}`}
            onClick={CLASSIFICATION_COL.sortKey ? () => onSort(CLASSIFICATION_COL.sortKey!) : undefined}
          >
            {classLabel ?? CLASSIFICATION_COL.label}{" "}
            {CLASSIFICATION_COL.sortKey === sort.key ? (sort.dir === "asc" ? "\u25b2" : "\u25bc") : ""}
          </th>
        </tr>
      </thead>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
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
  const [pipelineStats, setPipelineStats] = useState<{
    total: number;
    linkedin: { scraped: number; passed: number; failed: number; remaining: number };
    llm: { total: number; evaluated: number; passed: number; failed: number; remaining: number };
  } | null>(null);
  const [lastIngest, setLastIngest] = useState<{ last_run_at: string | null; stats: { new: number; updated: number; skipped: number; errors: number } | null; file_name?: string } | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  const [ingestLogs, setIngestLogs] = useState<string[]>([]);
  const [ingestSummary, setIngestSummary] = useState<{ new: number; updated: number; skipped: number; errors: number; hc_passed?: number; llm_passed?: number; llm_failed?: number; duration_seconds: number; file_name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logPanelRef = useRef<HTMLDivElement>(null);

  // Column controls for both tables
  const passedCols = useColumnControls("passed", PASSED_COLUMNS);
  const failedCols = useColumnControls("failed", FAILED_COLUMNS);

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
    setIngestStatus(`Running full pipeline on ${file.name}... (ingest \u2192 LinkedIn HC \u2192 LLM survey)`);
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
        setIngestStatus(`Pipeline complete: ${s.new} ingested, ${s.hc_passed || 0} passed HC, ${s.llm_passed || 0} passed LLM \u2192 ready for review`);
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

  const fetchPipelineStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline-stats?t=${Date.now()}`);
      if (res.ok) setPipelineStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);
  useEffect(() => { fetchIngestMeta(); }, [fetchIngestMeta]);
  useEffect(() => { fetchPipelineStats(); }, [fetchPipelineStats]);
  // Auto-refresh pipeline stats every 10 seconds if there's remaining work
  useEffect(() => {
    if (!pipelineStats || (pipelineStats.linkedin.remaining === 0 && pipelineStats.llm.remaining <= 0)) return;
    const interval = setInterval(fetchPipelineStats, 10000);
    return () => clearInterval(interval);
  }, [pipelineStats, fetchPipelineStats]);

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
          <h1 className="text-2xl font-bold text-white">Due for Review</h1>
          <p className="text-gray-400 text-sm mt-1">Classify companies that have passed all pipeline filters.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {passedCompanies.length} passed{failedCompaniesRaw.length > 0 ? ` \u00b7 ${failedCompaniesRaw.length} filtered out` : ""}{pendingEvalCount > 0 ? ` \u00b7 ${pendingEvalCount} pending` : ""}
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

      {/* Pipeline progress tracker — auto-refreshes every 10s */}
      {pipelineStats && (pipelineStats.linkedin.remaining > 0 || pipelineStats.llm.remaining > 0) && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-gray-900/50 border border-gray-800/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-medium text-gray-400">Pipeline Progress</span>
            </div>
            <span className="text-xs text-gray-500">{pipelineStats.total.toLocaleString()} total companies</span>
          </div>
          <div className="flex gap-6">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">LinkedIn Scrape</span>
                <span className="text-xs tabular-nums text-gray-400">
                  {pipelineStats.linkedin.scraped.toLocaleString()}/{pipelineStats.total.toLocaleString()}
                  {pipelineStats.linkedin.remaining > 0 && (
                    <span className="text-cyan-500 ml-1">({pipelineStats.linkedin.remaining.toLocaleString()} remaining)</span>
                  )}
                </span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.round((pipelineStats.linkedin.scraped / pipelineStats.total) * 100)}%` }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">LLM Survey</span>
                <span className="text-xs tabular-nums text-gray-400">
                  {pipelineStats.llm.evaluated.toLocaleString()}/{pipelineStats.llm.total.toLocaleString()}
                  {pipelineStats.llm.remaining > 0 && (
                    <span className="text-purple-400 ml-1">({pipelineStats.llm.remaining.toLocaleString()} remaining)</span>
                  )}
                </span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-1000"
                  style={{ width: `${pipelineStats.llm.total > 0 ? Math.round((pipelineStats.llm.evaluated / pipelineStats.llm.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

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
                <div className="flex items-center justify-center text-gray-600">&rarr;</div>
                <div><div className="text-lg font-bold text-blue-400">{ingestSummary.hc_passed ?? "\u2014"}</div><div className="text-xs text-gray-500">Passed HC</div></div>
                <div className="flex items-center justify-center text-gray-600">&rarr;</div>
                <div><div className="text-lg font-bold text-emerald-400">{ingestSummary.llm_passed ?? "\u2014"}</div><div className="text-xs text-gray-500">Passed LLM</div></div>
                <div><div className="text-lg font-bold text-red-400">{ingestSummary.llm_failed ?? "\u2014"}</div><div className="text-xs text-gray-500">Failed LLM</div></div>
                <div><div className="text-lg font-bold text-gray-500">{ingestSummary.errors}</div><div className="text-xs text-gray-500">Errors</div></div>
              </div>
              <div className="text-xs text-gray-600 text-center mt-2">Ingested &rarr; HC Filter (8-30) &rarr; LLM Survey &rarr; Ready for Review</div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span className="font-medium text-gray-400">Classifications:</span>
        <span><span className="text-emerald-400 font-medium">HVT</span> High Value Target</span>
        <span><span className="text-red-400 font-medium">PM</span> Pass &mdash; Market</span>
        <span><span className="text-orange-400 font-medium">PL</span> Pass &mdash; Location</span>
        <span><span className="text-yellow-400 font-medium">PS</span> Pass &mdash; Stage <span className="text-gray-600 ml-1">(3mo requeue)</span></span>
        <span><span className="text-blue-400 font-medium">PT</span> Pass &mdash; Traction <span className="text-gray-600 ml-1">(3mo requeue)</span></span>
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
                <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                  <TableHeader
                    columns={PASSED_COLUMNS}
                    columnOrder={passedCols.order}
                    widths={passedCols.widths}
                    sort={passedSort}
                    onSort={handlePassedSort}
                    startResize={passedCols.startResize}
                    startReorder={passedCols.startReorder}
                    registerHeaderRef={passedCols.registerHeaderRef}
                    dragRef={passedCols.dragRef}
                    dragOverId={passedCols.dragOverId}
                    thClass="py-3 px-4 font-medium text-gray-400"
                  />
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
                        columnOrder={passedCols.order}
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
                  <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                    <TableHeader
                      columns={FAILED_COLUMNS}
                      columnOrder={failedCols.order}
                      widths={failedCols.widths}
                      sort={failedSort}
                      onSort={handleFailedSort}
                      startResize={failedCols.startResize}
                      startReorder={failedCols.startReorder}
                      registerHeaderRef={failedCols.registerHeaderRef}
                      dragRef={failedCols.dragRef}
                      dragOverId={failedCols.dragOverId}
                      thClass="py-2 px-4 font-medium text-gray-500 text-xs"
                    />
                    <tbody>
                      {failedCompanies.map((company, index) => (
                        <CompanyRow
                          key={company.id}
                          company={company}
                          index={passedCompanies.length + index}
                          selected={selected}
                          onSelect={handleSelect}
                          submitting={submitting}
                          expandedRow={expandedRow}
                          onToggleExpand={handleToggleExpand}
                          dimmed
                          columnOrder={failedCols.order}
                          handleMoveToReview={handleMoveToReview}
                        />
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
                                    setEvalLogs((prev) => [...prev, `\u2713 ${data.name} \u2014 PASSED (${data.market} / ${data.vertical})`]);
                                  } else if (data.type === "failed") {
                                    setEvalLogs((prev) => [...prev, `\u2717 ${data.name} \u2014 FAILED (${data.reasons?.join(", ")})`]);
                                  } else if (data.type === "skip") {
                                    setEvalLogs((prev) => [...prev, `\u26a0 ${data.name} \u2014 Skipped: ${data.reason}`]);
                                  } else if (data.type === "error") {
                                    setEvalLogs((prev) => [...prev, `\u26a0 Error: ${data.reason}`]);
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
                      <div key={i} className={`${log.startsWith("\u2713") ? "text-emerald-400" : log.startsWith("\u2717") ? "text-red-400" : log.startsWith("\u26a0") ? "text-amber-400" : "text-gray-400"}`}>{log}</div>
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
                              <span className="text-gray-300 font-medium">{s?.name || "\u2014"}</span>
                            </td>
                            <td className="py-2 px-4 text-gray-400">{s?.founded_year || "\u2014"}</td>
                            <td className="py-2 px-4 text-gray-400">{s?.pb_hq_city || s?.location || "\u2014"}</td>
                            <td className="py-2 px-4 text-right text-gray-500 tabular-nums">{(s as Record<string, unknown>)?.pb_employees != null ? String((s as Record<string, unknown>).pb_employees) : "\u2014"}</td>
                            <td className="py-2 px-4 text-center">
                              {s?.passed_headcount_filter !== null
                                ? <span className="text-emerald-400 text-xs">{"\u2713"}</span>
                                : <span className="text-yellow-500 text-xs">Pending</span>
                              }
                            </td>
                            <td className="py-2 px-4 text-center">
                              {s?.passed_llm_filter !== null
                                ? <span className="text-emerald-400 text-xs">{"\u2713"}</span>
                                : <span className="text-yellow-500 text-xs">Pending</span>
                              }
                            </td>
                            <td className="py-2 px-4 text-gray-500 max-w-xs">
                              <p className="line-clamp-1 text-xs">{s?.pb_description || s?.what_they_do || "\u2014"}</p>
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
