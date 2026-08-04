import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ALICE_LOGO_SRC } from "@/lib/brand-assets";

describe("static assets", () => {
  it("ships the Alice logo referenced by chat UI", () => {
    const logoPath = join(process.cwd(), "public", ALICE_LOGO_SRC.replace(/^\//, ""));

    expect(ALICE_LOGO_SRC).toBe("/alice-avatar-transparent.png");
    expect(existsSync(logoPath)).toBe(true);
    expect(statSync(logoPath).size).toBeGreaterThan(0);
    expect(readFileSync(logoPath).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});
