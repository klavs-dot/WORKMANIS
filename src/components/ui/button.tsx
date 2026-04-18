import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "bg-graphite-900 text-white hover:bg-graphite-800 shadow-soft-xs active:scale-[0.98]",
        secondary:
          "bg-white text-graphite-900 border border-graphite-200 hover:border-graphite-300 hover:bg-graphite-50 shadow-soft-xs active:scale-[0.98]",
        ghost: "hover:bg-graphite-100 text-graphite-700 hover:text-graphite-900",
        outline:
          "border border-graphite-200 bg-transparent hover:bg-graphite-50 text-graphite-900",
        destructive:
          "bg-red-600 text-white hover:bg-red-700 shadow-soft-xs active:scale-[0.98]",
        link: "text-graphite-900 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs rounded-md",
        lg: "h-10 px-5 text-sm rounded-lg",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
