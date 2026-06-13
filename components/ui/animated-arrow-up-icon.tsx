import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface AnimatedArrowUpIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

export function AnimatedArrowUpIcon({ className, size = 16, ...props }: AnimatedArrowUpIconProps) {
  return (
    <div className={cn("alice-arrow-up-icon inline-flex items-center justify-center", className)} {...props}>
      <svg
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <path className="alice-arrow-up-icon__head" d="m5 12 7-7 7 7" />
        <path className="alice-arrow-up-icon__stem" d="M12 19V5" />
      </svg>
    </div>
  );
}
