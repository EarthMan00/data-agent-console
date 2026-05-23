import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[rgba(24,24,27,0.12)]",
  {
    variants: {
      variant: {
        default: "bg-[#111111] text-white shadow-none hover:bg-[#2a2a2a]",
        secondary: "border border-[#e2e2df] bg-white text-[#34322d] shadow-none hover:border-[#d4d4d0] hover:bg-[#f7f7f7]",
        outline: "border border-[#e2e2df] bg-white text-[#52524f] shadow-none hover:border-[#d4d4d0] hover:bg-[#f7f7f7]",
        ghost: "text-[#747571] hover:bg-[rgba(55,53,47,0.06)] hover:text-[#111111]",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
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
