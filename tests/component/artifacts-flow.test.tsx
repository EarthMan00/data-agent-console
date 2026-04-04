import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FavoritesWorkspace } from "@/components/favorites-workspace";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("artifactId=favorite-default"),
}));

describe("artifacts flow", () => {
  it("renders an explicit empty state when search has no matches", () => {
    render(<FavoritesWorkspace />);
    fireEvent.change(screen.getByPlaceholderText("搜索收藏"), { target: { value: "不存在" } });

    expect(screen.getByText("当前筛选下没有匹配的收藏结果")).toBeInTheDocument();
  });

  it("shows actions for the currently selected artifact", () => {
    render(<FavoritesWorkspace />);

    expect(screen.getByRole("button", { name: "打开结果页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回任务上下文" })).toBeInTheDocument();
  });
});
