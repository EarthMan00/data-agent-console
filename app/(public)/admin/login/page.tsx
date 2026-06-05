"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { login, AgentApiError, formatAgentApiErrorForUser } from "@/lib/agent-api/client";
import {
  loadAgentSession,
  saveAgentSession,
  notifyAgentSessionChanged,
  type AgentSessionSnapshot,
} from "@/lib/agent-api/session";

export default function AdminLoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const session = loadAgentSession();
    if (session?.userRole === "admin") {
      router.replace("/admin/users");
    } else {
      setCheckingAuth(false);
    }
  }, [router]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (!account.trim() || !password.trim()) {
        setError("请输入账号和密码");
        return;
      }

      setLoading(true);

      try {
        const response = await login(account.trim(), password);

        if (response.user_role !== "admin") {
          setError("此账号无管理员权限");
          setLoading(false);
          return;
        }

        const snapshot: AgentSessionSnapshot = {
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
          userId: response.user_id,
          displayName: response.username ?? account.trim(),
          userRole: response.user_role,
        };

        saveAgentSession(snapshot);
        notifyAgentSessionChanged();
        router.replace("/admin/users");
      } catch (err: unknown) {
        const msg = formatAgentApiErrorForUser(err);
        if (
          err instanceof AgentApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          setError("账号或密码错误");
        } else if (/networkerror|failed to fetch|load failed/i.test(msg)) {
          setError("当前无法连接登录服务，请检查网络后重试");
        } else if (/[一-龥]/.test(msg)) {
          setError(msg);
        } else {
          setError("登录失败，请稍后重试");
        }
        setLoading(false);
      }
    },
    [account, password, router],
  );

  if (checkingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#fafaf9]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#d4d4d4] border-t-[#18181b]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[#fafaf9]">
      <div className="w-full max-w-[360px] rounded-[16px] border border-[#e5e7eb] bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-[#18181b]">管理平台</h1>
          <p className="mt-1.5 text-sm text-[#71717a]">管理员登录</p>
        </div>

        {error ? (
          <div className="mb-5 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[13px] leading-5 text-[#b91c1c]">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="admin-login-account"
              className="block text-[13px] font-medium text-[#18181b]"
            >
              账号
            </label>
            <input
              id="admin-login-account"
              type="text"
              value={account}
              onChange={(e) => {
                setAccount(e.target.value);
                if (error) setError("");
              }}
              disabled={loading}
              autoComplete="username"
              className="mt-1.5 block w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#18181b] outline-none transition-colors placeholder:text-[#a1a1aa] focus:border-[#18181b] focus:ring-1 focus:ring-[#18181b] disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="用户名或邮箱"
            />
          </div>

          <div>
            <label
              htmlFor="admin-login-password"
              className="block text-[13px] font-medium text-[#18181b]"
            >
              密码
            </label>
            <input
              id="admin-login-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              disabled={loading}
              autoComplete="current-password"
              className="mt-1.5 block w-full rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#18181b] outline-none transition-colors placeholder:text-[#a1a1aa] focus:border-[#18181b] focus:ring-1 focus:ring-[#18181b] disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="输入密码"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !account.trim() || !password.trim()}
            className="mt-2 w-full rounded-[10px] bg-[#18181b] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#27272a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
