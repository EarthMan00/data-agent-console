import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-[10px] border border-[#e2e2df] bg-white px-3 py-2 text-sm text-[#34322d] shadow-none transition-colors placeholder:text-[#8b8c87] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(24,24,27,0.1)] disabled:cursor-not-allowed disabled:opacity-50",
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
