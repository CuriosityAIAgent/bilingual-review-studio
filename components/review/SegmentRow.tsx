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

const NUM_SPLIT = /(-?\d[\d,.]*\s?%?|\$[\d,.]+|[A-Z]{2}[A-Z0-9]{9}\d|\$[A-Z]{1,5})/g;
const NUM_TEST = /^(?:-?\d[\d,.]*\s?%?|\$[\d,.]+|[A-Z]{2}[A-Z0-9]{9}\d|\$[A-Z]{1,5})$/;
function withNumbers(text: string, keyBase = 0) {
  return text.split(NUM_SPLIT).map((p, i) =>
    NUM_TEST.test(p) ? <span key={`${keyBase}-${i}`} className="num-hl">{p}</span> : <span key={`${keyBase}-${i}`}>{p}</span>,
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Render the target text, underlining phrases the governed memory produced
 *  (applied neutralization rules + glossary terms) — the visible learning loop.
 *  Numbers/figures still get the mono highlight inside the non-memory gaps. */
function renderTarget(text: string, mem: { phrase: string; note: string }[]) {
  const phrases = mem.map((m) => m.phrase).filter(Boolean);
  if (phrases.length === 0) return withNumbers(text);
  const sorted = [...new Set(phrases)].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`(${sorted.join("|")})`, "gi");
  const noteFor = (s: string) => mem.find((m) => m.phrase.toLowerCase() === s.toLowerCase())?.note ?? "From governed memory";
  let k = 0;
  return text.split(re).filter(Boolean).map((chunk) =>
    phrases.some((p) => p.toLowerCase() === chunk.toLowerCase())
      ? <span key={`m-${k++}`} className="mem" title={noteFor(chunk)}>{chunk}</span>
      : <span key={`g-${k++}`}>{withNumbers(chunk, k)}</span>,
  );
}

export function SegmentRow({ block, index, caps, onEdit, onAccept, onReject, onLock, onTeach }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const isTitle = block.type === "title";
  const isHead = isTitle || block.type === "subhead";
  const locked = block.seg_status === "locked";
  const editable = caps.canEdit && !locked;
  const fontSize = isTitle ? 25 : block.type === "subhead" ? 19 : 18.5;

  const ledgerClass =
    block.seg_status === "edited" ? "is-edited"
    : block.seg_status === "locked" ? "is-memory"
    : block.seg_status === "accepted" ? "is-accepted"
    : block.validator_results.some((v) => v.status === "fail" && v.blocking) ? "is-flag"
    : "";

  const failedValidators = block.validator_results.filter((v) => v.status === "fail");
  const memPhrases = [
    ...block.neutralization_hits.filter((h) => h.applied).map((h) => ({ phrase: h.neutral_form, note: `Memory rule applied: ${h.regional_form} → ${h.neutral_form}` })),
    ...block.glossary_hits.filter((h) => h.applied).map((h) => ({ phrase: h.approved_target, note: `Glossary applied: ${h.source} → ${h.approved_target}` })),
  ];
  const commit = () => {
    const text = ref.current?.innerText.trim() ?? "";
    if (text && text !== block.final_text) onEdit(block.id, text, []);
  };

  return (
    <div
      id={`seg-${block.id}`}
      className={`ledger ${ledgerClass}`}
      style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
        borderTop: "1px solid var(--line-2)", scrollMarginTop: 200,
        background: block.seg_status === "edited" ? "color-mix(in srgb, var(--edited) 4%, transparent)" : "transparent",
      }}
    >
      {/* English source — LEFT, reference */}
      <div style={{ padding: "18px 28px 18px 16px", borderRight: "1px solid var(--line-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <span className="label">English · source</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-faint)" }}>#{index + 1}</span>
          {isHead && <span className="tag">{block.type}</span>}
        </div>
        <div
          className={`doc-body ${isHead ? "font-display" : ""}`}
          aria-label="English source, reference"
          style={{ fontSize, fontWeight: isHead ? 600 : 400, color: "var(--ink-soft)", lineHeight: 1.66 }}
        >
          {withNumbers(block.source_text)}
        </div>
      </div>

      {/* Spanish target — RIGHT, the editable deliverable */}
      <div style={{ padding: "18px 16px 18px 28px", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, flexWrap: "wrap" }}>
          <span className="label">Español neutro · target</span>
          {block.qe_score !== null && (
            <span
              className={`qe ${block.qe_score >= 0.72 ? "hi" : block.qe_score >= 0.55 ? "mid" : "lo"}`}
              title={
                `QE ${block.qe_score} — quality estimate (0–1): the machine's confidence in this translation.\n` +
                "Routing signal only; the validators and your review decide. Green ≥0.72 · amber ≥0.55 · red below." +
                (block.critic_flags.length ? `\n\nFlags:\n${block.critic_flags.map((f) => `• ${f.category}: ${f.suggestion}`).join("\n")}` : "")
              }
            >
              <span className="bar"><i style={{ width: `${Math.round(block.qe_score * 100)}%` }} /></span>
              QE <b>{block.qe_score}</b>
            </span>
          )}
          {block.seg_status === "edited" && <span className="tag edited">edited</span>}
          {locked && <span className="tag memory"><Lock size={9} /> locked</span>}
          {block.seg_status === "accepted" && <span className="tag memory"><Check size={9} /> accepted</span>}
          {block.neutralization_hits.length > 0 && <span className="tag memory"><BookOpen size={9} /> {block.neutralization_hits.length} neutralized</span>}
        </div>
        <div
          key={`${block.id}-${block.final_text}`}
          ref={ref}
          className={`cell doc-body ${isHead ? "font-display" : ""}`}
          contentEditable={editable}
          suppressContentEditableWarning
          onBlur={commit}
          lang="es"
          spellCheck={false}
          aria-label="Spanish target, editable"
          style={{
            fontSize, fontWeight: isHead ? 600 : 400, minHeight: 24, lineHeight: 1.66,
            fontStyle: block.type === "disclaimer" ? "italic" : "normal",
            color: block.type === "disclaimer" ? "var(--ink-soft)" : "var(--ink)",
          }}
        >
          {renderTarget(block.final_text, memPhrases)}
        </div>

        {/* Inline flags */}
        {block.critic_flags.map((f, i) => (
          <div key={`cf-${i}`} className="ui-base" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, color: "var(--flag)" }}>
            <span className="dot" style={{ background: f.severity === "critical" ? "var(--flag)" : f.severity === "major" ? "var(--edited)" : "var(--ink-faint)" }} />
            <span style={{ fontWeight: 600 }}>{f.category}</span>
            <span style={{ color: "var(--ink-soft)" }}>{f.span}{f.suggestion ? ` → ${f.suggestion}` : ""}</span>
            {f.category === "regionalism" && caps.canPropose && (
              <button className="btn btn-ghost ui-base" style={{ padding: "3px 8px", marginLeft: "auto", color: "var(--accent)" }} onClick={() => onTeach(f.span, f.suggestion || "", block.id)}>
                <Sparkles size={12} /> Teach rule
              </button>
            )}
          </div>
        ))}
        {failedValidators.map((v, i) => (
          <div key={`vf-${i}`} className="ui-base" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, color: v.severity === "critical" ? "var(--flag)" : "var(--ink-soft)" }}>
            <AlertTriangle size={12} strokeWidth={1.8} />
            <span style={{ fontWeight: 600 }}>{v.validator}</span>
            <span>{v.issues[0]?.message ?? "failed"}</span>
          </div>
        ))}

        {/* Per-segment actions */}
        {(caps.canAccept || caps.canLock) && !isHead && (
          <div style={{ display: "flex", gap: 6, marginTop: 12, opacity: 0.92 }}>
            {caps.canAccept && !locked && (block.seg_status === "edited" || block.seg_status === "proposed" || block.seg_status === "machine") && (
              <button className="btn btn-ghost ui-base" style={{ padding: "4px 9px", color: "var(--memory)" }} onClick={() => onAccept(block.id)}><Check size={12} /> Accept</button>
            )}
            {caps.canAccept && (block.seg_status === "edited" || block.seg_status === "proposed") && (
              <button className="btn btn-ghost ui-base" style={{ padding: "4px 9px", color: "var(--flag)" }} onClick={() => onReject(block.id)}><X size={12} /> Reject</button>
            )}
            {caps.canLock && !locked && (
              <button className="btn btn-ghost ui-base" style={{ padding: "4px 9px" }} onClick={() => onLock(block.id)}><Lock size={12} /> Lock</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
