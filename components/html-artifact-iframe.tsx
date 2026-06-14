"use client";

import { useCallback, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * 任务报告 HTML 需在 iframe 内执行 Chart.js 等脚本。
 * 空 sandbox 会禁止一切脚本，图表容器会保持灰色空白（与直接打开 HTML 不一致）。
 */
export const HTML_ARTIFACT_IFRAME_SANDBOX = "allow-scripts allow-same-origin";

const MAX_IFRAME_HEIGHT_PX = 16_000;

type HtmlArtifactIframeProps = {
  html: string;
  title?: string;
  className?: string;
};

export function HtmlArtifactIframe({ html, title = "HTML 预览", className }: HtmlArtifactIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fitHeightToContent = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      const body = doc?.body;
      const root = doc?.documentElement;
      if (!body) return;
      const contentHeight = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        root?.scrollHeight ?? 0,
        root?.offsetHeight ?? 0,
      );
      iframe.style.height = `${Math.min(contentHeight + 16, MAX_IFRAME_HEIGHT_PX)}px`;
    } catch {
      /* 跨域或沙箱未放开时忽略 */
    }
  }, []);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      sandbox={HTML_ARTIFACT_IFRAME_SANDBOX}
      className={cn(
        "min-h-html-artifact w-full flex-1 rounded-control border border-border bg-bg-surface",
        className,
      )}
      srcDoc={html}
      onLoad={() => {
        fitHeightToContent();
        window.setTimeout(fitHeightToContent, 120);
        window.setTimeout(fitHeightToContent, 600);
      }}
    />
  );
}
