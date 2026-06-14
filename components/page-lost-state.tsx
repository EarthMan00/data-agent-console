"use client";

import { Button } from "@/components/ui/button";
import { ListRestart } from "@/components/ui/tabler-icons";

export function PageLostState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-8 flex min-h-empty-page flex-col items-center justify-center px-4 text-center">
      <ListRestart className="mb-5 h-10 w-10 text-text-disabled" strokeWidth={1.5} aria-hidden />
      <p className="text-body leading-6 text-text-tertiary">页面走丢了，请刷新试试</p>
      <Button
        type="button"
        className="mt-7 h-12 rounded-full bg-primary px-10 text-title-1 font-semibold text-primary-foreground hover:bg-link-hover"
        onClick={onRetry}
      >
        刷新试试
      </Button>
    </div>
  );
}
