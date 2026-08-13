"use client";

import Link from "next/link";

import { AliceShell } from "@/components/alice-shell";
import { ArrowRight, BookOpen, HelpCircle, Key, Sparkles } from "@/components/ui/tabler-icons";

const HELP_TOPICS = [
  {
    title: "创建数据任务",
    description: "从对话输入、数据源选择到结果导出，快速完成一次数据查询。",
    icon: Sparkles,
    href: "/",
    action: "开始新对话",
  },
  {
    title: "任务额度与套餐",
    description: "了解任务额度的消耗方式、套餐权益与升级规则。",
    icon: HelpCircle,
    href: "/plans",
    action: "查看套餐",
  },
  {
    title: "API&Skills",
    description: "管理 API 密钥，并将 Alice 接入你的工作流。",
    icon: Key,
    href: "/settings/api-keys",
    action: "管理 API&Skills",
  },
] as const;

export function HelpWorkspace() {
  return (
    <AliceShell currentPath="/help" showTopHeader={false}>
      <div className="px-4 pb-14 pt-5 sm:px-6 lg:px-8">
        <main className="mx-auto w-full max-w-page-content">
          <header className="border-b border-border pb-7">
            <p className="text-caption font-medium tracking-wide text-text-tertiary">支持中心</p>
            <h1 className="mt-2 text-title-1 font-semibold tracking-tight text-foreground">帮助文档</h1>
            <p className="mt-2 text-body leading-6 text-text-secondary">找到使用 Alice 所需的基础说明与常用入口。</p>
          </header>

          <section className="mt-7" aria-label="帮助主题">
            <div className="grid gap-4 lg:grid-cols-3">
              {HELP_TOPICS.map((topic) => {
                const Icon = topic.icon;
                return (
                  <Link
                    key={topic.title}
                    href={topic.href}
                    className="group rounded-card border border-border bg-bg-surface p-5 shadow-card transition-colors hover:bg-fill-hover"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fill-hover text-text-secondary group-hover:bg-bg-surface">
                      <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                    </span>
                    <h2 className="mt-5 text-title-3 font-semibold text-foreground">{topic.title}</h2>
                    <p className="mt-2 min-h-12 text-sm leading-5 text-text-secondary">{topic.description}</p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {topic.action}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="mt-7 rounded-card border border-border bg-bg-surface p-5 shadow-card sm:p-6">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" strokeWidth={1.8} aria-hidden />
              <div>
                <h2 className="text-body font-medium text-foreground">没有找到答案？</h2>
                <p className="mt-1 text-sm leading-5 text-text-secondary">请通过账户菜单中的「问题反馈」告诉我们具体情况，我们会尽快跟进。</p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </AliceShell>
  );
}
