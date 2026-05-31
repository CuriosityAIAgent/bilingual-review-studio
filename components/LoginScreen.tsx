"use client";
import { Languages } from "lucide-react";
import type { Seat } from "@/src/auth";
import { roleLabel } from "@/app/lib/roles";

const ROLE_COLOR: Record<string, string> = {
  author: "var(--accent)", reviewer: "var(--edited)", approver: "var(--memory)",
  admin: "var(--ink-soft)", viewer: "var(--ink-faint)",
};
// The three people who run the short process.
const PRIMARY = ["ana", "diego", "carmen"];

export function LoginScreen({ seats, onSignIn }: { seats: Seat[]; onSignIn: (id: string) => void }) {
  const people = seats.filter((s) => PRIMARY.includes(s.user_id));
  const others = seats.filter((s) => !PRIMARY.includes(s.user_id));

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="fade-up" style={{ maxWidth: 480, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 18 }}>
          <Languages size={20} strokeWidth={1.7} style={{ color: "var(--accent)" }} />
          <span className="font-display" style={{ fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Translation Studio</span>
        </div>
        <h1 className="font-display" style={{ fontSize: 30, letterSpacing: "-0.02em", textAlign: "center" }}>Who's logging in?</h1>
        <p className="doc-body" style={{ color: "var(--ink-soft)", marginTop: 8, textAlign: "center" }}>
          Choose your role. Each document is worked by one person at a time, then handed down the chain.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 26 }}>
          {people.map((s) => (
            <button
              key={s.user_id}
              className="card"
              onClick={() => onSignIn(s.user_id)}
              style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", textAlign: "left", width: "100%" }}
            >
              <span className="dot" style={{ width: 11, height: 11, background: ROLE_COLOR[s.role], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="font-display" style={{ fontWeight: 600, fontSize: 16 }}>{roleLabel(s.role)}</div>
              </div>
              <span className="ui-base" style={{ color: "var(--accent)", fontWeight: 600 }}>Enter →</span>
            </button>
          ))}
        </div>

        {others.length > 0 && (
          <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
            <span className="label">also</span>
            {others.map((s) => (
              <button key={s.user_id} className="btn btn-ghost ui-base" style={{ padding: "5px 11px" }} onClick={() => onSignIn(s.user_id)}>
                {roleLabel(s.role)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
