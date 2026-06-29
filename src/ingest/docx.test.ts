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

  it("keeps a real first row that has no CJK target (acronym/ticker)", () => {
    // Regression: an ETF/USD/S&P first row must not be mistaken for a header
    // just because its translation cell has no Chinese characters.
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

  it("merges rows across multiple tables (e.g. one per section)", () => {
    const r = tablePairsFromHtml(table([["A", "甲"]]) + table([["B", "乙"]]));
    expect(r.tables).toBe(2);
    expect(r.pairs).toEqual([
      { source: "A", target: "甲" },
      { source: "B", target: "乙" },
    ]);
  });

  it("is confident about column order when the scripts differ", () => {
    const zh = tablePairsFromHtml(table([["Bond", "债券"]]));
    expect(zh.columnConfident).toBe(true);
    const es = tablePairsFromHtml(table([["Bond", "Bono español"], ["Yield", "Rendimiento"]]));
    expect(es.columnConfident).toBe(true);
  });

  it("flags low confidence for an accent-free Latin↔Latin table", () => {
    // Both columns pure ASCII — orientation can't be detected, only guessed.
    const r = tablePairsFromHtml(table([["Bond", "Bono"], ["Yield", "Renta"]]));
    expect(r.columnConfident).toBe(false);
    expect(r.columnSwapped).toBe(false); // falls back to English-left
    expect(r.pairs).toEqual([
      { source: "Bond", target: "Bono" },
      { source: "Yield", target: "Renta" },
    ]);
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
