"use client";

import { useEffect, useState, useCallback } from "react";

interface HVTCompany {
  id: string;
  status: string;
  review_count: number;
  snapshot: {
    name: string | null;
    website: string | null;
    linkedin_url: string | null;
    pitchbook_url: string | null;
    ceo_name: string | null;
    ceo_linkedin_url: string | null;
    ceo_email: string | null;
    ceo_phone: string | null;
    founded_year: number | null;
    location: string | null;
    pb_hq_city: string | null;
    headcount: number | null;
    headcount_growth_1yr: number | null;
    total_capital_raised: number | null;
    last_round_valuation: number | null;
    what_they_do: string | null;
    competitors: { name: string; source: string; rationale: string }[] | null;
    competitor_confidence: string | null;
    pb_description: string | null;
    crustdata_enrichment: Record<string, unknown> | null;
    crustdata_enriched_at: string | null;
    icp_description: string | null;
    icp_evidence: string | null;
    us_tam_customer_count: number | null;
    us_tam_customer_count_source: string | null;
    estimated_annual_contract_value: number | null;
    estimated_annual_contract_value_evidence: string | null;
    estimated_tam_usd: number | null;
  } | null;
  outreach: {
    outreach_count: number;
    days_since_last_activity: number | null;
    any_opens: boolean;
    last_outreach_at: string | null;
  } | null;
  latest_website_change: {
    change_summary: string | null;
    checked_at: string;
  } | null;
  recent_posts: {
    id: string;
    post_type: string | null;
    posted_by: string | null;
    post_content: string | null;
    post_url: string | null;
    posted_at: string | null;
  }[];
}

interface HubSpotEmail {
  date: string;
  subject: string;
  direction: string;
  sender: string;
  recipient: string;
  opens: number;
  isFirstOutreach: boolean;
}

interface HubSpotMeeting {
  date: string;
  title: string;
}

interface HubSpotEngagement {
  companyId: string;
  companyName: string;
  contacts: { name: string; email: string; title: string }[];
  emails: HubSpotEmail[];
  meetings: HubSpotMeeting[];
  totalEmails: number;
  totalOpens: number;
  totalMeetings: number;
  firstOutreachDate: string | null;
  lastActivityDate: string | null;
}

