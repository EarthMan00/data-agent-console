import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiKeySettingsWorkspace } from "@/components/api-key-settings-workspace";

const platformAgent = vi.hoisted(() => ({
  auth: { accessToken: "token", displayName: "Alice", userId: "user" },
  withFreshToken: vi.fn(async (run: (token: string) => Promise<unknown>) => run("token")),
  setActivePlatformSession: vi.fn(),
  clearActivePlatformSession: vi.fn(),
  openLogin: vi.fn(),
}));

vi.mock("@/components/platform-agent-provider", () => ({
  useOptionalPlatformAgent: () => platformAgent,
}));

vi.mock("@/components/alice-shell", () => ({
  AliceShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAliceShellState: () => ({ refreshHistoryNow: vi.fn(), setActiveSessionTitle: vi.fn() }),
}));

const fetchMock = vi.fn();

function okJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function createdKeyBody() {
  return {
    key_id: "key-1",
    name: "测试 Key",
    key_prefix: "alice",
    key_last4: "abcd",
    scopes: ["bulk.run", "run.read", "bundle.download"],
    status: "active",
    created_at: "2026-08-17T00:00:00Z",
    last_used_at: null,
    revoked_at: null,
    api_key: "alice_live_plaintext_key_abcd",
    warning: "",
  };
}

async function openCreatedKeyDialog() {
  fireEvent.click(await screen.findByRole("button", { name: /生成 Key/ }));
  fireEvent.change(await screen.findByPlaceholderText("例如：数据分析工作流"), {
    target: { value: "测试 Key" },
  });
  fireEvent.click(screen.getByRole("button", { name: /创建/ }));
  return screen.findByRole("button", { name: "测试连通" });
}

describe("API Key 连通测试", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    platformAgent.withFreshToken.mockReset();
    platformAgent.withFreshToken.mockImplementation(async (run: (token: string) => Promise<unknown>) => run("token"));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("创建成功后弹窗内可测试连通并展示成功", async () => {
    fetchMock
      .mockResolvedValueOnce(okJsonResponse(200, { items: [] }))
      .mockResolvedValueOnce(okJsonResponse(201, createdKeyBody()))
      .mockResolvedValueOnce(okJsonResponse(200, { items: [createdKeyBody()] }));

    render(<ApiKeySettingsWorkspace />);
    await openCreatedKeyDialog();

    fetchMock.mockResolvedValueOnce(
      okJsonResponse(200, {
        key: { key_id: "key-1", name: "测试 Key" },
        entitlements: { has_active_cycle: true },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "测试连通" }));

    expect(await screen.findByText("连通正常，可安全关闭弹窗并保存密钥。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/whoami"),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-API-Key": "alice_live_plaintext_key_abcd" }),
      }),
    );
  });

  it("连通失败展示失败提示", async () => {
    fetchMock
      .mockResolvedValueOnce(okJsonResponse(200, { items: [] }))
      .mockResolvedValueOnce(okJsonResponse(201, createdKeyBody()))
      .mockResolvedValueOnce(okJsonResponse(200, { items: [createdKeyBody()] }));

    render(<ApiKeySettingsWorkspace />);
    await openCreatedKeyDialog();

    fetchMock.mockResolvedValueOnce(okJsonResponse(401, { detail: "invalid key" }));
    fireEvent.click(screen.getByRole("button", { name: "测试连通" }));

    expect(await screen.findByText(/连通失败/)).toBeInTheDocument();
  });
});
