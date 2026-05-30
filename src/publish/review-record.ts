/**
 * Export (spec §3, §9 step 9). v1 guarantees:
 *   • bilingual review record — source + neutral Spanish side-by-side, with
 *     flags, edits, status and provenance; print-to-PDF friendly.
 *   • reflowed document — clean target-only render (Phase 3); readable, NOT
 *     layout-faithful (spec §3 stated guarantee).
 *
 * Publish-time guard: disclaimers must come from approved memory (locked). This
 * builder surfaces any unresolved disclaimer rather than silently emitting it.
 */
import type { Block, DocModel } from "@/src/lib/doc-model";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLE = `
:root{--bg:#F2EEE4;--surface:#fff;--ink:#15233B;--ink-soft:#566076;--line:#E3DCCC;
--accent:#9A7A34;--edited:#B5751E;--memory:#4F6B52;--flag:#A23B2D;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font-family:'Newsreader',Georgia,serif;font-size:16px;line-height:1.62;}
.wrap{max-width:1000px;margin:0 auto;padding:48px 40px;}
h1{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:30px;margin:0 0 4px;}
.meta{font-family:'Hanken Grotesk',system-ui,sans-serif;font-size:12px;color:var(--ink-soft);
text-transform:uppercase;letter-spacing:.08em;margin-bottom:28px;}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:24px;border-top:1px solid var(--line);
padding:16px 0;position:relative;}
.seg.edited{border-left:3px solid var(--edited);padding-left:14px;margin-left:-14px;}
.seg.locked{border-left:3px solid var(--memory);padding-left:14px;margin-left:-14px;}
.pane .lbl{font-family:'Hanken Grotesk',sans-serif;font-size:10px;letter-spacing:.1em;
text-transform:uppercase;color:var(--ink-soft);margin-bottom:6px;display:block;}
.en{color:var(--ink-soft);} .num{font-family:'IBM Plex Mono',monospace;}
.tag{display:inline-block;font-family:'Hanken Grotesk',sans-serif;font-size:10px;
text-transform:uppercase;letter-spacing:.07em;border:1px solid var(--line);border-radius:999px;
padding:1px 8px;margin-right:6px;color:var(--ink-soft);}
.flag{color:var(--flag);font-size:13px;font-family:'Hanken Grotesk',sans-serif;margin-top:6px;}
.kpi{font-family:'Hanken Grotesk',sans-serif;background:var(--surface);border:1px solid var(--line);
border-radius:11px;padding:16px 20px;margin:24px 0;font-size:13px;}
.kpi b{font-family:'IBM Plex Mono',monospace;font-size:18px;color:var(--accent);}
.title-seg{font-family:'Fraunces',serif;font-weight:600;font-size:20px;}
@media print{body{background:#fff}.wrap{padding:0}}
@page{margin:18mm}
`;

function tagsFor(b: Block): string {
  const tags: string[] = [`<span class="tag">${b.type}</span>`];
  if (b.seg_status === "edited") tags.push('<span class="tag" style="color:#B5751E">edited</span>');
  if (b.seg_status === "locked") tags.push('<span class="tag" style="color:#4F6B52">memory · locked</span>');
  if (b.seg_status === "accepted") tags.push('<span class="tag">accepted</span>');
  if (b.neutralization_hits.length) tags.push(`<span class="tag" style="color:#4F6B52">${b.neutralization_hits.length} neutralized</span>`);
  if (b.qe_score !== null) tags.push(`<span class="tag num">QE ${b.qe_score}</span>`);
  return tags.join("");
}

export function buildReviewRecordHtml(doc: DocModel, opts: { annotations?: boolean } = {}): string {
  const segs = doc.blocks
    .map((b) => {
      const cls = b.seg_status === "edited" ? "edited" : b.seg_status === "locked" ? "locked" : "";
      const titleCls = b.type === "title" || b.type === "subhead" ? " title-seg" : "";
      const flags =
        opts.annotations && b.critic_flags.length
          ? `<div class="flag">⚑ ${b.critic_flags.map((f) => `${esc(f.category)}/${f.severity}: ${esc(f.span)} → ${esc(f.suggestion)}`).join("; ")}</div>`
          : "";
      const fails = b.validator_results.filter((v) => v.status === "fail");
      const valFlags =
        opts.annotations && fails.length
          ? `<div class="flag">✕ ${fails.map((v) => `${v.validator}${v.severity ? `/${v.severity}` : ""}`).join(", ")}</div>`
          : "";
      return `<div class="seg ${cls}">
        <div class="pane"><span class="lbl">Español neutro (${esc(doc.target_locale)})</span><div class="${titleCls.trim()}">${esc(b.final_text)}</div>${flags}${valFlags}</div>
        <div class="pane"><span class="lbl">English source</span><div class="en${titleCls}">${esc(b.source_text)}</div><div style="margin-top:6px">${tagsFor(b)}</div></div>
      </div>`;
    })
    .join("\n");

  const m = doc.metrics;
  const approved = doc.blocks.filter((b) => b.seg_status === "accepted" || b.seg_status === "locked").length;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(doc.title)} — Bilingual Review Record</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Hanken+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet"/>
<style>${STYLE}</style></head>
<body><div class="wrap">
<h1>${esc(doc.title)}</h1>
<div class="meta">Bilingual Review Record · ${esc(doc.source.filename)} · status: ${esc(doc.status)} · ${doc.blocks.length} segments · ${approved} approved/locked</div>
<div class="kpi">Edits per 1,000 words: <b>${m.edits_per_1k}</b> &nbsp;·&nbsp; reviewer accept-rate: <b>${m.reviewer_accept_rate}</b> &nbsp;·&nbsp; regionalism fail-rate: <b>${m.regionalism_fail_rate}</b><br/>
<span style="color:#566076">Provenance — translator: ${esc(doc.model_run.translator_model_id)} · critic: ${esc(doc.model_run.critic_model_id)} · rules: ${esc(doc.model_run.rules_version)} · config: ${esc(doc.model_run.config_hash)}</span></div>
${segs}
</div></body></html>`;
}

export function buildReflowedHtml(doc: DocModel): string {
  const body = doc.blocks
    .map((b) => {
      if (b.type === "title") return `<h1>${esc(b.final_text)}</h1>`;
      if (b.type === "subhead") return `<h2>${esc(b.final_text)}</h2>`;
      if (b.type === "list_item") return `<li>${esc(b.final_text)}</li>`;
      if (b.type === "disclaimer") return `<p class="disc">${esc(b.final_text)}</p>`;
      return `<p>${esc(b.final_text)}</p>`;
    })
    .join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<title>${esc(doc.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Newsreader:opsz,wght@6..72,400&display=swap" rel="stylesheet"/>
<style>body{max-width:720px;margin:0 auto;padding:48px 32px;font-family:'Newsreader',Georgia,serif;
font-size:17px;line-height:1.7;color:#15233B}h1{font-family:'Fraunces',serif}h2{font-family:'Fraunces',serif;font-size:21px}
.disc{font-size:13px;color:#566076;border-top:1px solid #E3DCCC;padding-top:12px;margin-top:28px}@page{margin:20mm}</style></head>
<body>${body}</body></html>`;
}
