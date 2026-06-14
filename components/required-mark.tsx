import { cn } from "@/lib/utils";

/** 必填星号，使用全局 danger token */
export function RequiredAsterisk({ className }: { className?: string }) {
  return (
    <span className={cn("text-danger", className)} aria-hidden>
      *
    </span>
  );
}
