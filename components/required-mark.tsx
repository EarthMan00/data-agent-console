import { cn } from "@/lib/utils";

/** 必填星号，与 Element Plus 等常见 UI 的 `#F56C6C` 一致 */
export function RequiredAsterisk({ className }: { className?: string }) {
  return (
    <span className={cn("text-[#F56C6C]", className)} aria-hidden>
      *
    </span>
  );
}
