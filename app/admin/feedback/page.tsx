import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getSupabaseDashboardUrl, isFeedbackConfigured, listFeedbackEntries } from "@/lib/feedback";

type FeedbackAdminPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function FeedbackAdminPage({ searchParams }: FeedbackAdminPageProps) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/feedback");
  }

  const params = await searchParams;
  const pagePath = typeof params.page === "string" ? params.page : "";
  const query = typeof params.q === "string" ? params.q : "";

  const dashboardUrl = getSupabaseDashboardUrl();
  const configured = isFeedbackConfigured();
  const entries = configured
    ? await listFeedbackEntries({ pagePath: pagePath || undefined, query: query || undefined })
    : [];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(24,24,27,0.045),_transparent_36%),#fafaf9] px-6 py-8 text-[#18181b] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-[1220px]">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="inline-flex items-center rounded-full border border-[#ececec] bg-white px-3 py-1 text-xs font-medium tracking-[0.14em] text-[#52525b]">
              More Data Agent Admin
            </div>
            <div className="mt-4 font-[family:var(--font-jakarta)] text-[30px] font-semibold tracking-[-0.03em]">
              问题反馈
            </div>
            <p className="mt-3 text-sm leading-7 text-[#71717a]">
              查看来自线上 More Data Agent 的最新反馈，按页面和关键词快速筛选。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {dashboardUrl ? (
              <Button asChild variant="secondary" className="rounded-[10px]">
                <Link href={dashboardUrl} target="_blank">
                  打开 Supabase 后台
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary" className="rounded-[10px]">
              <Link href="/">返回应用</Link>
            </Button>
            <form action="/admin/logout" method="post">
              <Button type="submit" className="rounded-[10px]">
                退出登录
              </Button>
            </form>
          </div>
        </div>

        {!configured ? (
          <div className="mt-8 rounded-[20px] border border-[#e5e7eb] bg-white px-6 py-5 text-sm leading-7 text-[#71717a] shadow-sm">
            当前未检测到 Supabase 环境变量，反馈读取尚未启用。请配置
            <code className="mx-1">NEXT_PUBLIC_SUPABASE_URL</code>
            和
            <code className="mx-1">SUPABASE_SERVICE_ROLE_KEY</code>。
          </div>
        ) : null}

        <form className="mt-8 flex flex-wrap items-center gap-3 rounded-[20px] border border-[#e5e7eb] bg-white p-4 shadow-sm">
          <Input
            name="q"
            defaultValue={query}
            placeholder="搜索反馈内容"
            className="h-11 w-[280px] rounded-[12px] border-[#e5e7eb] bg-[#fcfcfb] px-4 text-[#18181b] focus-visible:ring-[rgba(24,24,27,0.15)]"
          />
          <Input
            name="page"
            defaultValue={pagePath}
            placeholder="按页面过滤，例如 /agent"
            className="h-11 w-[220px] rounded-[12px] border-[#e5e7eb] bg-[#fcfcfb] px-4 text-[#18181b] focus-visible:ring-[rgba(24,24,27,0.15)]"
          />
          <Button type="submit" variant="secondary" className="h-11 rounded-[12px] px-5">
            筛选
          </Button>
        </form>

        <div className="mt-8 overflow-hidden rounded-[20px] border border-[#e5e7eb] bg-white shadow-sm">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[#fafafa] text-[#52525b]">
              <tr>
                <th className="px-4 py-3 font-medium">时间</th>
                <th className="px-4 py-3 font-medium">页面</th>
                <th className="px-4 py-3 font-medium">上下文</th>
                <th className="px-4 py-3 font-medium">反馈内容</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-[#f1f5f9] align-top">
                  <td className="px-4 py-4 text-[#71717a]">{entry.created_at.replace("T", " ").slice(0, 19)}</td>
                  <td className="px-4 py-4 text-[#18181b]">{entry.page_path}</td>
                  <td className="px-4 py-4 text-[#71717a]">
                    {entry.context_type && entry.context_id ? `${entry.context_type}:${entry.context_id}` : "-"}
                  </td>
                  <td className="px-4 py-4 leading-7 text-[#18181b]">{entry.message}</td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-[#a1a1aa]">
                    当前还没有反馈记录。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
