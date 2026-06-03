"use client";
import type { Block } from "@/src/lib/doc-model";

// The dot encodes each segment's review state so the outline doubles as a
// "jump to what needs attention" navigator. Explained by the legend below.
function dotColor(b: Block): string {
  if (b.seg_status === "locked" || b.seg_status === "accepted") return "var(--memory)";
  if (b.validator_results.some((v) => v.status === "fail" && v.blocking)) return "var(--flag)";
  if (b.seg_status === "edited") return "var(--edited)";
  return "var(--ink-faint)";
}

const LEGEND: { color: string; label: string }[] = [
  { color: "var(--flag)", label: "needs review" },
  { color: "var(--edited)", label: "edited" },
  { color: "var(--memory)", label: "accepted / locked" },
];

export function OutlineNavigator({ blocks, onJump }: { blocks: Block[]; onJump: (id: string) => void }) {
  return (
    // alignSelf:stretch makes this column full-height so the sticky panel below
    // stays pinned while the editor scrolls (the row is align-items:flex-start).
    <aside style={{ width: 240, flexShrink: 0, alignSelf: "stretch" }}>
      <div style={{ position: "sticky", top: 172, maxHeight: "calc(100dvh - 188px)", overflowY: "auto", overflowX: "hidden" }}>
        <span className="label">Outline</span>
        {/* What the dots mean — navigation aid, not a score. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", margin: "8px 0 12px" }}>
          {LEGEND.map((l) => (
            <span key={l.label} className="ui-base" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--ink-faint)", fontSize: 11 }}>
              <span className="dot" style={{ background: l.color }} /> {l.label}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {blocks.map((b) => (
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
