"use client";
import type { Block } from "@/src/lib/doc-model";

function dotColor(b: Block): string {
  if (b.seg_status === "locked" || b.seg_status === "accepted") return "var(--memory)";
  if (b.validator_results.some((v) => v.status === "fail" && v.blocking)) return "var(--flag)";
  if (b.seg_status === "edited") return "var(--edited)";
  return "var(--ink-faint)";
}

export function OutlineNavigator({ blocks, onJump }: { blocks: Block[]; onJump: (id: string) => void }) {
  const approved = blocks.filter((b) => b.seg_status === "accepted" || b.seg_status === "locked").length;
  const pct = blocks.length ? Math.round((approved / blocks.length) * 100) : 0;

  return (
    <aside style={{ width: 240, flexShrink: 0 }}>
      <div style={{ position: "sticky", top: 172, maxHeight: "calc(100dvh - 188px)", overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span className="label">Outline</span>
          <span className="mono ui-base" style={{ color: "var(--accent)" }}>{pct}% approved</span>
        </div>
        <div style={{ height: 3, background: "var(--line)", borderRadius: 3, marginBottom: 12, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", transition: "width var(--dur) var(--ease)" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {blocks.map((b, i) => (
            <button
              key={b.id}
              onClick={() => onJump(b.id)}
              className="ui-base"
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: "var(--r-sm)",
                border: "none", background: "transparent", cursor: "pointer", textAlign: "left", color: "var(--ink-soft)",
              }}
            >
              <span className="dot" style={{ background: dotColor(b), flexShrink: 0 }} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: b.type === "title" || b.type === "subhead" ? 600 : 400 }}>
                {b.final_text || b.source_text}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
