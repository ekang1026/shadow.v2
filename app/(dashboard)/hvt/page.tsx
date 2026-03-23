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
                    onClick={() => setExpandedId(isExpanded ? null : company.id)}>
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
                  {isExpanded && (
                    <tr className="bg-gray-900/30">
                      <td colSpan={12} className="px-4 py-4">
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 pl-6">
                          <div className="bg-gray-800/50 rounded-lg p-4">
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">What They Do</h4>
                            <p className="text-sm text-gray-300 leading-relaxed">{s?.what_they_do || "No summary available."}</p>
                            {s?.ceo_email && (<div className="mt-3 pt-3 border-t border-gray-700"><span className="text-xs text-gray-500">CEO Email: </span><a href={`mailto:${s.ceo_email}`} className="text-xs text-blue-400 hover:text-blue-300" onClick={(e) => e.stopPropagation()}>{s.ceo_email}</a></div>)}
                            {s?.ceo_phone && (<div className="mt-1"><span className="text-xs text-gray-500">CEO Phone: </span><span className="text-xs text-gray-300">{s.ceo_phone}</span></div>)}
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
                                  <div key={idx} className="group relative border-l-2 border-gray-700 pl-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-200 font-medium">{comp.name}</span>
                                      <span className={`text-[9px] px-1 py-0.5 rounded ${
                                        comp.source === "website_positioning" ? "bg-purple-900/50 text-purple-300" :
                                        comp.source === "google_ads" ? "bg-amber-900/50 text-amber-300" :
                                        comp.source === "market_overlap" ? "bg-blue-900/50 text-blue-300" :
                                        "bg-gray-700 text-gray-400"
                                      }`} title={`Source: ${comp.source}`}>{comp.source.replace("_", " ")}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5">{comp.rationale}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (<p className="text-sm text-gray-500 italic">No competitors identified yet.</p>)}
                          </div>
                          <div className="bg-gray-800/50 rounded-lg p-4">
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Latest Website Change</h4>
                            {company.latest_website_change ? (<><p className="text-sm text-gray-300 leading-relaxed">{company.latest_website_change.change_summary || "Change detected but no summary."}</p><p className="text-xs text-gray-500 mt-2">Detected {timeAgo(company.latest_website_change.checked_at)}</p></>) : (<p className="text-sm text-gray-500 italic">No website changes detected yet.</p>)}
                          </div>
                          <div className="bg-gray-800/50 rounded-lg p-4">
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Recent LinkedIn Posts</h4>
                            {company.recent_posts.length > 0 ? (
                              <div className="space-y-3">
                                {company.recent_posts.map((post) => (
                                  <div key={post.id} className="border-l-2 border-gray-700 pl-3">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${post.post_type === "ceo" ? "bg-purple-900/50 text-purple-300" : "bg-blue-900/50 text-blue-300"}`}>{post.post_type === "ceo" ? "CEO" : "CO"}</span>
                                      <span className="text-xs text-gray-500">{post.posted_by}</span>
                                      <span className="text-xs text-gray-600">{timeAgo(post.posted_at)}</span>
                                    </div>
                                    <p className="text-xs text-gray-400 line-clamp-2">{post.post_content}</p>
                                    {post.post_url && (<a href={post.post_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300 mt-1 inline-block" onClick={(e) => e.stopPropagation()}>View post &rarr;</a>)}
                                  </div>
                                ))}
                              </div>
                            ) : (<p className="text-sm text-gray-500 italic">No recent LinkedIn activity.</p>)}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}
