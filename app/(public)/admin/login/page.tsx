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
      <div className="flex h-screen items-center justify-center bg-bg-page">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-bg-page">
      <div className="w-full max-w-sm rounded-panel border border-border bg-bg-surface p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">管理平台</h1>
          <p className="mt-1.5 text-sm text-text-tertiary">管理员登录</p>
        </div>

        {error ? (
          <div className="mb-5 rounded-control border border-danger-border bg-danger-bg px-3.5 py-2.5 text-body leading-5 text-danger">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="admin-login-account"
              className="block text-body font-medium text-foreground"
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
              className="mt-1.5 block w-full rounded-control border border-border bg-bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-text-disabled focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="用户名或邮箱"
            />
          </div>

          <div>
            <label
              htmlFor="admin-login-password"
              className="block text-body font-medium text-foreground"
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
              className="mt-1.5 block w-full rounded-control border border-border bg-bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-text-disabled focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="输入密码"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !account.trim() || !password.trim()}
            className="mt-2 w-full rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
