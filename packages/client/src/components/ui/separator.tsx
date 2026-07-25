import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Separator = forwardRef<HTMLHRElement, HTMLAttributes<HTMLHRElement>>(
  ({ className, ...props }, ref) => (
    <hr
      ref={ref}
      className={cn("shrink-0 border-0 bg-border h-[1px] w-full", className)}
      {...props}
    />
  ),
);
Separator.displayName = "Separator";
