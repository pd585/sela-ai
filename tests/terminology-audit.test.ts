import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("SELA product terminology audit", () => {
  it("does not use plain-language terminology in user-facing app strings", () => {
    const srcRoot = join(process.cwd(), "src");
    const files = [
      "routes/index.tsx",
      "routes/__root.tsx",
      "components/sela/home-page.tsx",
      "components/sela/shell.tsx",
    ];

    const combined = files
      .map((file) => readFileSync(join(srcRoot, file), "utf-8"))
      .join("\n");

    expect(combined).not.toMatch(/plain[- ]language|Plain[- ]Language|Plain[- ]language/i);
    expect(combined).not.toMatch(/Plain-Language Version|Plain-Language Review|Simplified Version|Simplified Document|Review Version|Rewritten Document/i);
  });
});
