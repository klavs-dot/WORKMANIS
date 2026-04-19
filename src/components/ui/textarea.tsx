import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[72px] w-full rounded-lg border border-graphite-200 bg-white px-3 py-2 text-sm",
          "placeholder:text-graphite-400 resize-none",
          "transition-colors",
          "hover:border-graphite-300",
          "focus-visible:outline-none focus-visible:border-graphite-900 focus-visible:ring-2 focus-visible:ring-graphite-900/5",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
