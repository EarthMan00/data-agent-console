import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[rgba(24,24,27,0.18)]",
  {
    variants: {
      variant: {
        default: "bg-[#18181b] text-white shadow-[0_12px_26px_rgba(24,24,27,0.14)] hover:bg-[#27272a]",
        secondary: "border border-[#e4e4e7] bg-[linear-gradient(180deg,#ffffff,#fafafa)] text-[#18181b] hover:border-[#d4d4d8] hover:bg-[#f5f5f5]",
        outline: "border border-[#e4e4e7] bg-[rgba(255,255,255,0.92)] text-[#52525b] hover:border-[#d4d4d8] hover:bg-[#fafafa]",
        ghost: "text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#18181b]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
