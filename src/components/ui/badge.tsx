import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "accent" | "success" | "warning" | "danger" | "muted";

const variants: Record<Variant, string> = {
  default: "bg-surface2 text-text-primary border-border",
  accent: "bg-accent-soft text-accent border-transparent",
  success: "bg-success/15 text-success border-transparent",
  warning: "bg-warning/15 text-warning border-transparent",
  danger: "bg-danger/15 text-danger border-transparent",
  muted: "bg-surface2 text-text-muted border-border",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
