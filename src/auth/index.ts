/**
 * Auth & RBAC (spec §4, §11, Appendix C).
 *
 * Production: enterprise SSO (OIDC/SAML) → RBAC mapped to these roles. Early
 * phases (this build): a mock seat switcher demonstrates the multi-team handoff
 * flow without real SSO. The `authorize()` decision logic is the same in both —
 * only the identity source differs.
 */
import { getPermissions } from "@/src/lib/config";
import type { Block, DocModel, Role, UserRef } from "@/src/lib/doc-model";

export interface Seat extends UserRef {
  role: Role;
  display_name: string;
  team_name: string;
}

/**
 * The canonical demo seats mirror the field operating model (spec §2):
 * Author (LatAm, Mexican base) → Reviewer (Iberia, neutralize) → Approver (sign-off).
 */
export const DEMO_SEATS: Seat[] = [
  { user_id: "ana", display_name: "Ana Reyes", role: "author", team_id: "latam-strategy", team_name: "LatAm Strategy" },
  { user_id: "diego", display_name: "Diego Serrano", role: "reviewer", team_id: "iberia-marketing", team_name: "Iberia Marketing" },
  { user_id: "carmen", display_name: "Carmen Ortiz", role: "approver", team_id: "compliance", team_name: "Compliance" },
  { user_id: "ops", display_name: "Platform Admin", role: "admin", team_id: "platform", team_name: "Platform" },
  { user_id: "sam", display_name: "Sam Okafor", role: "viewer", team_id: "stakeholders", team_name: "Stakeholders" },
];

export function getSeat(userId: string): Seat {
  return DEMO_SEATS.find((s) => s.user_id === userId) ?? DEMO_SEATS[0];
}

export interface AuthzContext {
  doc?: DocModel;
  block?: Block;
}

export interface AuthzResult {
  allowed: boolean;
  reason: string;
}

function sameUserOrTeam(seat: Seat, ref?: UserRef): boolean {
  if (!ref) return false;
  return ref.user_id === seat.user_id || ref.team_id === seat.team_id;
}

/** Resolve a permissions.yml verdict (boolean or scoped string) for a seat. */
export function authorize(seat: Seat, action: string, ctx: AuthzContext = {}): AuthzResult {
  const perms = getPermissions();
  const rule = perms.actions[action];
  if (!rule) return { allowed: false, reason: `unknown action "${action}"` };
  const verdict = rule[seat.role];

  if (verdict === true) return { allowed: true, reason: "role permitted" };
  if (verdict === undefined || verdict === false) {
    return { allowed: false, reason: `role "${seat.role}" not permitted for ${action}` };
  }

  // Scoped string verdicts.
  const inScope = sameUserOrTeam(seat, ctx.block?.assigned_to ?? ctx.doc?.assigned_to);
  switch (verdict) {
    case "in_scope":
    case "in_scope_neutralize":
      // Disclaimers ALWAYS escalate to Approver/Compliance — never editable under
      // a scoped (author/reviewer) verdict (spec §10, §11).
      if (ctx.block?.type === "disclaimer") {
        return { allowed: false, reason: "disclaimers escalate to Approver/Compliance" };
      }
      return inScope
        ? { allowed: true, reason: "in assigned scope" }
        : { allowed: false, reason: "outside assigned scope" };
    case "in_scope_non_disclaimer":
      if (ctx.block?.type === "disclaimer")
        return { allowed: false, reason: "disclaimers escalate to Approver/Compliance" };
      return inScope
        ? { allowed: true, reason: "in scope, non-disclaimer" }
        : { allowed: false, reason: "outside assigned scope" };
    case "per_policy":
      return perms.reviewer_can_approve_rules
        ? { allowed: true, reason: "policy allows reviewer" }
        : { allowed: false, reason: "policy: approver/admin only" };
    default:
      return { allowed: false, reason: `unrecognised verdict "${verdict}"` };
  }
}

export function can(seat: Seat, action: string, ctx: AuthzContext = {}): boolean {
  return authorize(seat, action, ctx).allowed;
}
