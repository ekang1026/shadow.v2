"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/review", label: "Due for Review", icon: "📋" },
  { href: "/hvt", label: "HVT", icon: "🎯" },
  { href: "/ingestions", label: "Ingestions", icon: "📥" },
  { href: "/metrics", label: "Monthly Metrics", icon: "📊" },
  { href: "/slack", label: "Slack Integration", icon: "💬" },
  { href: "/costs", label: "API Costs", icon: "💰" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar_collapsed") === "true");
    setMounted(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(collapsed));
    // Dispatch event so layout can react
    window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: collapsed }));
  }, [collapsed]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <aside
      className={`bg-gray-950 border-r border-gray-800 flex flex-col h-screen fixed left-0 top-0 transition-all duration-200 z-50 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className={`border-b border-gray-800 flex items-center ${collapsed ? "p-3 justify-center" : "p-6 justify-between"}`}>
        {!collapsed && (
          <div>
            <h1 className="text-xl font-bold text-white">Shadow</h1>
            <p className="text-xs text-gray-500 mt-1">Grayline Partners</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-gray-400 hover:text-white transition-colors cursor-pointer p-1 rounded hover:bg-gray-800"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              } ${
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-900"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="text-base">{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-gray-800">
        <button
          onClick={handleSignOut}
          className={`w-full flex items-center gap-3 text-sm text-gray-400 hover:text-white hover:bg-gray-900 rounded-lg transition-colors cursor-pointer ${
            collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
          }`}
          title={collapsed ? "Sign Out" : undefined}
        >
          <span className={`${collapsed ? "text-lg" : "text-base"}`} title="Sign Out">🚪</span>
          {!collapsed && "Sign Out"}
          {collapsed && <span className="sr-only">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
