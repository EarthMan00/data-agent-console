import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("global CSS cascade guards", () => {
  it("keeps Tailwind display utilities effective on semantic main elements", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toMatch(/main\.flex\s*{\s*display:\s*flex;/);
    expect(css).toMatch(/main\.grid\s*{\s*display:\s*grid;/);
  });
});
