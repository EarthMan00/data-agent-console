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
    <div className={cn("mt-8 flex min-h-empty-page flex-col items-center justify-center px-4 text-center", className)}>
      <Image
        src="/mdata-logo.png"
        alt=""
        width={48}
        height={48}
        aria-hidden="true"
        className="h-12 w-12 object-contain opacity-empty-artifact grayscale"
        draggable={false}
      />
      <div className="mt-5 text-lg font-normal leading-7 text-text-disabled">{message}</div>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
