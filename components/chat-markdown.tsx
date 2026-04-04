"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

type ChatMarkdownProps = {
  className?: string;
  children: string;
};

/** 聊天气泡内 Markdown（GFM），与 app-demo 对齐。 */
export function ChatMarkdown({ className, children }: ChatMarkdownProps) {
  const text = children ?? "";
  if (!text.trim()) {
    return null;
  }

  return (
    <div className={cn("chat-md text-[15px] leading-7 text-inherit [&_a]:break-all", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children: c }) => <p className="mb-2 last:mb-0">{c}</p>,
          h1: ({ children: c }) => <h3 className="mb-2 mt-3 text-[1.05em] font-semibold first:mt-0">{c}</h3>,
          h2: ({ children: c }) => <h3 className="mb-2 mt-3 text-[1.05em] font-semibold first:mt-0">{c}</h3>,
          h3: ({ children: c }) => <h4 className="mb-1.5 mt-2 text-[1em] font-semibold first:mt-0">{c}</h4>,
          ul: ({ children: c }) => <ul className="my-2 list-disc space-y-1 pl-5">{c}</ul>,
          ol: ({ children: c }) => <ol className="my-2 list-decimal space-y-1 pl-5">{c}</ol>,
          li: ({ children: c }) => <li className="leading-7 [&>p]:mb-0">{c}</li>,
          strong: ({ children: c }) => <strong className="font-semibold">{c}</strong>,
          em: ({ children: c }) => <em className="italic">{c}</em>,
          a: ({ href, children: c }) => (
            <a
              href={href}
              className="font-medium text-[#1d4ed8] underline underline-offset-2 hover:text-[#1e40af]"
              target="_blank"
              rel="noopener noreferrer"
            >
              {c}
            </a>
          ),
          pre: ({ children: c }) => (
            <pre className="my-2 overflow-x-auto rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-[13px]">
              {c}
            </pre>
          ),
          code: ({ className, children: c }) => {
            const isBlock = typeof className === "string" && className.includes("language-");
            if (isBlock) {
              return <code className="font-mono text-[13px] text-[#334155]">{c}</code>;
            }
            return (
              <code className="rounded bg-[#f1f5f9] px-1 py-0.5 font-mono text-[0.9em] text-[#334155]">{c}</code>
            );
          },
          blockquote: ({ children: c }) => (
            <blockquote className="my-2 border-l-[3px] border-[#cbd5e1] pl-3 text-[#64748b]">{c}</blockquote>
          ),
          hr: () => <hr className="my-3 border-[#e2e8f0]" />,
          table: ({ children: c }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse border border-[#e2e8f0] text-sm">{c}</table>
            </div>
          ),
          thead: ({ children: c }) => <thead className="bg-[#f8fafc]">{c}</thead>,
          th: ({ children: c }) => (
            <th className="border border-[#e2e8f0] px-2 py-1.5 text-left font-semibold">{c}</th>
          ),
          td: ({ children: c }) => <td className="border border-[#e2e8f0] px-2 py-1.5">{c}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
