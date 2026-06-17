"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

type ChatMarkdownProps = {
  className?: string;
  children: string;
};

function normalizeChatMarkdown(text: string) {
  return text
    .trim()
    .replace(/([?？:：。；])\s+(\d+[.、)\]]\s+)/g, "$1\n\n$2")
    .replace(/([^\n])\n(?=\d+[.、)\]]\s+)/g, "$1\n\n");
}

/** 聊天气泡内 Markdown（GFM），与 app-demo 对齐。 */
export function ChatMarkdown({ className, children }: ChatMarkdownProps) {
  const text = children ?? "";
  if (!text.trim()) {
    return null;
  }
  const markdownText = normalizeChatMarkdown(text);

  return (
    <div className={cn("chat-md text-body leading-7 text-inherit [&_a]:break-all", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children: c }) => <p className="mb-2 last:mb-0">{c}</p>,
          h1: ({ children: c }) => <h3 className="mb-2 mt-3 text-title-1 font-semibold first:mt-0">{c}</h3>,
          h2: ({ children: c }) => <h3 className="mb-2 mt-3 text-title-1 font-semibold first:mt-0">{c}</h3>,
          h3: ({ children: c }) => <h4 className="mb-1.5 mt-2 text-body font-semibold first:mt-0">{c}</h4>,
          ul: ({ children: c }) => <ul className="my-2 list-disc space-y-1 pl-5">{c}</ul>,
          ol: ({ children: c }) => <ol className="my-2 list-decimal space-y-1 pl-5">{c}</ol>,
          li: ({ children: c }) => <li className="leading-7 [&>p]:mb-0">{c}</li>,
          strong: ({ children: c }) => <strong className="font-semibold">{c}</strong>,
          em: ({ children: c }) => <em className="italic">{c}</em>,
          a: ({ href, children: c }) => (
            <a
              href={href}
              className="font-medium text-link underline underline-offset-2 hover:text-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              {c}
            </a>
          ),
          pre: ({ children: c }) => (
            <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-bg-subtle px-3 py-2 text-body">
              {c}
            </pre>
          ),
          code: ({ className, children: c }) => {
            const isBlock = typeof className === "string" && className.includes("language-");
            if (isBlock) {
              return <code className="font-mono text-body text-text-secondary">{c}</code>;
            }
            return (
              <code className="rounded bg-bg-subtle px-1 py-0.5 font-mono text-caption text-text-secondary">{c}</code>
            );
          },
          blockquote: ({ children: c }) => (
            <blockquote className="my-2 border-l-4 border-border-strong pl-3 text-text-secondary">{c}</blockquote>
          ),
          hr: () => <hr className="my-3 border-border" />,
          table: ({ children: c }) => (
            <div className="my-2 overflow-x-auto">
              <table className="min-w-full border-collapse border border-border text-sm">{c}</table>
            </div>
          ),
          thead: ({ children: c }) => <thead className="bg-bg-subtle">{c}</thead>,
          th: ({ children: c }) => (
            <th className="border border-border px-2 py-1.5 text-left font-semibold">{c}</th>
          ),
          td: ({ children: c }) => <td className="border border-border px-2 py-1.5">{c}</td>,
        }}
      >
        {markdownText}
      </ReactMarkdown>
    </div>
  );
}
