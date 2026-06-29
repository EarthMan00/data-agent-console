"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { clearAgentSession } from "@/lib/agent-api/session";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Cpu,
  LogOut,
  MessageCircleMore,
  Package,
  Users,
} from "@/components/ui/tabler-icons";

const navItems = [
  { href: "/admin/users", label: "用户管理", icon: Users },
  { href: "/admin/plans", label: "套餐管理", icon: Package },
  { href: "/admin/prompts", label: "Prompt 管理", icon: BookOpen },
  { href: "/admin/feedback", label: "反馈管理", icon: MessageCircleMore },
  { href: "/admin/models", label: "模型管理", icon: Cpu },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = useCallback(() => {
    clearAgentSession();
    router.replace("/admin/login");
  }, [router]);

  return (
    <div className="flex h-screen bg-bg-page">
      <aside className="flex w-sidebar-admin shrink-0 flex-col border-r border-border bg-bg-surface">
        <div className="flex h-14 items-center gap-2 border-b border-border-subtle px-4">
          <span className="text-sm font-semibold text-foreground">管理后台</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-fill-hover font-medium text-foreground"
                    : "text-text-tertiary hover:bg-fill-hover hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border-subtle p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-sm text-text-tertiary transition-colors hover:bg-fill-hover hover:text-danger"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-admin-content px-8 pb-12 pt-8">{children}</div>
      </main>
    </div>
  );
}
