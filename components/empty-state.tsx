import Image from "next/image";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  message: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <div className={cn("mt-8 flex min-h-[calc(100vh-300px)] flex-col items-center justify-center px-4 text-center", className)}>
      <Image
        src="/alice-logo.png"
        alt=""
        width={48}
        height={48}
        aria-hidden="true"
        className="h-12 w-12 object-contain opacity-[0.12] grayscale"
        draggable={false}
      />
      <div className="mt-5 text-[18px] font-normal leading-7 text-[#9b9b98]">{message}</div>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
