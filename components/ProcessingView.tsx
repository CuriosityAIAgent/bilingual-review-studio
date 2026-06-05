"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/**
 * Shown while a document is being translated. The four automated pipeline
 * stages genuinely run server-side during this wait (translate → validate →
 * apply governed memory → cross-model refine); this walks the stepper through
 * them so the rigor is visible. It advances on a timer and holds on the last
 * stage ("Refining…") until the page redirects — so a longer document that is
 * still working simply stays on the final step rather than racing ahead.
 */
// The translator is named (it's the one constant — Claude Sonnet 4.6); the
// critic is referred to generically as "a second, independent model" so the
// caption stays correct whichever critic the config pins (or when no OpenAI key
// is present and the deterministic critic stands in). Never hardcode a brand for
// a configurable stage. The critic *reviews*, the translator *rewrites* what it
// flags — the captions reflect that split.
const STAGES = [
  { key: "translate", label: "Translate", caption: "The translator (Claude Sonnet 4.6) drafts each segment in neutral Spanish…" },
  { key: "checks", label: "Checks", caption: "Deterministic validators check numbers, dates, glossary and regionalisms…" },
  { key: "governance", label: "Governance", caption: "Applying your governed memory — approved rules and glossary…" },
  { key: "rewrite", label: "Rewrite", caption: "A second, independent model reviews the weak segments and the translator refines them — a decorrelated check on the first…" },
];
// Rewrite is the slowest stage and the page holds here until the pipeline returns.
// Rotate through the real sub-steps so a longer document reads as actively working
// rather than frozen on one caption.
const REWRITE_SUBSTEPS = [
  "Quality-scoring each segment to route attention…",
  "The independent critic flags the weak segments…",
  "Re-translating only the segments that objectively failed…",
  "Re-scoring each rewrite — keeping it only if it actually improved…",
  "Reverting no-gain rewrites and locking in the best version…",
];
const STEP_MS = 820;
const SUBSTEP_MS = 2100;

export function ProcessingView() {
  const [step, setStep] = useState(0);
  const [sub, setSub] = useState(0);
  const [secs, setSecs] = useState(0);
  const atRewrite = step === STAGES.length - 1;

  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STAGES.length - 1)), STEP_MS);
    return () => clearInterval(t);
  }, []);

  // Once we reach (and hold on) the rewrite stage, cycle sub-steps and count
  // elapsed seconds so the wait visibly progresses on long documents.
  useEffect(() => {
    if (!atRewrite) return;
    const r = setInterval(() => setSub((s) => (s + 1) % REWRITE_SUBSTEPS.length), SUBSTEP_MS);
    const e = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => { clearInterval(r); clearInterval(e); };
  }, [atRewrite]);

  return (
    <div className="fade-up" style={{ display: "grid", placeItems: "center", padding: "84px 24px", minHeight: 440 }}>
      <div style={{ maxWidth: 640, width: "100%", textAlign: "center" }}>
        <p className="label" style={{ marginBottom: 8 }}>Translating</p>
        <h2 className="font-display" style={{ fontSize: 25, letterSpacing: "-0.015em", marginBottom: 30 }}>Working through the pipeline</h2>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
          {STAGES.map((st, i) => {
            const state = i < step ? "done" : i === step ? "active" : "pending";
            const color = state === "done" ? "var(--memory)" : state === "active" ? "var(--accent)" : "var(--ink-faint)";
            return (
              <div key={st.key} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 104 }}>
                  <div
                    className={state === "active" ? "live-dot" : ""}
                    style={{
                      width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center",
                      border: `1.5px solid ${color}`,
                      background: state === "done" ? "var(--memory)" : state === "active" ? "color-mix(in srgb, var(--accent) 14%, var(--surface))" : "var(--surface)",
                      color: state === "done" ? "#fff" : color,
                      boxShadow: state === "active" ? "0 0 0 4px color-mix(in srgb, var(--accent) 15%, transparent)" : "none",
                      transition: "all .35s var(--ease)",
                    }}
                  >
                    {state === "done" ? <Check size={16} strokeWidth={2.4} /> : <span className="mono" style={{ fontSize: 12.5 }}>{i + 1}</span>}
                  </div>
                  <span className="ui-base" style={{ fontWeight: state === "active" ? 600 : 500, color: state === "pending" ? "var(--ink-faint)" : "var(--ink)" }}>{st.label}</span>
                </div>
                {i < STAGES.length - 1 && (
                  <div style={{ width: 52, height: 2, background: i < step ? "var(--memory)" : "var(--line)", borderRadius: 2, marginTop: 15, transition: "background .35s var(--ease)" }} />
                )}
              </div>
            );
          })}
        </div>

        <p className="doc-body" style={{ color: "var(--ink-soft)", marginTop: 28, fontSize: 15.5 }}>
          {STAGES[step].caption}
        </p>
        {/* On the held rewrite stage, the caption above names what the stage does;
            this line rotates through the actual sub-steps so it reads as working. */}
        {atRewrite && (
          <p className="ui-base" style={{ display: "inline-flex", alignItems: "center", gap: 9, color: "var(--ink-soft)", marginTop: 8, fontSize: 13 }}>
            <span className="dot live-dot" style={{ background: "var(--accent)", flexShrink: 0 }} />
            {REWRITE_SUBSTEPS[sub]}
          </p>
        )}
        {/* Reassurance for a long refine pass — only after a few seconds, so a
            fast document never flashes it. */}
        {atRewrite && secs >= 4 && (
          <p className="ui-base mono" style={{ color: "var(--ink-faint)", marginTop: 10, fontSize: 12 }}>
            Still refining — longer documents take a little more time · {secs}s
          </p>
        )}
        <p className="ui-base" style={{ color: "var(--ink-faint)", marginTop: 10, fontSize: 12, maxWidth: 480, marginInline: "auto" }}>
          A quality-estimation model (in-container) scores each segment to route attention — a routing signal only. Validators and your review decide.
        </p>
      </div>
    </div>
  );
}
