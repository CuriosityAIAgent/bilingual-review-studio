"use client";
import { useRef } from "react";
import { AlertTriangle, BookOpen, Check, Lock, Sparkles, X } from "lucide-react";
import type { Block, FlagCategory } from "@/src/lib/doc-model";

export interface SegCaps {
  canEdit: boolean;
  canAccept: boolean;
  canLock: boolean;
  canPropose: boolean;
}

interface Props {
  block: Block;
  index: number;
  caps: SegCaps;
  onEdit: (blockId: string, text: string, cats: FlagCategory[]) => void;
  onAccept: (blockId: string) => void;
  onReject: (blockId: string) => void;
  onLock: (blockId: string) => void;
  onTeach: (regional: string, neutral: string, blockId: string) => void;
}

function qeColor(score: number | null): string {
  if (score === null) return "var(--ink-faint)";
  if (score >= 0.72) return "var(--qe-good)";
  if (score >= 0.55) return "var(--qe-warn)";
  return "var(--qe-low)";
}

const NUM_SPLIT = /(-?\d[\d,.]*\s?%?|\$[\d,.]+|[A-Z]{2}[A-Z0-9]{9}\d|\$[A-Z]{1,5})/g;
const NUM_TEST = /^(?:-?\d[\d,.]*\s?%?|\$[\d,.]+|[A-Z]{2}[A-Z0-9]{9}\d|\$[A-Z]{1,5})$/;
function withNumbers(text: string) {
  return text.split(NUM_SPLIT).map((p, i) =>
    NUM_TEST.test(p) ? (
      <span key={i} className="num-hl">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function SegmentRow({ block, index, caps, onEdit, onAccept, onReject, onLock, onTeach }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const isTitle = block.type === "title" || block.type === "subhead";
  const locked = block.seg_status === "locked";
  const editable = caps.canEdit && !locked;

  const ledgerClass =
    block.seg_status === "edited" ? "is-edited"
    : block.seg_status === "locked" ? "is-memory"
    : block.seg_status === "accepted" ? "is-accepted"
    : block.validator_results.some((v) => v.status === "fail" && v.blocking) ? "is-flag"
    : "";

  const failedValidators = block.validator_results.filter((v) => v.status === "fail");
  const commit = () => {
    const text = ref.current?.innerText.trim() ?? "";
    if (text && text !== block.final_text) onEdit(block.id, text, []);
  };

  return (
    <div
      id={`seg-${block.id}`}
      className={`ledger ${ledgerClass}`}
      style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26,
        padding: "16px 0 16px 14px", marginLeft: -14, borderTop: "1px solid var(--line)",
        scrollMarginTop: 120,
      }}
    >
      {/* Spanish (target) — left, the deliverable */}
      <div style={{ background: "var(--es-tint)", borderRadius: "var(--r-sm)", padding: "10px 12px", margin: "-8px -4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className="label">Español neutro</span>
          {block.qe_score !== null && (
            <span className="qe" title={block.critic_flags.map((f) => `${f.category}: ${f.suggestion}`).join("\n") || "no flags"}>
              <span className="dot" style={{ background: qeColor(block.qe_score) }} /> QE {block.qe_score}
            </span>
          )}
          {block.seg_status === "edited" && <span className="tag edited">edited</span>}
          {locked && <span className="tag memory"><Lock size={9} /> locked</span>}
          {block.seg_status === "accepted" && <span className="tag memory"><Check size={9} /> accepted</span>}
          {block.neutralization_hits.length > 0 && (
            <span className="tag memory"><BookOpen size={9} /> {block.neutralization_hits.length} neutralized</span>
          )}
        </div>
        <div
          key={`${block.id}-${block.final_text}`}
          ref={ref}
          className={`cell doc-body ${isTitle ? "font-display" : ""}`}
          contentEditable={editable}
          suppressContentEditableWarning
          onBlur={commit}
          aria-label="Spanish target, editable"
          style={{ fontSize: isTitle ? 19 : 16, fontWeight: isTitle ? 600 : 400, minHeight: 24, fontStyle: block.type === "disclaimer" ? "italic" : "normal", color: block.type === "disclaimer" ? "var(--ink-soft)" : "var(--ink)" }}
        >
          {block.final_text}
        </div>

        {/* Inline flags */}
        {block.critic_flags.map((f, i) => (
          <div key={`cf-${i}`} className="ui-base" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, color: "var(--flag)" }}>
            <span className="dot" style={{ background: f.severity === "critical" ? "var(--flag)" : f.severity === "major" ? "var(--edited)" : "var(--ink-faint)" }} />
            <span style={{ fontWeight: 600 }}>{f.category}</span>
            <span style={{ color: "var(--ink-soft)" }}>{f.span}{f.suggestion ? ` → ${f.suggestion}` : ""}</span>
            {f.category === "regionalism" && caps.canPropose && (
              <button className="btn btn-ghost ui-base" style={{ padding: "3px 8px", marginLeft: "auto", color: "var(--accent)" }}
                onClick={() => onTeach(f.span, f.suggestion || "", block.id)}>
                <Sparkles size={12} /> Teach rule
              </button>
            )}
          </div>
        ))}
        {failedValidators.map((v, i) => (
          <div key={`vf-${i}`} className="ui-base" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, color: v.severity === "critical" ? "var(--flag)" : "var(--ink-soft)" }}>
            <AlertTriangle size={12} strokeWidth={1.8} />
            <span style={{ fontWeight: 600 }}>{v.validator}</span>
            <span>{v.issues[0]?.message ?? "failed"}</span>
          </div>
        ))}
      </div>

      {/* English (source) — right, reference */}
      <div style={{ padding: "10px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className="label">English source · ref</span>
          <span className="tag">{block.type}</span>
        </div>
        <div className={`doc-body ${isTitle ? "font-display" : ""}`} aria-label="English source, reference"
          style={{ fontSize: isTitle ? 19 : 16, fontWeight: isTitle ? 600 : 400, color: "var(--ink-soft)" }}>
          {withNumbers(block.source_text)}
        </div>

        {/* Per-segment actions */}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {caps.canAccept && !locked && (block.seg_status === "edited" || block.seg_status === "proposed" || block.seg_status === "machine") && (
            <button className="btn btn-ghost ui-base" style={{ padding: "4px 9px", color: "var(--memory)" }} onClick={() => onAccept(block.id)}>
              <Check size={12} /> Accept
            </button>
          )}
          {caps.canAccept && (block.seg_status === "edited" || block.seg_status === "proposed") && (
            <button className="btn btn-ghost ui-base" style={{ padding: "4px 9px", color: "var(--flag)" }} onClick={() => onReject(block.id)}>
              <X size={12} /> Reject
            </button>
          )}
          {caps.canLock && !locked && (
            <button className="btn btn-ghost ui-base" style={{ padding: "4px 9px" }} onClick={() => onLock(block.id)}>
              <Lock size={12} /> Lock
            </button>
          )}
          <span className="ui-base mono" style={{ marginLeft: "auto", color: "var(--ink-faint)", alignSelf: "center" }}>#{index + 1}</span>
        </div>
      </div>
    </div>
  );
}
