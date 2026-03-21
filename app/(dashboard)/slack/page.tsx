"use client";

import { useEffect, useState, useCallback } from "react";

interface HVTChannel {
  id: string;
  name: string;
  website: string | null;
  postCount: number;
  latestPost: string | null;
}

export default function SlackPage() {
  const [channels, setChannels] = useState<HVTChannel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hvt");
      const data = await res.json();
      const mapped: HVTChannel[] = (data || []).map((c: Record<string, unknown>) => {
        const snapshot = c.snapshot as Record<string, unknown> | null;
        const posts = (c.recent_posts || []) as Record<string, unknown>[];
        return {
          id: c.id as string,
          name: (snapshot?.name as string) || "Unknown",
          website: (snapshot?.website as string) || null,
          postCount: posts.length,
          latestPost: posts.length > 0 ? (posts[0].posted_at as string) : null,
        };
      });
      setChannels(mapped);
    } catch (err) {
      console.error("Failed to fetch channels:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Slack Integration</h1>
          <p className="text-gray-400 text-sm mt-1">Collaborative intel feed for HVT companies.</p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 mb-8">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">How It Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-900/50 text-emerald-400 text-xs font-bold flex items-center justify-center">1</span>
              <span className="text-sm text-white font-medium">HVT Classification</span>
            </div>
            <p className="text-xs text-gray-400 pl-8">When a company is classified as HVT, a dedicated Slack channel is automatically created.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-900/50 text-amber-400 text-xs font-bold flex items-center justify-center">2</span>
              <span className="text-sm text-white font-medium">Weekly Monitor</span>
            </div>
            <p className="text-xs text-gray-400 pl-8">Website changes and LinkedIn posts are automatically posted to the company channel every week.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-900/50 text-blue-400 text-xs font-bold flex items-center justify-center">3</span>
              <span className="text-sm text-white font-medium">Living Record</span>
            </div>
            <p className="text-xs text-gray-400 pl-8">Each channel becomes a living record of all activity and intel for that target company.</p>
          </div>
        </div>
      </div>

      {/* Integration status */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 mb-8">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Integration Status</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
              <span className="text-sm text-gray-300">Slack API</span>
            </div>
            <span className="text-xs text-yellow-400 font-medium px-2 py-1 bg-yellow-900/30 rounded">Pending Setup</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
              <span className="text-sm text-gray-300">Channel Auto-Creation</span>
            </div>
            <span className="text-xs text-yellow-400 font-medium px-2 py-1 bg-yellow-900/30 rounded">Pending Setup</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
              <span className="text-sm text-gray-300">Weekly Intel Posts</span>
            </div>
            <span className="text-xs text-yellow-400 font-medium px-2 py-1 bg-yellow-900/30 rounded">Pending Setup</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-4">Slack integration is handled by the Mac mini Python pipeline (Script 6). Configure your Slack Bot Token in the pipeline environment variables to activate.</p>
      </div>

      {/* HVT Channels */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
          HVT Channels {!loading && `(${channels.length})`}
        </h3>
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : channels.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No HVT companies yet. Channels will appear here once companies are classified as HVT.</p>
        ) : (
          <div className="space-y-2">
            {channels.map((ch) => (
              <div key={ch.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-sm">#</span>
                  <span className="text-sm text-white font-medium">{ch.name.toLowerCase().replace(/\s+/g, "-")}</span>
                  <span className="text-xs text-gray-500">{ch.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-500">{ch.postCount} post{ch.postCount !== 1 ? "s" : ""}</span>
                  {ch.latestPost && <span className="text-xs text-gray-600">Last: {new Date(ch.latestPost).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
