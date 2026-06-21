import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleResultPushSection } from "@/components/schedule-result-push";

describe("ScheduleResultPushSection", () => {
  it("uses shared checkbox controls for push channel selection", async () => {
    const onConfigSnapshot = vi.fn();

    const { container } = render(
      <ScheduleResultPushSection
        headerLabel="结果推送"
        inlineAddTrigger
        onConfigSnapshot={onConfigSnapshot}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /添加提醒/ }));

    const email = await screen.findByRole("checkbox", { name: "选择邮箱推送" });
    const dingtalk = screen.getByRole("checkbox", { name: "选择钉钉推送" });
    const feishu = screen.getByRole("checkbox", { name: "选择飞书推送" });

    expect(container.querySelector("ul")).toBeNull();
    expect(email).toHaveAttribute("aria-checked", "false");
    expect(dingtalk).toHaveAttribute("aria-checked", "false");
    expect(feishu).toHaveAttribute("aria-checked", "false");

    fireEvent.click(email);

    expect(email).toHaveAttribute("aria-checked", "true");
    await waitFor(() => {
      expect(onConfigSnapshot).toHaveBeenLastCalledWith({
        blocks: [expect.objectContaining({ type: "email" })],
      });
    });

    fireEvent.click(screen.getByText("钉钉"));

    expect(dingtalk).toHaveAttribute("aria-checked", "true");
    await waitFor(() => {
      expect(onConfigSnapshot).toHaveBeenLastCalledWith({
        blocks: [
          expect.objectContaining({ type: "email" }),
          expect.objectContaining({ type: "dingtalk" }),
        ],
      });
    });
  });

  it("locks vertical scroll while the inline push channel picker is open", async () => {
    render(
      <ScheduleResultPushSection
        headerLabel="结果推送"
        inlineAddTrigger
      />,
    );

    const trigger = screen.getByRole("button", { name: /添加提醒/ });
    fireEvent.click(trigger);

    await screen.findByRole("checkbox", { name: "选择邮箱推送" });

    const horizontalWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 120, deltaY: 0 });
    window.dispatchEvent(horizontalWheel);
    expect(horizontalWheel.defaultPrevented).toBe(false);

    const lockedWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 });
    window.dispatchEvent(lockedWheel);
    expect(lockedWheel.defaultPrevented).toBe(true);

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.queryByRole("checkbox", { name: "选择邮箱推送" })).not.toBeInTheDocument();
    });

    const unlockedWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 });
    window.dispatchEvent(unlockedWheel);
    expect(unlockedWheel.defaultPrevented).toBe(false);
  });
});
