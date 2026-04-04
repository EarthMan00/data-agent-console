import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-[#d8dee8] bg-[rgba(255,255,255,0.9)] px-3 py-2 text-sm text-[#26354d] shadow-sm transition-colors placeholder:text-[#8b99ad] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(102,126,255,0.22)] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
