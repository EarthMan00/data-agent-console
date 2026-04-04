import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackDialog } from "@/components/feedback-dialog";

describe("admin and feedback flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("validates empty feedback submissions", async () => {
    render(
      <FeedbackDialog
        open
        onOpenChange={vi.fn()}
        pagePath="/agent"
        context={{ type: "run", id: "run-default" }}
      />,
    );

    expect(screen.getByRole("button", { name: "提交反馈" })).toBeDisabled();
  });

  it("submits feedback successfully", async () => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true }),
      })),
    );

    render(
      <FeedbackDialog
        open
        onOpenChange={onOpenChange}
        pagePath="/agent"
        context={{ type: "run", id: "run-default" }}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("请描述你遇到的问题、期望行为或需要优化的地方。"), {
      target: { value: "这里有一个视觉问题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSuccess).toHaveBeenCalledWith("问题反馈已提交。");
    });
  });
});
