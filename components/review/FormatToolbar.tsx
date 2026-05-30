"use client";
import { Bold, Italic, RemoveFormatting, Underline } from "lucide-react";

/**
 * Format toolbar — gives the workspace a proper text-editor feel. Acts on the
 * focused editable segment cell via the selection (mousedown-preventDefault keeps
 * focus). Emphasis is a reviewer affordance during editing; segment text persists
 * as plain text (structure comes from block types, not inline rich text).
 */
function exec(cmd: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault(); // keep focus + selection on the editable cell
    try {
      document.execCommand(cmd);
    } catch {
      /* no-op if unsupported */
    }
  };
}

const Btn = ({ onMouseDown, title, children }: { onMouseDown: (e: React.MouseEvent) => void; title: string; children: React.ReactNode }) => (
  <button className="btn btn-ghost" title={title} aria-label={title} onMouseDown={onMouseDown} style={{ padding: "6px 9px" }}>
    {children}
  </button>
);

export function FormatToolbar() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <Btn title="Bold (⌘B)" onMouseDown={exec("bold")}><Bold size={14} strokeWidth={2} /></Btn>
      <Btn title="Italic (⌘I)" onMouseDown={exec("italic")}><Italic size={14} strokeWidth={2} /></Btn>
      <Btn title="Underline (⌘U)" onMouseDown={exec("underline")}><Underline size={14} strokeWidth={2} /></Btn>
      <Btn title="Clear formatting" onMouseDown={exec("removeFormat")}><RemoveFormatting size={14} strokeWidth={1.9} /></Btn>
    </div>
  );
}
