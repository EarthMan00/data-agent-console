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

const downloadAuthorizedFile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agent-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-api/client")>();
  return {
    ...actual,
    downloadAuthorizedFile,
  };
});

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
    created_at: "2026-08-17T00:00:00Z",
    last_used_at: null,
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
  return screen.findByRole("heading", { name: "API 密钥已创建" });
}

describe("API&Skills 设置页", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    downloadAuthorizedFile.mockReset();
    downloadAuthorizedFile.mockResolvedValue(undefined);
    platformAgent.withFreshToken.mockReset();
    platformAgent.withFreshToken.mockImplementation(
      async (run: (token: string) => Promise<unknown>) => run("token"),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("创建成功后弹窗展示密钥且不再提供连通测试入口", async () => {
    fetchMock
      .mockResolvedValueOnce(okJsonResponse(200, { items: [] }))
      .mockResolvedValueOnce(okJsonResponse(201, createdKeyBody()))
      .mockResolvedValueOnce(okJsonResponse(200, { items: [createdKeyBody()] }));

    render(<ApiKeySettingsWorkspace />);
    await openCreatedKeyDialog();

    expect(await screen.findByText("alice_live_plaintext_key_abcd")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /测试连通/ })).not.toBeInTheDocument();
  });

  it("操作列仅提供删除，确认后调用后端物理删除", async () => {
    const key = createdKeyBody();
    fetchMock
      .mockResolvedValueOnce(okJsonResponse(200, { items: [key] }))
      .mockResolvedValueOnce(okJsonResponse(204, null))
      .mockResolvedValueOnce(okJsonResponse(200, { items: [] }));

    render(<ApiKeySettingsWorkspace />);

    expect(screen.queryByText("状态")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /删除 Key/ }));

    expect(await screen.findByRole("heading", { name: "删除 API Key" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /确认删除/ }));

    expect(await screen.findByText("API Key 已删除")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/user/api-keys/key-1"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(screen.queryByText("测试 Key")).not.toBeInTheDocument();
    expect(screen.getByText("暂无 API Key")).toBeInTheDocument();
  });

  it("Skill 卡片提供下载入口并调用授权下载接口", async () => {
    fetchMock.mockResolvedValueOnce(okJsonResponse(200, { items: [] }));

    render(<ApiKeySettingsWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: /下载 Skill 包/ }));

    expect(await screen.findByText("Skill 包已开始下载")).toBeInTheDocument();
    expect(downloadAuthorizedFile).toHaveBeenCalledWith(
      "token",
      "/api/user/skills/dataagent-platform/download",
      "dataagent-platform-latest.zip",
    );
  });

  it("点击使用帮助弹出帮助手册", async () => {
    fetchMock.mockResolvedValueOnce(okJsonResponse(200, { items: [] }));

    render(<ApiKeySettingsWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: /使用帮助/ }));

    expect(await screen.findByRole("heading", { name: "Skill 使用帮助" })).toBeInTheDocument();
    expect(screen.getByText(/DATA_AGENT_API_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /测试连通/ })).not.toBeInTheDocument();
  });
});
