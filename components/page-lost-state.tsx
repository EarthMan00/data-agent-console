"use client";

import { Button } from "@/components/ui/button";
import { ListRestart } from "@/components/ui/tabler-icons";

export function PageLostState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-8 flex min-h-[calc(100vh-300px)] flex-col items-center justify-center px-4 text-center">
      <ListRestart className="mb-5 h-10 w-10 text-[#d4d4d4]" strokeWidth={1.5} aria-hidden />
      <p className="text-[14px] leading-6 text-[#8b8c87]">页面走丢了，请刷新试试</p>
      <Button
        type="button"
        className="mt-7 h-12 rounded-full bg-[#111111] px-10 text-[16px] font-semibold text-white hover:bg-[#2a2a2a]"
        onClick={onRetry}
      >
        刷新试试
      </Button>
    </div>
  );
}
