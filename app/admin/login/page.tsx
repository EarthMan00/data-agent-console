import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isAdminAuthenticated } from "@/lib/admin-auth";

type AdminLoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  if (await isAdminAuthenticated()) {
    redirect("/admin/feedback");
  }

  const params = await searchParams;
  const nextPath = typeof params.next === "string" ? params.next : "/admin/feedback";
  const invalid = typeof params.error === "string";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(24,24,27,0.045),_transparent_38%),#fafaf9] px-6 py-10 text-[#18181b]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-[1120px] items-center justify-center">
        <div className="grid w-full max-w-[980px] gap-10 lg:grid-cols-[minmax(0,1.1fr)_420px]">
          <div className="hidden rounded-[32px] border border-[#ececec] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,248,247,0.98))] p-10 shadow-[0_28px_80px_rgba(15,23,42,0.08)] lg:block">
            <div className="inline-flex items-center rounded-full border border-[#ececec] bg-white px-3 py-1 text-xs font-medium tracking-[0.14em] text-[#52525b]">
              More Data Agent
            </div>
            <h1 className="mt-6 font-[family:var(--font-jakarta)] text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#18181b]">
              反馈后台
            </h1>
            <p className="mt-5 max-w-[38ch] text-[15px] leading-7 text-[#71717a]">
              用统一的浅色工作台集中查看用户反馈，按页面和关键词快速定位问题。
            </p>

            <div className="mt-10 grid gap-4">
              {[
                "主站对外公开，不要求用户登录。",
                "问题反馈通过服务端接口写入 Supabase。",
                "后台只做单管理员登录与只读查看。",
              ].map((item) => (
                <div key={item} className="rounded-[18px] border border-[#ececec] bg-white/85 px-5 py-4 text-sm text-[#3f3f46]">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#ececec] bg-white p-8 shadow-[0_28px_80px_rgba(15,23,42,0.08)] sm:p-10">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#18181b] text-sm font-semibold text-white shadow-[0_16px_32px_rgba(24,24,27,0.12)]">
              MD
            </div>
            <div className="mt-6">
              <h2 className="font-[family:var(--font-jakarta)] text-[28px] font-semibold tracking-[-0.03em] text-[#18181b]">
                登录后台
              </h2>
              <p className="mt-3 text-sm leading-7 text-[#71717a]">
                使用管理员账号进入问题反馈后台。
              </p>
            </div>

            <form action="/admin/session" method="post" className="mt-8 space-y-5">
              <input type="hidden" name="next" value={nextPath} />

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#3f3f46]">账号</span>
                <Input
                  name="username"
                  autoComplete="username"
                  placeholder="Admin"
                  className="h-12 rounded-[14px] border-[#e5e7eb] bg-[#fcfcfb] px-4 text-[#18181b] focus-visible:ring-[rgba(24,24,27,0.15)]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[#3f3f46]">密码</span>
                <Input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  className="h-12 rounded-[14px] border-[#e5e7eb] bg-[#fcfcfb] px-4 text-[#18181b] focus-visible:ring-[rgba(24,24,27,0.15)]"
                />
              </label>

              {invalid ? (
                <div className="rounded-[14px] border border-[#f2d6d8] bg-[#fff8f8] px-4 py-3 text-sm text-[#9f1239]">
                  账号或密码错误，请重新输入。
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button asChild variant="ghost" className="rounded-[12px] px-0 text-[#71717a] hover:bg-transparent hover:text-[#18181b]">
                  <Link href="/">返回应用</Link>
                </Button>
                <Button type="submit" className="h-11 rounded-[14px] px-6">
                  登录后台
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
