"use client";
import type { CSSProperties } from "react";
import type { Block } from "@/src/lib/doc-model";

// The outline is a "scan for problems, fix, hand off" navigator. Only two states
// earn a dot: the machine flagged a problem here, or you've edited it. Everything
// else is a neutral dot (nothing to flag) — no ceremony, nothing to explain.
type DotKind = "needsReview" | "edited" | "default";

function dotKind(b: Block): DotKind {
  // Accepted/locked is final (matches SegmentRow + gateBlock) — never flag it,
  // even if stale validator results linger. We just don't give it its own dot
  // colour anymore (no accept/lock ceremony in this simplified outline).
  if (b.seg_status === "locked" || b.seg_status === "accepted") return "default";
  // Then problems — a still-failing segment stays flagged even after an edit.
  if (b.validator_results.some((v) => v.status === "fail" && v.blocking)) return "needsReview";
  if (b.seg_status === "edited") return "edited";
  return "default";
}

const COLOR: Record<DotKind, string> = {
  needsReview: "var(--flag)",
  edited: "var(--edited)",
  default: "var(--ink-faint)",
};

// "needs review" gets a halo so it reads as an alert and isn't confused with the
// (similarly warm) "edited" colour — distinguished by shape, not just hue.
function dotStyle(kind: DotKind): CSSProperties {
  return {
    background: COLOR[kind],
    flexShrink: 0,
    ...(kind === "needsReview" ? { boxShadow: "0 0 0 2px color-mix(in srgb, var(--flag) 35%, transparent)" } : {}),
  };
}

const LEGEND: { kind: DotKind; label: string }[] = [
  { kind: "needsReview", label: "needs review" },
  { kind: "edited", label: "edited" },
];

export function OutlineNavigator({ blocks, onJump }: { blocks: Block[]; onJump: (id: string) => void }) {
  return (
    // alignSelf:stretch makes this column full-height so the sticky panel below
    // stays pinned while the editor scrolls (the row is align-items:flex-start).
    <aside style={{ width: 240, flexShrink: 0, alignSelf: "stretch" }}>
      <div style={{ position: "sticky", top: 172, maxHeight: "calc(100dvh - 188px)", overflowY: "auto", overflowX: "hidden" }}>
        <span className="label">Outline</span>
        {/* Only the two states worth acting on. paddingLeft leaves room for the
            "needs review" halo so it isn't clipped at the panel edge. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", margin: "8px 0 12px", paddingLeft: 3 }}>
          {LEGEND.map((l) => (
            <span key={l.kind} className="ui-base" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-faint)", fontSize: 11 }}>
              <span className="dot" style={dotStyle(l.kind)} /> {l.label}
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
