import { randomUUID } from "node:crypto";

export function id(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 12)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
