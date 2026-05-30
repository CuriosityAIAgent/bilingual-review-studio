/**
 * Append-only audit entry builders (spec §10, §13, §14). edit_log and
 * handoff_log are immutable: callers only ever PUSH these entries, never mutate
 * or delete them. Corrections are represented as new (compensating) events.
 */
import type {
  ActorRef,
  EditAction,
  EditLogEntry,
  FlagCategory,
  HandoffAction,
  HandoffLogEntry,
  DocStatus,
  UserRef,
} from "@/src/lib/doc-model";
import { id, nowIso } from "@/src/lib/ids";
import { levenshtein } from "@/src/lib/similarity";

export function makeEditEntry(p: {
  segment_id: string;
  actor: ActorRef;
  action: EditAction;
  before: string;
  after: string;
  error_categories_corrected?: FlagCategory[];
}): EditLogEntry {
  const distance = levenshtein(p.before, p.after);
  const hter = Number((distance / Math.max(1, p.after.length)).toFixed(3));
  return {
    id: id("edit"),
    segment_id: p.segment_id,
    actor: p.actor,
    action: p.action,
    before: p.before,
    after: p.after,
    char_edit_distance: distance,
    hter: Math.min(1, hter),
    error_categories_corrected: p.error_categories_corrected ?? [],
    ts: nowIso(),
  };
}

export function makeHandoffEntry(p: {
  action: HandoffAction;
  actor: ActorRef;
  from?: UserRef;
  to?: UserRef;
  note: string;
  status_from?: DocStatus;
  status_to?: DocStatus;
}): HandoffLogEntry {
  return {
    id: id("ho"),
    action: p.action,
    from: p.from,
    to: p.to,
    actor: p.actor,
    note: p.note,
    status_from: p.status_from,
    status_to: p.status_to,
    ts: nowIso(),
  };
}
