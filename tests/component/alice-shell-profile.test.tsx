import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  installDefaultApiMocks,
  loggedInPlatformAgent,
  getPlatformAgentMock,
  getProfileMocks,
  renderAliceShell,
} from "./helpers/alice-shell-test-utils";

async function openProfileDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "用户中心" }));
  fireEvent.click(await screen.findByRole("button", { name: "个人中心" }));
  return screen.findByRole("dialog", { name: "个人资料" });
}

describe("个人资料持久化", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDefaultApiMocks();
    getPlatformAgentMock().current = loggedInPlatformAgent();
  });

  afterEach(() => {
    getPlatformAgentMock().current = null;
  });

  it("展示服务端邮箱、手机号与 UUID", async () => {
    renderAliceShell();
    const dialog = await openProfileDialog();

    expect(await within(dialog).findByText("sensen@example.com")).toBeInTheDocument();
    expect(within(dialog).getByText("手机号 13800138000")).toBeInTheDocument();
    expect(within(dialog).getByText("账号 UUID")).toBeInTheDocument();
  });

  it("编辑名称后调用 patchProfile 并更新展示", async () => {
    getProfileMocks().patchProfile.mockResolvedValue({ display_name: "新名字", avatar_color: null });
    renderAliceShell();
    const dialog = await openProfileDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "编辑名称" }));
    const input = within(dialog).getByRole("textbox", { name: "名称" });
    fireEvent.change(input, { target: { value: "新名字" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(getProfileMocks().patchProfile).toHaveBeenCalledWith(expect.any(String), { display_name: "新名字" }),
    );
    expect(await within(dialog).findByText("新名字")).toBeInTheDocument();
  });

  it("点击头像背景色调用 patchProfile", async () => {
    renderAliceShell();
    const dialog = await openProfileDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "选择头像背景色 #a855f7" }));

    await waitFor(() =>
      expect(getProfileMocks().patchProfile).toHaveBeenCalledWith(expect.any(String), { avatar_color: "#a855f7" }),
    );
  });
});
