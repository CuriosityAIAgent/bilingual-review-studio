"use client";
import { useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";

interface Props {
  initialRegional: string;
  initialNeutral: string;
  onClose: () => void;
  onSubmit: (regional: string, neutral: string, reason: string, variant: string) => void;
}

export function TeachRuleModal({ initialRegional, initialNeutral, onClose, onSubmit }: Props) {
  const [regional, setRegional] = useState(initialRegional);
  const [neutral, setNeutral] = useState(initialNeutral);
  const [reason, setReason] = useState("");
  const [variant, setVariant] = useState("es-ES");

  const input: React.CSSProperties = {
    width: "100%", padding: "9px 11px", borderRadius: "var(--r-sm)", border: "1px solid var(--line)",
    background: "var(--surface-2)", color: "var(--ink)", fontFamily: "'Newsreader',serif", fontSize: 15, marginTop: 5,
  };

  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "color-mix(in srgb, var(--ink) 38%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "100%", padding: 26, boxShadow: "var(--shadow-float)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
          <Sparkles size={18} style={{ color: "var(--accent)" }} />
          <h2 className="font-display" style={{ fontSize: 20 }}>Teach a neutralization rule</h2>
        </div>
        <p className="ui-base" style={{ color: "var(--ink-soft)", marginBottom: 18 }}>
          Captured as governed institutional memory. It will neutralize this clash automatically on future documents
          once approved (spec §13).
        </p>

        <label className="label">Regional form (avoid)</label>
        <input style={input} value={regional} onChange={(e) => setRegional(e.target.value)} />

        <label className="label" style={{ display: "block", marginTop: 14 }}>Neutral form (use)</label>
        <input style={input} value={neutral} onChange={(e) => setNeutral(e.target.value)} />

        <label className="label" style={{ display: "block", marginTop: 14 }}>Variant</label>
        <select style={input} value={variant} onChange={(e) => setVariant(e.target.value)}>
          <option value="es-ES">Peninsular (es-ES)</option>
          <option value="es-MX">Mexican (es-MX)</option>
          <option value="other">Other</option>
        </select>

        <label className="label" style={{ display: "block", marginTop: 14 }}>Reason (optional)</label>
        <input style={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this neutral form?" />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" disabled={!regional || !neutral} onClick={() => onSubmit(regional, neutral, reason, variant)}>
            <BookOpen size={14} /> Propose rule
          </button>
        </div>
      </div>
    </div>
  );
}
