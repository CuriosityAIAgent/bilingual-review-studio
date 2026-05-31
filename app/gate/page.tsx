"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";

export default function GatePage() {
  return (
    <Suspense fallback={null}>
      <GateInner />
    </Suspense>
  );
}

function GateInner() {
  const router = useRouter();
  const params = useSearchParams();
  // Only allow same-origin absolute paths — never javascript:, protocol-relative
  // (//evil), or cross-origin URLs handed to router.replace.
  const raw = params.get("next") || "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error || "Incorrect access code.");
        setBusy(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="fade-up" style={{ maxWidth: 420, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 18 }}>
          <span className="seal" aria-hidden style={{ width: 34, height: 34, fontSize: 18 }}>T</span>
          <span className="font-display" style={{ fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em" }}>Translation Studio</span>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Lock size={16} style={{ color: "var(--accent)" }} />
            <span className="label">Private preview</span>
          </div>
          <h1 className="font-display" style={{ fontSize: 22, letterSpacing: "-0.015em", marginBottom: 6 }}>Enter access code</h1>
          <p className="doc-body" style={{ color: "var(--ink-soft)", fontSize: 15, marginBottom: 18 }}>
            This is a private preview. Enter the access code you were given to continue.
          </p>
          <form onSubmit={submit}>
            <input
              autoFocus
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Access code"
              aria-label="Access code"
              style={{
                width: "100%", padding: "11px 13px", borderRadius: "var(--r-sm)",
                border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink)",
                fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 15,
              }}
            />
            {error && <p className="ui-base" style={{ color: "var(--flag)", marginTop: 10 }}>{error}</p>}
            <button type="submit" className="btn btn-accent" disabled={busy || !code} style={{ marginTop: 16, width: "100%", justifyContent: "center", padding: "10px 14px" }}>
              {busy ? "Checking…" : <>Continue <ArrowRight size={15} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
