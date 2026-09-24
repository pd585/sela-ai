import { describe, expect, it } from "vitest";
import { normalizeDocumentOverview } from "../src/lib/sela.functions";

describe("normalizeDocumentOverview", () => {
  it("returns null for nullish / non-objects", () => {
    expect(normalizeDocumentOverview(null)).toBeNull();
    expect(normalizeDocumentOverview(undefined)).toBeNull();
    expect(normalizeDocumentOverview("x")).toBeNull();
  });

  it("defaults missing arrays so .length / .map are safe (review crash repro)", () => {
    const overview = normalizeDocumentOverview({
      document_type: "Agreement",
      purpose: "Test",
      summary: "Soft-schema incomplete overview",
      // parties / dates / what_matters_first omitted
    });
    expect(overview).not.toBeNull();
    expect(overview!.parties.length).toBe(0);
    expect(overview!.dates.length).toBe(0);
    expect(overview!.what_matters_first.map((x) => x)).toEqual([]);
    expect(overview!.document_type).toBe("Agreement");
  });

  it("preserves complete overview arrays", () => {
    const overview = normalizeDocumentOverview({
      document_type: "NDA",
      purpose: "Confidentiality",
      summary: "Full",
      parties: ["A", "B"],
      dates: [{ label: "Effective", detail: "1 Jan", chunk_index: 0 }],
      what_matters_first: ["Term"],
    });
    expect(overview!.parties).toEqual(["A", "B"]);
    expect(overview!.dates).toHaveLength(1);
    expect(overview!.what_matters_first).toEqual(["Term"]);
  });
});

it("preserves extra persisted fields like sela_version", () => {
  const overview = normalizeDocumentOverview({
    document_type: "NDA",
    purpose: "p",
    summary: "s",
    sela_version: { summary: "sv", sections: [] },
  }) as { sela_version?: { summary: string }; parties: string[] };
  expect(overview.sela_version?.summary).toBe("sv");
  expect(overview.parties).toEqual([]);
});
