import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FavoriteSheetsResultView } from "@/components/favorite-sheets-result-view";

const favoriteSheetSnapshot = {
  version: 2,
  sheets: [
    {
      id: "sheet-1",
      label: "数据报告",
      csv_text: "ASIN,销量\nB0DD4GFNNG,100",
      json_text: '{"ASIN":"B0DD4GFNNG","销量":100}',
    },
    {
      id: "sheet-2",
      label: "获取产品历史销量",
      csv_text: "ASIN,销量\nB0DD4GFNNG,200",
      json_text: '{"ASIN":"B0DD4GFNNG","销量":200}',
    },
  ],
};

describe("FavoriteSheetsResultView", () => {
  it("uses the theme primary color for active table/code and sheet tabs", () => {
    render(<FavoriteSheetsResultView snapshot={favoriteSheetSnapshot} title="收藏 · 数据报告" />);

    const tableMode = screen.getByRole("button", { name: "表格" });
    expect(tableMode).toHaveClass("text-primary");
    expect(tableMode).not.toHaveClass("text-success");

    fireEvent.click(screen.getByRole("button", { name: "代码" }));
    const codeMode = screen.getByRole("button", { name: "代码" });
    expect(codeMode).toHaveClass("text-primary");
    expect(codeMode).not.toHaveClass("text-success");

    fireEvent.click(screen.getByRole("button", { name: "获取产品历史销量" }));
    const activeSheetTab = screen.getByRole("button", { name: "获取产品历史销量" });
    expect(activeSheetTab).toHaveClass("border-primary", "text-primary");
    expect(activeSheetTab).not.toHaveClass("border-success-border", "text-success");
  });
});
