"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/review", label: "Do for Review", icon: "📋" },
  { href: "/hvt", label: "HVT", icon: "🎯" },
  { href: "/metrics", label: "Monthly Metrics", icon: "📊" },
  { href: "/slack", label: "Slack Integration", icon: "💬" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <aside className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col h-screen fixed left-0 top-0">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">Shadow</h1>
        <p className="text-xs text-gray-500 mt-1">Grayline Partners</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-900"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-gray-900 rounded-lg transition-colors cursor-pointer"
        >
          <span className="text-base">↩</span>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
