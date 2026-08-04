import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminPromptsWorkspace } from "@/components/admin-prompts-workspace";

const api = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listTemplates: vi.fn(),
  patchTemplate: vi.fn(),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => ({
    auth: { accessToken: "opaque-token" },
    withFreshToken: async <T,>(run: (token: string) => Promise<T>) =>
      run("opaque-token"),
  }),
}));

vi.mock("@/lib/agent-api/client", () => ({
  AgentApiError: class AgentApiError extends Error {},
  parseFastApiDetail: () => null,
  adminListPromptCategories: api.listCategories,
  adminListPromptTemplates: api.listTemplates,
  adminPatchPromptTemplate: api.patchTemplate,
  adminCreatePromptCategory: vi.fn(),
  adminPatchPromptCategory: vi.fn(),
  adminDeletePromptCategory: vi.fn(),
  adminCreatePromptTemplate: vi.fn(),
  adminDeletePromptTemplate: vi.fn(),
  adminImportPromptsFromExcel: vi.fn(),
}));

describe("AdminPromptsWorkspace data-source editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listCategories.mockResolvedValue({
      categories: [{ id: "category-1", name: "选品", sort_order: 0 }],
    });
    api.listTemplates.mockResolvedValue({
      templates: [
        {
          id: "template-1",
          category_id: "category-1",
          category_name: "选品",
          title: "商品详情分析",
          description: null,
          prompt_text: "分析商品详情",
          variables: [],
          meta_line: null,
          capability_ids: ["keepa-product-detail"],
          replay_run_id: null,
          replay_share_id: null,
          status: "draft",
          sort_order: 0,
          is_active: true,
          created_at: null,
          updated_at: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    });
    api.patchTemplate.mockResolvedValue({});
  });

  it("shows display labels while keeping internal IDs out of rendered controls", async () => {
    render(<AdminPromptsWorkspace />);

    await screen.findByText("商品详情分析");
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    await screen.findByText("关联数据源");
    expect(screen.getByText("Keepa-亚马逊-商品详情")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Keepa-亚马逊-商品详情" }),
    ).toBeChecked();
    expect(document.body.textContent).not.toContain("capability_ids");
    expect(document.body.textContent).not.toContain("keepa-product-detail");
    expect(
      Array.from(document.querySelectorAll("input"), (input) => input.value).join(" "),
    ).not.toContain("keepa-product-detail");

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(api.patchTemplate).toHaveBeenCalledTimes(1));
    expect(api.patchTemplate.mock.calls[0]?.[2]).toMatchObject({
      capability_ids: ["keepa-product-detail"],
    });
  });
});
