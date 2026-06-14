import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LazyCsvArtifactTable } from "@/components/lazy-csv-artifact-table";

describe("LazyCsvArtifactTable", () => {
  it("keeps the right-panel header vertically balanced", async () => {
    render(
      <LazyCsvArtifactTable
        sidePanel
        inlineUtf8Text={"ASIN,Title,Price\nB0MOCK001,Stanley style insulated sports bottle 40oz,29.0"}
      />,
    );

    const asinHeader = await screen.findByRole("columnheader", { name: "ASIN" });
    await waitFor(() => expect(screen.getByText("B0MOCK001")).toBeInTheDocument());
    expect(asinHeader).toHaveClass("h-12", "align-middle", "pt-3", "pb-3");
    expect(asinHeader).not.toHaveClass("align-top");
  });
});
