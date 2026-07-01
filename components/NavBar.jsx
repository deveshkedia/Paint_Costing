"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/AuthContext";
import { Beaker, Package, Box, FileText, Users, LogOut } from "lucide-react";

const LINKS = [
  { href: "/products", label: "Products", icon: Beaker, roles: ["admin", "estimator"] },
  { href: "/raw-materials", label: "Raw Materials", icon: Package, roles: ["admin", "estimator", "rm_manager"] },
  { href: "/packing-materials", label: "Packing", icon: Box, roles: ["admin"] },
  { href: "/quotes", label: "Quotes", icon: FileText, roles: ["admin", "estimator"] },
  { href: "/admin", label: "Users", icon: Users, roles: ["admin"] },
];

export default function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <nav className="bg-teal text-paper">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-sm tracking-wide" style={{ fontFamily: "Georgia, serif" }}>
            Anupam Paints
          </span>
          <div className="hidden sm:flex items-center gap-1">
            {LINKS.filter((l) => l.roles.includes(user.role)).map((l) => {
              const Icon = l.icon;
              const active = pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    active ? "bg-paper/10 text-rustlight" : "text-paper/70 hover:text-paper hover:bg-paper/5"
                  }`}
                >
                  <Icon size={14} />
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-paper/60 hidden sm:inline">
            {user.name} · <span className="uppercase text-xs">{user.role}</span>
          </span>
          <button onClick={logout} className="flex items-center gap-1.5 text-paper/70 hover:text-paper transition-colors">
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>
      {/* Mobile nav row */}
      <div className="sm:hidden flex items-center gap-1 px-2 pb-2 overflow-x-auto">
        {LINKS.filter((l) => l.roles.includes(user.role)).map((l) => {
          const Icon = l.icon;
          const active = pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                active ? "bg-paper/10 text-rustlight" : "text-paper/70"
              }`}
            >
              <Icon size={13} />
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
