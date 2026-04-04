import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-[#e4e4e7] bg-[#f4f4f5] text-[#18181b]",
        secondary: "border-[#e4e4e7] bg-[#fafafa] text-[#71717a]",
        warm: "border-[#f1dfc1] bg-[#fff5e7] text-[#b07a2f]",
        danger: "border-[#f1d6de] bg-[#fff1f4] text-[#c06b7f]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
