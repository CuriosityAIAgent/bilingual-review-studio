"use client";
import type { CSSProperties } from "react";
import type { Block } from "@/src/lib/doc-model";
import { blockNeedsReview } from "@/src/lib/doc-model";

// "Scan for problems, fix, hand off." A segment is DONE when the reviewer has
// actually read it and it has no outstanding problem; it NEEDS REVIEW when a
// blocking validator flags one; it is UNREVIEWED while it's still a clean machine
// draft the reviewer hasn't scrolled past yet. "edited" is also done, but worth
// marking as touched.
type DotKind = "needsReview" | "edited" | "unreviewed" | "done";

function dotKind(b: Block, ocrUsed: boolean, seen: boolean): DotKind {
  // Same human-review definition as the quality gate + the card metric
  // (validators, critic, disclaimer, QE, and the doc-level OCR flag).
  // accepted/locked is final → done even for OCR docs.
  if (b.seg_status === "locked" || b.seg_status === "accepted") return "done";
  // OCR-derived docs route every other segment to human review (matches the gate).
  if (ocrUsed || blockNeedsReview(b)) return "needsReview";
  if (b.seg_status === "edited") return "edited"; // edited & clean — done, but marked as touched
  // A clean, machine-drafted segment is NOT "done" just because the model is
  // confident — it's done once a human has eyes on it. Stay "unreviewed" until
  // the reviewer scrolls it into view (confirmed read, no change needed).
  if (b.seg_status === "machine" && !seen) return "unreviewed";
  return "done"; // read & clean — no outstanding problem
  // Note: this client nav-aid uses the DEFAULT QE floor (the browser can't read
  // config — the whole client does, e.g. SegmentRow's QE chip); the authoritative
  // card/gate use the configured human_floor. They match on the shipped config.
}

const COLOR: Record<DotKind, string> = {
  needsReview: "var(--flag)",
  edited: "var(--edited)",
  unreviewed: "var(--ink-faint)",
  done: "var(--memory)",
};

// "needs review" gets a halo so it reads as an alert and isn't confused with the
// (similarly warm) "edited" colour — distinguished by shape, not just hue.
// "unreviewed" is a hollow ring (not a filled dot) so an un-read draft never
// looks like a completed segment at a glance.
function dotStyle(kind: DotKind): CSSProperties {
  if (kind === "unreviewed") {
    return { background: "transparent", flexShrink: 0, boxShadow: "inset 0 0 0 1.5px var(--ink-faint)" };
  }
  return {
    background: COLOR[kind],
    flexShrink: 0,
    ...(kind === "needsReview" ? { boxShadow: "0 0 0 2px color-mix(in srgb, var(--flag) 35%, transparent)" } : {}),
  };
}

const LEGEND: { kind: DotKind; label: string }[] = [
  { kind: "needsReview", label: "needs review" },
  { kind: "edited", label: "edited" },
  { kind: "unreviewed", label: "unreviewed" },
  { kind: "done", label: "done" },
];

export function OutlineNavigator({ blocks, onJump, ocrUsed = false, seen }: { blocks: Block[]; onJump: (id: string) => void; ocrUsed?: boolean; seen: Map<string, string> }) {
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
              {/* "seen" only counts if the signature matches the CURRENT text —
                  a re-translated draft is unseen again until re-scrolled. */}
              <span className="dot" style={dotStyle(dotKind(b, ocrUsed, seen.get(b.id) === (b.final_text || b.source_text)))} />
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
