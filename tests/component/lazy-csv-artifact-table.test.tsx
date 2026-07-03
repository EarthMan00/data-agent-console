import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LazyCsvArtifactTable } from "@/components/lazy-csv-artifact-table";

describe("LazyCsvArtifactTable", () => {
  it("keeps right-panel header and body columns aligned", async () => {
    const onScrollStateChange = vi.fn();
    const { container } = render(
      <LazyCsvArtifactTable
        sidePanel
        inlineUtf8Text={"ASIN,Title,Price\nB0MOCK001,Stanley style insulated sports bottle 40oz,29.0"}
        onScrollStateChange={onScrollStateChange}
      />,
    );

    const asinHeader = await screen.findByRole("columnheader", { name: "ASIN" });
    await waitFor(() => expect(screen.getByText("B0MOCK001")).toBeInTheDocument());
    expect(container.querySelector("colgroup")).toBeInTheDocument();
    expect(asinHeader).toHaveClass("h-11", "align-middle", "p-0");
    expect(asinHeader.querySelector("span")).toHaveClass("px-3", "py-2");
    expect(asinHeader).not.toHaveClass("align-top");

    const scrollRoot = screen.getByTestId("lazy-csv-table").parentElement;
    expect(scrollRoot).toBeInstanceOf(HTMLElement);
    (scrollRoot as HTMLElement).scrollTop = 12;
    fireEvent.scroll(scrollRoot as HTMLElement);
    expect(onScrollStateChange).toHaveBeenLastCalledWith(true);
  });
});
