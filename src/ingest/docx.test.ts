import { describe, expect, it } from "vitest";
import { tablePairsFromHtml } from "./docx";

// mammoth converts a Word table to <table><tr><td><p>…</p></td>…</tr></table>.
// These tests drive that HTML shape directly so they're deterministic (no .docx
// fixture / binary parsing needed) — the parsing under test is HTML → pairs.
function table(rows: [string, string][]): string {
  const trs = rows
    .map(([a, b]) => `<tr><td><p>${a}</p></td><td><p>${b}</p></td></tr>`)
    .join("");
  return `<table>${trs}</table>`;
}

describe("tablePairsFromHtml — bilingual SME table import", () => {
  it("reads each row as an English→translation pair", () => {
    const r = tablePairsFromHtml(table([
      ["Net asset value", "资产净值"],
      ["Past performance is no guarantee of future results", "过往业绩并不保证未来表现"],
    ]));
    expect(r.pairs).toEqual([
      { source: "Net asset value", target: "资产净值" },
      { source: "Past performance is no guarantee of future results", target: "过往业绩并不保证未来表现" },
    ]);
    expect(r.tables).toBe(1);
    expect(r.cjkDetected).toBe(true);
    expect(r.columnSwapped).toBe(false);
  });

  it("detects and skips a header row, but never a data row", () => {
    const r = tablePairsFromHtml(table([
      ["English", "Chinese"],
      ["Bond", "债券"],
    ]));
    expect(r.headerSkipped).toBe(true);
    expect(r.pairs).toEqual([{ source: "Bond", target: "债券" }]);
  });

  it("skips a header even when its label cell carries CJK (English | 中文)", () => {
    const r = tablePairsFromHtml(table([
      ["English", "中文"],
      ["Bond", "债券"],
    ]));
    expect(r.headerSkipped).toBe(true);
    expect(r.pairs).toEqual([{ source: "Bond", target: "债券" }]);
  });

  it("keeps a real first row when only ONE cell is a header word (Term → 术语)", () => {
    // Regression: 'Term'/'Source'/'Target' are header words, but a row is a
    // header only when BOTH cells are labels. A real glossary row must survive.
    const r = tablePairsFromHtml(table([
      ["Term", "术语"],
      ["Yield", "收益率"],
    ]));
    expect(r.headerSkipped).toBe(false);
    expect(r.pairs).toEqual([
      { source: "Term", target: "术语" },
      { source: "Yield", target: "收益率" },
    ]);
  });

  it("keeps a real first row that has no CJK target (acronym/ticker)", () => {
    const r = tablePairsFromHtml(table([
      ["ETF", "ETF"],
      ["Yield", "收益率"],
    ]));
    expect(r.headerSkipped).toBe(false);
    expect(r.pairs).toEqual([
      { source: "ETF", target: "ETF" },
      { source: "Yield", target: "收益率" },
    ]);
  });

  it("auto-detects column order when Chinese is on the left", () => {
    const r = tablePairsFromHtml(table([
      ["股票", "Equity"],
      ["基金", "Fund"],
    ]));
    expect(r.columnSwapped).toBe(true);
    expect(r.pairs).toEqual([
      { source: "Equity", target: "股票" },
      { source: "Fund", target: "基金" },
    ]);
  });

  it("is NOT flipped by Word smart punctuation on the English side", () => {
    // Regression: en-dash / smart quote / ellipsis are punctuation, not letters,
    // so they must not count as "foreign" and flip the columns.
    const r = tablePairsFromHtml(table([
      ["Fund — A “growth”…", "基金A"],
      ["Manager’s note", "经理备注"],
    ]));
    expect(r.columnSwapped).toBe(false);
    expect(r.pairs).toEqual([
      { source: "Fund — A “growth”…", target: "基金A" },
      { source: "Manager’s note", target: "经理备注" },
    ]);
  });

  it("excludes the header row from column-order detection", () => {
    // A header whose translation-label cell is verbose must not tip orientation.
    const r = tablePairsFromHtml(table([
      ["English", "简体中文"],
      ["Bond", "债券"],
    ]));
    expect(r.headerSkipped).toBe(true);
    expect(r.columnSwapped).toBe(false);
    expect(r.pairs).toEqual([{ source: "Bond", target: "债券" }]);
  });

  it("drops rows missing a column and counts them", () => {
    const html = "<table>" +
      "<tr><td><p>Yield</p></td><td><p>收益率</p></td></tr>" +
      "<tr><td><p>Orphan English only</p></td></tr>" +
      "</table>";
    const r = tablePairsFromHtml(html);
    expect(r.pairs).toEqual([{ source: "Yield", target: "收益率" }]);
    expect(r.droppedRows).toBe(1);
  });

  it("preserves multi-paragraph cells as one multi-line segment", () => {
    const html = "<table><tr>" +
      "<td><p>Line one.</p><p>Line two.</p></td>" +
      "<td><p>第一行。</p><p>第二行。</p></td>" +
      "</tr></table>";
    const r = tablePairsFromHtml(html);
    expect(r.pairs).toEqual([{ source: "Line one.\nLine two.", target: "第一行。\n第二行。" }]);
  });

  it("merges rows across multiple tables and skips each table's own header", () => {
    const r = tablePairsFromHtml(
      table([["English", "中文"], ["A", "甲"]]) +
      table([["English", "中文"], ["B", "乙"]]),
    );
    expect(r.tables).toBe(2);
    expect(r.headerSkipped).toBe(true);
    // The second table's header must NOT become a pair.
    expect(r.pairs).toEqual([
      { source: "A", target: "甲" },
      { source: "B", target: "乙" },
    ]);
  });

  it("ignores non-Chinese tables (returns/fees) when importing for a Chinese target", () => {
    const html =
      table([["Bond", "债券"], ["Yield", "收益率"]]) +    // bilingual glossary
      table([["2024", "5.2%"], ["2025", "6.1%"]]);        // returns table, no CJK
    const r = tablePairsFromHtml(html, { expectCjk: true });
    expect(r.tables).toBe(2);
    expect(r.skippedTables).toBe(1);
    expect(r.pairs).toEqual([
      { source: "Bond", target: "债券" },
      { source: "Yield", target: "收益率" },
    ]);
  });

  it("excludes a Chinese-in-both-columns table (holdings) for a Chinese target", () => {
    // A holdings table "股票名称 | 代码" with rows like "腾讯控股 | 00700" is not a
    // glossary — neither column is English. It must not pollute Chinese TM.
    const html =
      table([["Bond", "债券"]]) +                          // real glossary
      table([["腾讯控股", "00700"], ["阿里巴巴", "09988"]]); // holdings, no English col
    const r = tablePairsFromHtml(html, { expectCjk: true });
    expect(r.skippedTables).toBe(1);
    expect(r.pairs).toEqual([{ source: "Bond", target: "债券" }]);
  });

  it("does not treat Korean (Hangul) as Chinese (Han-script only)", () => {
    // Regression: the script test must be Han-only. A Korean table under a Chinese
    // target is NOT bilingual Chinese, so it is excluded and no CJK is detected.
    const r = tablePairsFromHtml(table([["Bond", "채권"], ["Stock", "주식"]]), { expectCjk: true });
    expect(r.cjkDetected).toBe(false);
    expect(r.skippedTables).toBe(1);
    expect(r.pairs).toEqual([]);
  });

  it("orients a Chinese-left glossary under the Chinese target path", () => {
    const r = tablePairsFromHtml(table([["股票", "Equity"], ["基金", "Fund"]]), { expectCjk: true });
    expect(r.columnSwapped).toBe(true);
    expect(r.pairs).toEqual([
      { source: "Equity", target: "股票" },
      { source: "Fund", target: "基金" },
    ]);
  });

  it("orients an English↔Spanish table by accents (English stays the source)", () => {
    const en2es = tablePairsFromHtml(table([
      ["Asset management", "Gestión de activos"],
      ["Bond", "Bono"],
    ]));
    expect(en2es.columnSwapped).toBe(false);
    expect(en2es.pairs[0]).toEqual({ source: "Asset management", target: "Gestión de activos" });

    const es2en = tablePairsFromHtml(table([
      ["Gestión de activos", "Asset management"],
      ["Bono", "Bond"],
    ]));
    expect(es2en.columnSwapped).toBe(true);
    expect(es2en.pairs[0]).toEqual({ source: "Asset management", target: "Gestión de activos" });
  });

  it("is confident about column order when the scripts differ", () => {
    const zh = tablePairsFromHtml(table([["Bond", "债券"]]));
    expect(zh.columnConfident).toBe(true);
    const es = tablePairsFromHtml(table([["Bond", "Bono español"], ["Yield", "Rendimiento"]]));
    expect(es.columnConfident).toBe(true);
  });

  it("flags low confidence for an accent-free Latin↔Latin table", () => {
    const r = tablePairsFromHtml(table([["Bond", "Bono"], ["Yield", "Renta"]]));
    expect(r.columnConfident).toBe(false);
    expect(r.columnSwapped).toBe(false); // falls back to English-left
    expect(r.pairs).toEqual([
      { source: "Bond", target: "Bono" },
      { source: "Yield", target: "Renta" },
    ]);
  });

  it("caps very large documents and flags truncation", () => {
    const rows = Array.from({ length: 5001 }, (_, i) => [`Term ${i}`, "词" + i] as [string, string]);
    const r = tablePairsFromHtml(table(rows));
    expect(r.truncated).toBe(true);
    expect(r.pairs.length).toBe(5000);
  });

  it("returns no pairs and flags missing CJK when there is no table", () => {
    const r = tablePairsFromHtml("<p>Just a paragraph, no table.</p>");
    expect(r.pairs).toEqual([]);
    expect(r.tables).toBe(0);
    expect(r.cjkDetected).toBe(false);
  });

  it("flags a document with no Chinese (wrong file / language)", () => {
    const r = tablePairsFromHtml(table([["Alpha", "Beta"], ["Gamma", "Delta"]]));
    expect(r.cjkDetected).toBe(false);
    expect(r.pairs.length).toBeGreaterThan(0); // still parsed; the route warns before commit
  });
});