function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "\u2014";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}yr ago`;
}

export default function HVTPage() {
  const [companies, setCompanies] = useState<HVTCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drafting, setDrafting] = useState(false);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const [hubspotData, setHubspotData] = useState<Record<string, HubSpotEngagement>>({});
  const [loadingHubspot, setLoadingHubspot] = useState<Set<string>>(new Set());

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hvt");
      const data = await res.json();
      setCompanies(data);
    } catch (err) {
      console.error("Failed to fetch HVT companies:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDraftEmails = async () => {
    if (selectedIds.size === 0) return;
    setDrafting(true);
    setDraftStatus(`Drafting ${selectedIds.size} email${selectedIds.size > 1 ? "s" : ""}...`);
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map(async (companyId) => {
          const res = await fetch("/api/draft-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companyId }),
          });
          return { companyId, ok: res.ok, data: await res.json() };
        })
      );
      const succeeded = results.filter((r) => r.ok && r.data.success);
      const failed = results.filter((r) => !r.ok || r.data.error);
      if (succeeded.length > 0 && failed.length === 0) {
        setDraftStatus(`${succeeded.length} email draft${succeeded.length > 1 ? "s" : ""} created in Gmail`);
      } else if (failed.length > 0) {
        setDraftStatus(`${succeeded.length} drafted, ${failed.length} failed: ${failed[0].data.error || "Unknown error"}`);
      }
      setSelectedIds(new Set());
      setTimeout(() => setDraftStatus(null), 5000);
    } catch (err) {
      console.error("Draft emails failed:", err);
      setDraftStatus("Draft creation failed");
      setTimeout(() => setDraftStatus(null), 5000);
    } finally {
      setDrafting(false);
    }
  };

  const handleAddHVT = async () => {
    if (!addUrl.trim()) return;
    setAdding(true);
    setAddStatus("Adding company... (scraping website, LinkedIn, running LLM survey)");
    try {
      const res = await fetch("/api/hvt/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: addUrl.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAddStatus(`Added ${data.company_name} as HVT (HC: ${data.headcount || "N/A"}, Competitors: ${data.competitors?.join(", ") || "none"})`);
        setAddUrl("");
        setShowAddForm(false);
        fetchCompanies();
      } else {
        setAddStatus(`Failed: ${data.error || "Unknown error"}`);
      }
      setTimeout(() => setAddStatus(null), 8000);
    } catch (err) {
      console.error("Add HVT failed:", err);
      setAddStatus("Failed to add company");
      setTimeout(() => setAddStatus(null), 5000);
    } finally {
      setAdding(false);
    }
  };

  const fetchHubspot = useCallback(async (companyId: string) => {
    if (hubspotData[companyId] || loadingHubspot.has(companyId)) return;
    setLoadingHubspot((prev) => new Set(prev).add(companyId));
    try {
      const res = await fetch(`/api/hubspot?companyId=${companyId}`);
      const data = await res.json();
      if (data && !data.error) {
        setHubspotData((prev) => ({ ...prev, [companyId]: data }));
      }
    } catch (err) {
      console.error("HubSpot fetch failed:", err);
    } finally {
      setLoadingHubspot((prev) => { const next = new Set(prev); next.delete(companyId); return next; });
    }
  }, [hubspotData, loadingHubspot]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => {
      const newId = prev === id ? null : id;
      if (newId) fetchHubspot(newId);
      return newId;
    });
  }, [fetchHubspot]);

  const formatGrowth = (growth: number | null) => {
    if (growth === null || growth === undefined) return "\u2014";
    const pct = growth.toFixed(0);
    const isPositive = growth > 0;
    return (
      <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
        {isPositive ? "+" : ""}{pct}%
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">High Value Targets</h1>
          <p className="text-gray-400 text-sm mt-1">Monitor and track high value targets. Click a row to expand intel. Check rows to draft emails.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{companies.length} {companies.length === 1 ? "target" : "targets"}</span>
          <button onClick={fetchCompanies} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors">Refresh</button>
          <button onClick={() => setShowAddForm(!showAddForm)} className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors">
            {showAddForm ? "Cancel" : "+ Add Company"}
          </button>
          {selectedIds.size > 0 && (
            <button onClick={handleDraftEmails} disabled={drafting} className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-300 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed">
              {drafting ? "Drafting..." : `Draft ${selectedIds.size} Email${selectedIds.size > 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 whitespace-nowrap">Company Website:</label>
            <input
              type="text"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !adding) handleAddHVT(); }}
              placeholder="e.g. archiveintel.com"
              className="flex-1 px-3 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              disabled={adding}
            />
            <button
              onClick={handleAddHVT}
              disabled={adding || !addUrl.trim()}
              className="px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {adding ? "Adding..." : "Add to HVT"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Scrapes website, LinkedIn (pre-paywall), runs LLM survey, and researches competitors. Takes ~30 seconds.</p>
        </div>
      )}

      {draftStatus && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${draftStatus.includes("failed") ? "bg-red-900/30 text-red-300" : draftStatus.includes("created") ? "bg-emerald-900/30 text-emerald-300" : "bg-blue-900/30 text-blue-300"}`}>
          {draftStatus}
        </div>
      )}

      {addStatus && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${addStatus.includes("Failed") ? "bg-red-900/30 text-red-300" : addStatus.includes("Added") ? "bg-emerald-900/30 text-emerald-300" : "bg-blue-900/30 text-blue-300"}`}>
          {adding && <span className="inline-block w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin mr-2 align-middle" />}
          {addStatus}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="text-gray-500">Loading HVT companies...</div></div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <p className="text-lg font-medium">No high value targets yet</p>
          <p className="text-sm mt-1">Classify companies as HVT in Do for Review to see them here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="py-3 px-3 w-8">
                  <input type="checkbox" className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 cursor-pointer"
                    checked={selectedIds.size === companies.length && companies.length > 0}
                    onChange={(e) => { if (e.target.checked) setSelectedIds(new Set(companies.map(c => c.id))); else setSelectedIds(new Set()); }}
                  />
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-400">Company</th>
                <th className="text-left py-3 px-4 font-medium text-gray-400">Founded</th>
                <th className="text-left py-3 px-4 font-medium text-gray-400">HQ City</th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">HC</th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">1yr Growth</th>
                <th className="text-right py-3 px-4 font-medium text-gray-400">Raised</th>
                <th className="text-left py-3 px-4 font-medium text-gray-400">CEO</th>
                <th className="text-center py-3 px-4 font-medium text-gray-400">Outreach</th>
                <th className="text-center py-3 px-4 font-medium text-gray-400">Days Idle</th>
                <th className="text-center py-3 px-4 font-medium text-gray-400">Opened</th>
                <th className="text-center py-3 px-4 font-medium text-gray-400">Intel</th>
              </tr>
            </thead>
            {companies.map((company) => {
              const s = company.snapshot;
              const o = company.outreach;
              const isExpanded = expandedId === company.id;
              const isSelected = selectedIds.has(company.id);
              const hasWebsiteChange = !!company.latest_website_change;
              const hasPosts = company.recent_posts.length > 0;
              const hasIntel = hasWebsiteChange || hasPosts;
              return (
                <tbody key={company.id}>
                  <tr className={`border-b border-gray-800/50 transition-all duration-200 cursor-pointer ${isSelected ? "bg-blue-900/20" : isExpanded ? "bg-gray-900/50" : "hover:bg-gray-900/30"}`}
                    onClick={() => handleToggleExpand(company.id)}>
                    <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 cursor-pointer" checked={isSelected} onChange={() => toggleSelect(company.id)} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs mr-1 select-none">{isExpanded ? "\u25BE" : "\u25B8"}</span>
                        {s?.website ? (
                          <a href={s.website.startsWith("http") ? s.website : `https://${s.website}`} target="_blank" rel="noopener noreferrer" className="text-white font-medium hover:text-blue-400 transition-colors" onClick={(e) => e.stopPropagation()}>{s?.name || "Unknown"}</a>
                        ) : (<span className="text-white font-medium">{s?.name || "Unknown"}</span>)}
                        {s?.pitchbook_url && (<a href={s.pitchbook_url} target="_blank" rel="noopener noreferrer" className="px-1 py-0.5 text-[10px] font-bold rounded bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors" title="View on PitchBook" onClick={(e) => e.stopPropagation()}>PB</a>)}
                        {s?.linkedin_url && (<a href={s.linkedin_url} target="_blank" rel="noopener noreferrer" className="px-1 py-0.5 text-[10px] font-bold rounded bg-gray-700 text-blue-400 hover:bg-gray-600 hover:text-blue-300 transition-colors" title="View on LinkedIn" onClick={(e) => e.stopPropagation()}>LI</a>)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-400">{s?.founded_year || "\u2014"}</td>
                    <td className="py-3 px-4 text-gray-400">{s?.pb_hq_city || s?.location || "\u2014"}</td>
                    <td className="py-3 px-4 text-right text-gray-300 tabular-nums">{s?.headcount || "\u2014"}</td>
                    <td className="py-3 px-4 text-right tabular-nums">{formatGrowth(s?.headcount_growth_1yr ?? null)}</td>
                    <td className="py-3 px-4 text-right text-gray-300 tabular-nums">{formatMoney(s?.total_capital_raised)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-300 text-xs">{s?.ceo_name || "\u2014"}</span>
                        {s?.ceo_linkedin_url && (<a href={s.ceo_linkedin_url} target="_blank" rel="noopener noreferrer" className="px-1 py-0.5 text-[10px] font-bold rounded bg-gray-700 text-blue-400 hover:bg-gray-600 hover:text-blue-300 transition-colors" title="CEO LinkedIn" onClick={(e) => e.stopPropagation()}>LI</a>)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-300 tabular-nums">{o?.outreach_count ?? "\u2014"}</td>
                    <td className="py-3 px-4 text-center tabular-nums">
                      {o?.days_since_last_activity != null ? (
                        <span className={o.days_since_last_activity > 14 ? "text-red-400" : o.days_since_last_activity > 7 ? "text-yellow-400" : "text-gray-300"}>{o.days_since_last_activity}d</span>
                      ) : "\u2014"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {o ? (o.any_opens ? <span className="text-emerald-400 text-xs font-medium">Yes</span> : <span className="text-gray-500 text-xs">No</span>) : "\u2014"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {hasIntel ? (
                        <div className="flex items-center justify-center gap-1">
                          {hasWebsiteChange && <span className="w-2 h-2 rounded-full bg-amber-400" title="Website change detected" />}
                          {hasPosts && <span className="w-2 h-2 rounded-full bg-blue-400" title={`${company.recent_posts.length} LinkedIn post${company.recent_posts.length === 1 ? "" : "s"}`} />}
                        </div>
                      ) : <span className="text-gray-600 text-xs">{"\u2014"}</span>}
                    </td>
                  </tr>
                  {isExpanded && (() => {
                    const cd = s?.crustdata_enrichment as Record<string, unknown> | null;
                    const hc = cd?.headcount as Record<string, unknown> | null;
                    const wt = cd?.web_traffic as Record<string, unknown> | null;
                    const funding = cd?.funding_and_investment as Record<string, unknown> | null;
                    const founders = cd?.founders as Record<string, unknown> | null;
                    const seoData = cd?.seo as Record<string, unknown> | null;
                    const dms = cd?.decision_makers as Array<Record<string, unknown>> | null;
                    const competitors_cd = cd?.competitors as Record<string, unknown> | null;
                    const hcTimeseries = hc?.linkedin_headcount_timeseries as Array<Record<string, unknown>> | null;
                    const wtTimeseries = wt?.monthly_visitors_timeseries as Array<Record<string, unknown>> | null;
                    const roleAbsolute = hc?.linkedin_headcount_by_role_absolute as Record<string, number> | null;
                    const rolePercent = hc?.linkedin_headcount_by_role_percent as Record<string, number> | null;
                    const roleSixMo = hc?.linkedin_headcount_by_role_six_months_growth_percent as Record<string, number> | null;
                    const fundingMilestones = funding?.funding_milestones_timeseries as Array<Record<string, unknown>> | null;
                    const paidSeoComps = competitors_cd?.paid_seo_competitors_website_domains as string[] | null;
                    const organicSeoComps = competitors_cd?.organic_seo_competitors_website_domains as string[] | null;

                    // Mini bar chart helper
                    const MiniBar = ({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) => (
                      <div className="w-full bg-gray-700 rounded-full h-1.5">
                        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
                      </div>
                    );

                    // Sparkline helper for timeseries
                    const Sparkline = ({ data, color = "#60a5fa" }: { data: number[]; color?: string }) => {
                      if (!data || data.length < 2) return null;
                      const min = Math.min(...data);
                      const max = Math.max(...data);
                      const range = max - min || 1;
                      const w = 200; const h = 40;
                      const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
                      return (
                        <svg width={w} height={h} className="overflow-visible">
                          <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
                        </svg>
                      );
                    };

                    return (
                    <tr className="bg-gray-900/30">
                      <td colSpan={12} className="px-4 py-4">
                        {/* Row 1: Core Info */}
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 pl-6 mb-4">
                          <div className="bg-gray-800/50 rounded-lg p-4">
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">What They Do</h4>
                            <p className="text-sm text-gray-300 leading-relaxed">{s?.what_they_do || s?.pb_description || "No summary available."}</p>
                            {s?.ceo_email && (<div className="mt-3 pt-3 border-t border-gray-700"><span className="text-xs text-gray-500">CEO Email: </span><a href={`mailto:${s.ceo_email}`} className="text-xs text-blue-400 hover:text-blue-300" onClick={(e) => e.stopPropagation()}>{s.ceo_email}</a></div>)}
                            {s?.ceo_phone && (<div className="mt-1"><span className="text-xs text-gray-500">CEO Phone: </span><span className="text-xs text-gray-300">{s.ceo_phone}</span></div>)}
                            {dms && dms.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-gray-700">
                                <span className="text-xs text-gray-500 block mb-1">Leadership Team</span>
                                {dms.slice(0, 5).map((dm, i) => (
                                  <div key={i} className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-xs text-gray-300">{dm.name as string}</span>
                                    <span className="text-[10px] text-gray-500">{dm.title as string}</span>
                                    {dm.location && <span className="text-[9px] text-gray-600">({dm.location as string})</span>}
                                    {dm.linkedin_flagship_url && <a href={dm.linkedin_flagship_url as string} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-400" onClick={(e) => e.stopPropagation()}>LI</a>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="bg-gray-800/50 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Competitors</h4>
                              {s?.competitor_confidence && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  s.competitor_confidence === "HIGH" ? "bg-emerald-900/50 text-emerald-300" :
                                  s.competitor_confidence === "MIXED" ? "bg-yellow-900/50 text-yellow-300" :
                                  "bg-red-900/50 text-red-300"
                                }`} title={`Competitor confidence: ${s.competitor_confidence}`}>{s.competitor_confidence}</span>
                              )}
                            </div>
                            {s?.competitors && s.competitors.length > 0 ? (
                              <div className="space-y-2">
                                {s.competitors.map((comp, idx) => (
                                  <div key={idx} className="border-l-2 border-gray-700 pl-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-200 font-medium">{comp.name}</span>
                                      <span className={`text-[9px] px-1 py-0.5 rounded ${comp.source === "website_positioning" ? "bg-purple-900/50 text-purple-300" : comp.source === "google_ads" ? "bg-amber-900/50 text-amber-300" : comp.source === "market_overlap" ? "bg-blue-900/50 text-blue-300" : "bg-gray-700 text-gray-400"}`}>{comp.source.replace("_", " ")}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5">{comp.rationale}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (<p className="text-sm text-gray-500 italic">No competitors identified yet.</p>)}
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
                          <div className="bg-gray-800/50 rounded-lg p-4">
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Engagement History</h4>
                            {loadingHubspot.has(company.id) ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-block w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs text-gray-500">Loading HubSpot data...</span>
                              </div>
                            ) : hubspotData[company.id] ? (() => {
                              const hs = hubspotData[company.id];
                              return (
                                <div className="space-y-2">
                                  {/* Summary stats */}
                                  <div className="flex gap-4 mb-3">
                                    <div className="text-center">
                                      <span className="text-lg font-bold text-white block">{hs.totalEmails}</span>
                                      <span className="text-[10px] text-gray-500">Emails</span>
                                    </div>
                                    <div className="text-center">
                                      <span className="text-lg font-bold text-white block">{hs.totalOpens}</span>
                                      <span className="text-[10px] text-gray-500">Opens</span>
                                    </div>
                                    <div className="text-center">
                                      <span className="text-lg font-bold text-white block">{hs.totalMeetings}</span>
                                      <span className="text-[10px] text-gray-500">Meetings</span>
                                    </div>
                                  </div>
                                  {/* Email timeline */}
                                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                    {hs.emails.slice(-15).map((email, i) => (
                                      <div key={i} className={`flex items-start gap-2 text-[10px] ${email.isFirstOutreach ? "bg-blue-900/20 rounded px-1.5 py-1 border-l-2 border-blue-500" : ""}`}>
                                        <span className="text-gray-600 whitespace-nowrap min-w-[60px]">{email.date?.slice(0, 10)}</span>
                                        <span className={`whitespace-nowrap ${email.direction === "INCOMING_EMAIL" ? "text-emerald-400" : "text-gray-400"}`}>
                                          {email.direction === "INCOMING_EMAIL" ? "← Reply" : "→ Sent"}
                                        </span>
                                        <span className="text-gray-300 truncate flex-1" title={email.subject}>{email.subject}</span>
                                        {email.opens > 0 && (
                                          <span className="text-amber-400 whitespace-nowrap" title={`Opened ${email.opens} time${email.opens > 1 ? "s" : ""}`}>
                                            👁 {email.opens}
                                          </span>
                                        )}
                                        {email.isFirstOutreach && (
                                          <span className="text-[9px] px-1 py-0.5 bg-blue-900/50 text-blue-300 rounded whitespace-nowrap">1st</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  {/* Meetings */}
                                  {hs.meetings.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-gray-700">
                                      <span className="text-[10px] text-gray-500 block mb-1">Meetings</span>
                                      {hs.meetings.map((m, i) => (
                                        <div key={i} className="flex items-center gap-2 text-[10px] mt-0.5">
                                          <span className="text-gray-600">{m.date?.slice(0, 10)}</span>
                                          <span className="text-gray-300">{m.title}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {hs.firstOutreachDate && (
                                    <div className="mt-2 pt-2 border-t border-gray-700">
                                      <span className="text-[9px] text-gray-600">First outreach: {hs.firstOutreachDate.slice(0, 10)} · Last activity: {hs.lastActivityDate?.slice(0, 10)}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })() : (
                              <p className="text-sm text-gray-500 italic">No HubSpot data available.</p>
                            )}
                          </div>
                          <div className="bg-gray-800/50 rounded-lg p-4">
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Market & TAM</h4>
                            {s?.icp_description ? (
                              <div className="space-y-3">
                                <div>
                                  <span className="text-[10px] text-gray-500 block mb-1">Ideal Customer Profile</span>
                                  <p className="text-sm text-gray-200 font-medium">{s.icp_description}</p>
                                  {s.icp_evidence && <p className="text-[10px] text-gray-500 mt-1 italic">{s.icp_evidence}</p>}
                                </div>
                                {s.us_tam_customer_count != null && s.us_tam_customer_count > 0 && (
                                  <div className="flex justify-between items-baseline">
                                    <span className="text-xs text-gray-500">US Customer Count</span>
                                    <span className="text-sm font-medium text-white">{s.us_tam_customer_count.toLocaleString()}</span>
                                  </div>
                                )}
                                {s.us_tam_customer_count_source && (
                                  <p className="text-[10px] text-gray-500 -mt-2">{s.us_tam_customer_count_source}</p>
                                )}
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
                                {s.estimated_annual_contract_value_evidence && (
                                  <p className="text-[10px] text-gray-500 italic">{s.estimated_annual_contract_value_evidence}</p>
                                )}
                              </div>
                            ) : (<p className="text-sm text-gray-500 italic">No market data yet. Run LLM survey to populate.</p>)}
                          </div>
                        </div>

                        {/* Row 2: Crust Data Enrichment - only show if enriched */}
                        {cd ? (
                          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 pl-6">
                            {/* Panel 1: Headcount Over Time + Role Breakdown */}
                            <div className="bg-gray-800/50 rounded-lg p-4">
                              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                                {s?.linkedin_url ? (
                                  <a href={`${s.linkedin_url.replace(/\/$/, "")}/insights/`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors" title="View LinkedIn Insights">
                                    Headcount Breakdown <span className="text-blue-500 text-[10px]">↗</span>
                                  </a>
                                ) : "Headcount Breakdown"}
                              </h4>
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

                            {/* Panel 2: Web Traffic */}
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
                                      <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                                        <span>{wtTimeseries[0]?.date as string || ""}</span>
                                        <span>{wtTimeseries[wtTimeseries.length - 1]?.date as string || ""}</span>
                                      </div>
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
                            </div>

                            {/* Panel 3: Funding & Investors */}
                            <div className="bg-gray-800/50 rounded-lg p-4">
                              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Funding & Investors</h4>
                              {funding && (
                                <>
                                  <div className="space-y-2 mb-3">
                                    <div className="flex justify-between">
                                      <span className="text-xs text-gray-500">Total Raised</span>
                                      <span className="text-sm font-medium text-white">{formatMoney(funding.crunchbase_total_investment_usd as number)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-xs text-gray-500">Last Round</span>
                                      <span className="text-xs text-gray-300 capitalize">{(funding.last_funding_round_type as string) || "\u2014"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-xs text-gray-500">Last Round Size</span>
                                      <span className="text-xs text-gray-300">{formatMoney(funding.last_funding_round_investment_usd as number)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-xs text-gray-500">Days Since Raise</span>
                                      <span className="text-xs text-gray-300">{funding.days_since_last_fundraise != null ? `${funding.days_since_last_fundraise}d` : "\u2014"}</span>
                                    </div>
                                  </div>
                                  {funding.crunchbase_investors && (
                                    <div>
                                      <span className="text-[10px] text-gray-500 block mb-1">Investors</span>
                                      <div className="flex flex-wrap gap-1">
                                        {(funding.crunchbase_investors as string[]).map((inv, i) => (
                                          <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">{inv}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {fundingMilestones && fundingMilestones.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-gray-700">
                                      <span className="text-[10px] text-gray-500 block mb-1">Funding History</span>
                                      {fundingMilestones.slice(0, 5).map((m, i) => (
                                        <div key={i} className="flex justify-between text-[10px] mt-1">
                                          <span className="text-gray-400">{(m.date as string) || ""}</span>
                                          <span className="text-gray-300 capitalize">{(m.round_type as string) || ""}</span>
                                          <span className="text-gray-300">{formatMoney(m.investment_usd as number)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                              {!funding && <p className="text-sm text-gray-500 italic">No funding data available.</p>}
                              {/* Founder Education */}
                              {founders && (
                                <div className="mt-3 pt-3 border-t border-gray-700">
                                  <span className="text-[10px] text-gray-500 block mb-1">Founder Background</span>
                                  {(() => {
                                    const schools = Array.isArray(founders.founders_education_institute)
                                      ? founders.founders_education_institute as string[]
                                      : founders.founders_education_institute ? [founders.founders_education_institute as string] : [];
                                    const degrees = Array.isArray(founders.founders_degree_name)
                                      ? founders.founders_degree_name as string[]
                                      : founders.founders_degree_name ? [founders.founders_degree_name as string] : [];
                                    return schools.map((school, i) => (
                                      <div key={i} className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-gray-300">{school}</span>
                                        {degrees[i] && <span className="text-[9px] text-gray-500">({degrees[i]})</span>}
                                      </div>
                                    ));
                                  })()}
                                  {founders.founders_previous_companies && (
                                    <div className="mt-2">
                                      <span className="text-[10px] text-gray-500 block mb-0.5">Previous Companies</span>
                                      <div className="flex flex-wrap gap-1">
                                        {(Array.isArray(founders.founders_previous_companies)
                                          ? founders.founders_previous_companies as string[]
                                          : [founders.founders_previous_companies as string]
                                        ).slice(0, 6).map((c, i) => (
                                          <span key={i} className="text-[9px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">{c}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Panel 4: SEO & Paid Search */}
                            <div className="bg-gray-800/50 rounded-lg p-4">
                              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">SEO & Paid Search</h4>
                              {seoData && (
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-xs text-gray-500">Google Ads Budget</span>
                                    <span className="text-sm font-medium text-amber-400">{seoData.monthly_google_ads_budget != null ? `$${((seoData.monthly_google_ads_budget as number)).toLocaleString()}/mo` : "\u2014"}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-xs text-gray-500">Paid Clicks</span>
                                    <span className="text-xs text-gray-300">{seoData.monthly_paid_clicks != null ? `${(seoData.monthly_paid_clicks as number).toLocaleString()}/mo` : "\u2014"}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-xs text-gray-500">Organic Clicks</span>
                                    <span className="text-xs text-gray-300">{seoData.monthly_organic_clicks != null ? `${(seoData.monthly_organic_clicks as number).toLocaleString()}/mo` : "\u2014"}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-xs text-gray-500">Organic Value</span>
                                    <span className="text-xs text-gray-300">{seoData.monthly_organic_value != null ? `$${((seoData.monthly_organic_value as number)).toLocaleString()}/mo` : "\u2014"}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-xs text-gray-500">Ads Running</span>
                                    <span className="text-xs text-gray-300">{seoData.total_ads_purchased != null ? (seoData.total_ads_purchased as number) : "\u2014"}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-xs text-gray-500">Organic Rankings</span>
                                    <span className="text-xs text-gray-300">{seoData.total_organic_results != null ? (seoData.total_organic_results as number).toLocaleString() : "\u2014"}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-xs text-gray-500">Avg Organic Rank</span>
                                    <span className="text-xs text-gray-300">{seoData.average_seo_organic_rank != null ? `#${(seoData.average_seo_organic_rank as number).toFixed(1)}` : "\u2014"}</span>
                                  </div>
                                  {seoData.newly_ranked_seo_keywords != null && (
                                    <div className="mt-2 pt-2 border-t border-gray-700 flex justify-between">
                                      <span className="text-[10px] text-gray-500">New Keywords</span>
                                      <span className="text-[10px] text-emerald-400">+{seoData.newly_ranked_seo_keywords as number}</span>
                                    </div>
                                  )}
                                  {seoData.gained_ranked_seo_keywords != null && (
                                    <div className="flex justify-between">
                                      <span className="text-[10px] text-gray-500">Gained Rankings</span>
                                      <span className="text-[10px] text-emerald-400">+{seoData.gained_ranked_seo_keywords as number}</span>
                                    </div>
                                  )}
                                  {seoData.lost_ranked_seo_keywords != null && (
                                    <div className="flex justify-between">
                                      <span className="text-[10px] text-gray-500">Lost Rankings</span>
                                      <span className="text-[10px] text-red-400">-{seoData.lost_ranked_seo_keywords as number}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {!seoData && <p className="text-sm text-gray-500 italic">No SEO data available.</p>}
                              {/* Revenue Estimate */}
                              {cd?.estimated_revenue_lower_bound_usd != null && (
                                <div className="mt-3 pt-3 border-t border-gray-700">
                                  <span className="text-[10px] text-gray-500 block mb-1">Estimated Revenue</span>
                                  <span className="text-sm text-white font-medium">
                                    {formatMoney(cd.estimated_revenue_lower_bound_usd as number)} - {formatMoney(cd.estimated_revenue_higher_bound_usd as number)}
                                  </span>
                                </div>
                              )}
                              {s?.crustdata_enriched_at && (
                                <div className="mt-3 pt-3 border-t border-gray-700">
                                  <span className="text-[9px] text-gray-600">Crust Data enriched {timeAgo(s.crustdata_enriched_at)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="pl-6 mt-2">
                            <p className="text-xs text-gray-500 italic">No Crust Data enrichment yet. Run Script 5 to enrich HVT companies.</p>
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })()}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}
