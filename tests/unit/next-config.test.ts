import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Next.js project root", () => {
  it("pins Turbopack to this exact Console worktree", () => {
    const config = require("../../next.config.js") as {
      turbopack?: { root?: string };
    };

    expect(config.turbopack?.root).toBe(projectRoot);
    expect(path.isAbsolute(config.turbopack?.root ?? "")).toBe(true);
  });
});
