import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getFeedbackMocks,
  installDefaultApiMocks,
  loggedInPlatformAgent,
  getPlatformAgentMock,
  renderAliceShell,
} from "./helpers/alice-shell-test-utils";

async function openFeedbackDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "用户中心" }));
  fireEvent.click(await screen.findByRole("button", { name: "问题反馈" }));
  return screen.findByRole("dialog", { name: "问题反馈" });
}

describe("问题反馈弹窗", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDefaultApiMocks();
    getPlatformAgentMock().current = loggedInPlatformAgent();
  });

  afterEach(() => {
    getPlatformAgentMock().current = null;
  });

  it("提交成功后展示感谢并携带账号与页面信息", async () => {
    renderAliceShell();
    const dialog = await openFeedbackDialog();

    fireEvent.change(within(dialog).getByLabelText("问题反馈内容"), {
      target: { value: "测试反馈内容" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "提交反馈" }));

    expect(await within(dialog).findByText("感谢你的反馈")).toBeInTheDocument();
    expect(getFeedbackMocks().submitFeedback).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: "测试反馈内容", page_path: "/agent" }),
    );
  });

  it("提交失败保留输入内容并展示重试提示", async () => {
    getFeedbackMocks().submitFeedback.mockRejectedValueOnce(new Error("network"));
    renderAliceShell();
    const dialog = await openFeedbackDialog();

    const textarea = within(dialog).getByLabelText("问题反馈内容");
    fireEvent.change(textarea, { target: { value: "保留这段内容" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "提交反馈" }));

    expect(await within(dialog).findByText(/提交失败/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("问题反馈内容")).toHaveValue("保留这段内容");
    expect(within(dialog).getByRole("button", { name: "提交反馈" })).toBeInTheDocument();
  });
});
