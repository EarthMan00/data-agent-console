"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { clearAgentSession } from "@/lib/agent-api/session";
import {
  LogOut,
  Users,
  Shield,
  Package,
  BookOpen,
  MessageCircleMore,
} from "@/components/ui/tabler-icons";

const navItems = [
  { href: "/admin/users",    label: "用户管理", icon: Users },
  { href: "/admin/roles",    label: "角色权限", icon: Shield },
  { href: "/admin/plans",    label: "套餐管理", icon: Package },
  { href: "/admin/prompts",  label: "Prompt 管理", icon: BookOpen },
  { href: "/admin/feedback", label: "反馈管理", icon: MessageCircleMore },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = useCallback(() => {
    clearAgentSession();
    router.replace("/admin/login");
  }, [router]);

  return (
    <div className="flex h-screen bg-[#fafaf9]">
      {/* Sidebar */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#e5e7eb] bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-[#f0f0ef] px-4">
          <span className="text-sm font-semibold text-[#18181b]">管理后台</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-[#f0f0ef] font-medium text-[#18181b]"
                    : "text-[#71717a] hover:bg-[#f7f7f7] hover:text-[#18181b]",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[#f0f0ef] p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-[#71717a] transition-colors hover:bg-[#f7f7f7] hover:text-[#ef4444]"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1180px] px-8 pb-12 pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
