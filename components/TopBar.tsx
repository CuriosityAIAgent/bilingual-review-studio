"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Languages, LibraryBig, Moon, Sun, Upload } from "lucide-react";
import { useSeat, useTheme } from "./Providers";

const ROLE_DOT: Record<string, string> = {
  author: "var(--accent)", reviewer: "var(--edited)", approver: "var(--memory)",
  admin: "var(--ink-soft)", viewer: "var(--ink-faint)",
};

export function TopBar() {
  const { seats, seatId, setSeat, seat } = useSeat();
  const { theme, setTheme } = useTheme();
  const path = usePathname();
  const isReview = path?.startsWith("/review");

  return (
    <header
      style={{
        position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", gap: 18,
        padding: "11px 22px", background: "color-mix(in srgb, var(--bg) 86%, transparent)",
        borderBottom: "1px solid var(--line)", backdropFilter: "blur(10px)",
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Languages size={18} strokeWidth={1.7} style={{ color: "var(--accent)" }} />
        <span className="font-display" style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>
          Bilingual Review Studio
        </span>
      </Link>

      <nav className="font-ui" style={{ display: "flex", gap: 4, marginLeft: 10 }}>
        <NavLink href="/" active={path === "/"} icon={<Upload size={14} strokeWidth={1.8} />} label="Upload" />
        <NavLink href="/library" active={path?.startsWith("/library") || !!isReview} icon={<LibraryBig size={14} strokeWidth={1.8} />} label="Library" />
      </nav>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {/* Mock-auth seat switcher (spec §11) */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span className="dot" style={{ background: ROLE_DOT[seat?.role ?? "viewer"] }} />
          <select
            className="ui-base"
            aria-label="Active seat"
            value={seatId}
            onChange={(e) => setSeat(e.target.value)}
            style={{
              background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)",
              padding: "6px 10px", color: "var(--ink)", fontWeight: 500, cursor: "pointer",
            }}
          >
            {seats.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.display_name} · {s.role} · {s.team_name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-ghost"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "paper" ? "ink" : "paper")}
          style={{ padding: "7px 9px" }}
        >
          {theme === "paper" ? <Moon size={15} strokeWidth={1.8} /> : <Sun size={15} strokeWidth={1.8} />}
        </button>
      </div>
    </header>
  );
}

function NavLink({ href, active, icon, label }: { href: string; active?: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="ui-base"
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: "var(--r-sm)",
        fontWeight: 600, color: active ? "var(--ink)" : "var(--ink-soft)",
        background: active ? "var(--surface)" : "transparent",
        border: `1px solid ${active ? "var(--line)" : "transparent"}`,
      }}
    >
      {icon}
      {label}
    </Link>
  );
}
