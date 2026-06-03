/** The changed span between two strings — trims the common leading/trailing
 *  words so callers can show WHAT changed (old → new), not the whole text.
 *  Empty `from`/`to` means no word-level difference (e.g. a non-text action). */
export function changedPhrase(before: string, after: string): { from: string; to: string } {
  const a = before.split(/\s+/);
  const b = after.split(/\s+/);
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  return { from: a.slice(s, ea).join(" "), to: b.slice(s, eb).join(" ") };
}
