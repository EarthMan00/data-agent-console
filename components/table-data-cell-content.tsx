"use client";

import { useState } from "react";

import { shouldRenderTableCellAsImage } from "@/lib/table-image-url-cell";
import { cn } from "@/lib/utils";

type TableDataCellContentProps = {
  value: string;
  columnHeader?: string;
  /** 侧栏表格：内层 line-clamp 包裹纯文本 */
  sidePanel?: boolean;
  textClassName?: string;
};

export function TableDataCellContent({
  value,
  columnHeader,
  sidePanel = false,
  textClassName,
}: TableDataCellContentProps) {
  const [imgError, setImgError] = useState(false);
  const trimmed = (value ?? "").trim();

  if (trimmed && shouldRenderTableCellAsImage(columnHeader, trimmed) && !imgError) {
    return (
      <a
        href={trimmed}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-center justify-start px-3 py-2"
        title={trimmed}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={trimmed}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="max-h-20 max-w-36 rounded border border-border bg-bg-surface object-contain"
          onError={() => setImgError(true)}
        />
      </a>
    );
  }

  if (sidePanel) {
    return (
      <span
        className={cn(
          "block min-w-0 max-w-full whitespace-normal break-words px-3 py-2 text-xs leading-snug line-clamp-3",
          textClassName,
        )}
        title={trimmed}
      >
        {value}
      </span>
    );
  }

  return (
    <span className={textClassName} title={trimmed}>
      {value}
    </span>
  );
}
