"use client";
import type { CSSProperties } from "react";
import type { Block } from "@/src/lib/doc-model";

// Each segment maps to one outline state. The dot encodes it so the outline
// doubles as "jump to what needs attention". Explained by the legend below.
type DotKind = "needsReview" | "edited" | "done" | "untouched";

function dotKind(b: Block): DotKind {
  if (b.seg_status === "locked" || b.seg_status === "accepted") return "done";
  if (b.validator_results.some((v) => v.status === "fail" && v.blocking)) return "needsReview";
  if (b.seg_status === "edited") return "edited";
  return "untouched";
}

// "needs review" gets a halo so it reads as an alert and isn't confused with the
// (similarly warm) "edited" colour — distinguished by shape, not just hue.
const DOT: Record<DotKind, { color: string; label: string; ring: boolean }> = {
  needsReview: { color: "var(--flag)", label: "needs review", ring: true },
  edited: { color: "var(--edited)", label: "edited", ring: false },
  done: { color: "var(--memory)", label: "accepted / locked", ring: false },
  untouched: { color: "var(--ink-faint)", label: "untouched", ring: false },
};

function dotStyle(kind: DotKind): CSSProperties {
  const d = DOT[kind];
  return {
    background: d.color,
    flexShrink: 0,
    ...(d.ring ? { boxShadow: "0 0 0 2px color-mix(in srgb, var(--flag) 35%, transparent)" } : {}),
  };
}

export function OutlineNavigator({ blocks, onJump }: { blocks: Block[]; onJump: (id: string) => void }) {
  return (
    // alignSelf:stretch makes this column full-height so the sticky panel below
    // stays pinned while the editor scrolls (the row is align-items:flex-start).
    <aside style={{ width: 240, flexShrink: 0, alignSelf: "stretch" }}>
      <div style={{ position: "sticky", top: 172, maxHeight: "calc(100dvh - 188px)", overflowY: "auto", overflowX: "hidden" }}>
        <span className="label">Outline</span>
        {/* What the dots mean — navigation aid, not a score. paddingLeft leaves
            room for the "needs review" halo so it isn't clipped at the panel edge. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", margin: "8px 0 12px", paddingLeft: 3 }}>
          {(Object.keys(DOT) as DotKind[]).map((k) => (
            <span key={k} className="ui-base" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-faint)", fontSize: 11 }}>
              <span className="dot" style={dotStyle(k)} /> {DOT[k].label}
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
              <span className="dot" style={dotStyle(dotKind(b))} />
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
