import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-[#e4e4e7] bg-[rgba(255,255,255,0.94)] px-3 py-2 text-sm text-[#18181b] shadow-sm transition-colors placeholder:text-[#a1a1aa] focus-visible:outline-none focus-visible:ring-0 focus-visible:[box-shadow:none!important] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
