"use client";
import { useRef, useState } from "react";
import { AlertTriangle, BookOpen, Check, Lock, Save, Sparkles, X } from "lucide-react";
import type { Block, FlagCategory } from "@/src/lib/doc-model";
import { changedPhrase } from "@/src/lib/text-diff";

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
// Cap each side of the "edited" diff so a large multi-sentence change can't
// overflow the column and break the segment layout (full text shown on hover).
const clip = (s: string, n = 44) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Render the target text, underlining phrases the governed memory produced
 *  (applied neutralization rules + glossary terms) — the visible learning loop.
 *  Numbers/figures still get the mono highlight inside the non-memory gaps. */
function renderTarget(text: string, marks: { phrase: string; note: string; cls: string }[]) {
  const phrases = marks.map((m) => m.phrase).filter(Boolean);
  if (phrases.length === 0) return withNumbers(text);
  const sorted = [...new Set(phrases)].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`(${sorted.join("|")})`, "gi");
  const markFor = (s: string) => marks.find((m) => m.phrase.toLowerCase() === s.toLowerCase());
  let k = 0;
  return text.split(re).filter(Boolean).map((chunk) => {
    const m = phrases.some((p) => p.toLowerCase() === chunk.toLowerCase()) ? markFor(chunk) : null;
    return m
      ? <span key={`m-${k++}`} className={m.cls} title={m.note}>{chunk}</span>
      : <span key={`g-${k++}`}>{withNumbers(chunk, k)}</span>;
  });
}

export function SegmentRow({ block, index, caps, onEdit, onAccept, onReject, onLock, onTeach }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  // Tracks the last text we dispatched, so commit() never fires the same edit
  // twice (e.g. blur + explicit Save in one click) — which would 409 on rev.
  const lastSaved = useRef(block.final_text);
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
  // What the reviewer changed from the machine draft, stated in the note below.
  // (An inline underline would need a position-aware diff to be accurate — short
  // tokens, repeats, and overlap with memory highlights make value-matching wrong
  // — so that's a deliberate follow-up; the note is unambiguous on its own.)
  const edit = block.seg_status === "edited" ? changedPhrase(block.mt_text, block.final_text) : { from: "", to: "" };
  const marks = [
    ...block.neutralization_hits.filter((h) => h.applied).map((h) => ({ phrase: h.neutral_form, note: `Memory rule applied: ${h.regional_form} → ${h.neutral_form}`, cls: "mem" })),
    ...block.glossary_hits.filter((h) => h.applied).map((h) => ({ phrase: h.approved_target, note: `Glossary applied: ${h.source} → ${h.approved_target}`, cls: "mem" })),
  ];
  const commit = () => {
    const text = ref.current?.innerText.trim() ?? "";
    if (text && text !== block.final_text && text !== lastSaved.current) {
      lastSaved.current = text;
      onEdit(block.id, text, []);
    }
    setDirty(false);
  };
  const onInput = () => {
    // Any fresh keystroke clears the dedupe guard, so re-applying the same text
    // after a 409 reload still dispatches (the guard only blocks a no-input
    // double-fire like blur immediately after Save).
    lastSaved.current = block.final_text;
    setDirty((ref.current?.innerText.trim() ?? "") !== block.final_text);
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
          onInput={onInput}
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
          {renderTarget(block.final_text, marks)}
        </div>

        {/* What the reviewer changed, stated below the segment (mirrors the flags).
            Shows for insertions, replacements AND deletion-only edits. */}
        {(edit.from || edit.to) && (
          <div className="ui-base" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, color: "var(--edited)", minWidth: 0 }}>
            <Check size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 600, flexShrink: 0 }}>edited</span>
            <span
              title={`${edit.from || "—"} → ${edit.to || "(removed)"}`}
              style={{ color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
            >
              <span style={{ textDecoration: "line-through" }}>{clip(edit.from) || "—"}</span> → {clip(edit.to) || "(removed)"}
            </span>
          </div>
        )}

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
        {(caps.canEdit || caps.canAccept || caps.canLock) && !isHead && (
          <div style={{ display: "flex", gap: 6, marginTop: 12, opacity: 0.92, flexWrap: "wrap", alignItems: "center" }}>
            {caps.canEdit && !locked && (
              <button
                className="btn btn-ghost ui-base"
                style={{ padding: "4px 9px", color: dirty ? "var(--accent)" : "var(--ink-faint)", fontWeight: dirty ? 600 : 400 }}
                onClick={commit}
                title={dirty ? "Save this edit — it also feeds translation memory" : "Saved (edits auto-save and feed memory)"}
              >
                {dirty ? <><Save size={12} /> Save</> : <><Check size={12} /> Saved</>}
              </button>
            )}
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
