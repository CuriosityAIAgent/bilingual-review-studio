"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, House, LibraryBig, Moon, SquarePen, Sun } from "lucide-react";
import { roleLabel } from "@/app/lib/roles";
import { useSeat, useTheme } from "./Providers";

const ROLE_DOT: Record<string, string> = {
  author: "var(--accent)", reviewer: "var(--edited)", approver: "var(--memory)",
  admin: "var(--ink-soft)", viewer: "var(--ink-faint)",
};

export function TopBar() {
  const { seat, signOut } = useSeat();
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
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="seal" aria-hidden>T</span>
        <span className="font-display" style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>
          Translation Studio
        </span>
      </Link>

      <nav className="font-ui" style={{ display: "flex", gap: 4, marginLeft: 10 }}>
        <NavLink href="/" active={path === "/"} icon={<House size={14} strokeWidth={1.8} />} label="Home" />
        <NavLink href="/library" active={path?.startsWith("/library")} icon={<LibraryBig size={14} strokeWidth={1.8} />} label="Library" />
        <NavLink href="/train" active={path?.startsWith("/train")} icon={<GraduationCap size={14} strokeWidth={1.8} />} label="Train" />
        {/* The per-document review screen IS the editor — show it as its own tab
            (it was previously bucketed under "Library", which read as mislabeled). */}
        {isReview && <NavLink href={path || "/"} active icon={<SquarePen size={14} strokeWidth={1.8} />} label="Editor" />}
      </nav>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {/* Signed-in identity (login screen sets the role) */}
        <span className="dot" style={{ background: ROLE_DOT[seat?.role ?? "viewer"] }} />
        <span className="ui-base" style={{ fontWeight: 600 }}>{roleLabel(seat?.role ?? "viewer")}</span>
        <button className="btn btn-ghost ui-base" onClick={signOut} style={{ padding: "5px 11px", marginLeft: 2 }}>
          Sign out
        </button>
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
