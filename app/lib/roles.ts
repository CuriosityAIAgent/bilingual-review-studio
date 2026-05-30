/**
 * Client-safe role labels + the JPM "short process" stages (spec: the process
 * image). Kept separate from src/auth (which imports server-only config) so
 * client components can use it without pulling node modules into the bundle.
 *
 * Internal RBAC role keys stay author/reviewer/approver/admin/viewer; these are
 * the human-facing labels for the JPM operating model:
 *   Investment Strategist (author) → Marketing (reviewer) + Supervisory
 *   Management (approver) → deploy to clients.
 */
export const ROLE_LABELS: Record<string, string> = {
  author: "Investment Strategist",
  reviewer: "Marketing",
  approver: "Supervisory Management",
  admin: "Admin",
  viewer: "Viewer",
};

export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

export type StepGroup = "pipeline" | "review";
export interface ProcessStep {
  key: string;
  label: string;
  group: StepGroup;
}

/**
 * The visible process pipeline (shown on top of the review workspace).
 * The first four run automatically at ingest; the last three are the human
 * short-process: Marketing review → SM approval → deploy to clients.
 */
export const PROCESS_STEPS: ProcessStep[] = [
  { key: "translate", label: "Translate", group: "pipeline" },
  { key: "checks", label: "Checks", group: "pipeline" },
  { key: "governance", label: "Governance", group: "pipeline" },
  { key: "rewrite", label: "Rewrite", group: "pipeline" },
  { key: "review", label: "Marketing review", group: "review" },
  { key: "approval", label: "SM approval", group: "review" },
  { key: "deploy", label: "Deploy to clients", group: "review" },
];

// ── Turn-based editing (who holds the document right now) ─────────────────────
import type { DocModel } from "@/src/lib/doc-model";

export interface SeatLike { user_id: string; team_id: string; role: string; display_name?: string }

/**
 * A document has ONE holder at a time — whoever it is currently assigned to. Only
 * the holder (or an Admin) may edit; everyone else has read-only access. A
 * published (deployed) document is locked for everyone. This is the turn-based
 * lock the desk wants: Strategist → Marketing → SM → deploy, repeat on major edits.
 */
export function isYourTurn(seat: SeatLike | null, doc: Pick<DocModel, "status" | "assigned_to">): boolean {
  if (!seat) return false;
  if (doc.status === "published") return false; // deployed → locked
  if (seat.role === "admin") return true; // admin override
  return doc.assigned_to.user_id === seat.user_id || doc.assigned_to.team_id === seat.team_id;
}

/** The canonical next role/team to hand off to, given the current document state. */
export function nextHandoff(doc: Pick<DocModel, "status">): { role: string; teamId: string } | null {
  switch (doc.status) {
    case "draft": return { role: "reviewer", teamId: "iberia-marketing" }; // Strategist → Marketing
    case "in_review":
    case "changes_requested": return { role: "approver", teamId: "compliance" }; // Marketing → SM
    default: return null;
  }
}

export type StepState = "done" | "active" | "pending";

/** Map document status → state of each process step. */
export function stepState(stepKey: string, status: string): StepState {
  const PIPELINE = ["translate", "checks", "governance", "rewrite"];
  if (PIPELINE.includes(stepKey)) return "done"; // always run at ingest

  const order: Record<string, number> = {
    draft: 0, in_review: 1, changes_requested: 1, approved: 2, published: 3,
  };
  const s = order[status] ?? 0;
  if (stepKey === "review") return s >= 2 ? "done" : s === 1 ? "active" : "pending";
  if (stepKey === "approval") return s >= 2 ? "done" : "pending";
  if (stepKey === "deploy") return s >= 3 ? "done" : s === 2 ? "active" : "pending";
  return "pending";
}
