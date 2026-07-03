import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AliceMessageBubble, SimpleUserBubble } from "@/components/agent-workspace/chat-bubbles";
import { UserMessageAttachmentCards } from "@/components/user-message-attachment-cards";

describe("chat bubbles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders inline numbered clarification options as keyboard-focusable buttons", () => {
    const onSuggestionToggle = vi.fn();
    render(
      <AliceMessageBubble
        body="执行前需要确认一个筛选条件：是否只保留 FBA 且评分高于 4.3 的商品？ 1. 只保留 FBA 且评分高于 4.3 2. 保留全部配送方式，先按销量排序"
        datetime="2026-06-14T10:11:15.000+08:00"
        onSuggestionToggle={onSuggestionToggle}
      />,
    );

    const option = screen.getByRole("button", { name: "只保留 FBA 且评分高于 4.3" });
    expect(option).toHaveAttribute("aria-pressed", "false");
    option.focus();
    expect(option).toHaveFocus();
    fireEvent.click(option);
    expect(onSuggestionToggle).toHaveBeenCalledWith("只保留 FBA 且评分高于 4.3");
  });

  it("uses image thumbnails for image message attachments", () => {
    render(
      <UserMessageAttachmentCards
        attachments={[
          {
            name: "reference-image.png",
            size: 284912,
            extension: "png",
            previewUrl: "blob:test-preview",
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("图片预览 reference-image.png")).toHaveStyle({
      backgroundImage: "url(blob:test-preview)",
    });
    expect(screen.getByText(/PNG/)).toBeInTheDocument();
  });

  it("shows question times right below on hover and assistant times left below", () => {
    const datetime = "2026-06-14T10:11:15.000+08:00";
    const { rerender } = render(<SimpleUserBubble text="请分析附件" datetime={datetime} />);

    const userText = screen.getByText("请分析附件");
    const userTime = screen.getByText(/2026/);
    expect(userTime).toHaveClass("text-right", "opacity-0", "group-hover:opacity-100");
    expect(userText.compareDocumentPosition(userTime) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(<AliceMessageBubble body="好的，马上分析。" datetime={datetime} />);

    const assistantTime = screen.getByText(/2026/);
    expect(assistantTime).toHaveClass("text-left");
    expect(assistantTime).not.toHaveClass("text-right");
  });

  it("falls back to a colored image icon when an image preview fails", async () => {
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      set src(_value: string) {
        setTimeout(() => this.onerror?.(new Event("error")), 0);
      }
    }

    vi.stubGlobal("Image", FailingImage);

    render(
      <UserMessageAttachmentCards
        attachments={[
          {
            name: "broken-reference.png",
            size: 284912,
            extension: "png",
            previewUrl: "http://127.0.0.1/missing-image.png",
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("图片预览 broken-reference.png")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("图片文件 PNG")).toHaveClass("bg-info-bg", "text-link");
  });

  it("uses colored image icons for image attachments without previews", () => {
    render(
      <UserMessageAttachmentCards
        attachments={[
          {
            name: "snail.svg",
            size: 127386,
            extension: "svg",
          },
        ]}
      />,
    );

    expect(screen.queryByLabelText("图片预览 snail.svg")).not.toBeInTheDocument();
    expect(screen.getByLabelText("图片文件 SVG")).toHaveClass("bg-info-bg", "text-link");
  });
});
