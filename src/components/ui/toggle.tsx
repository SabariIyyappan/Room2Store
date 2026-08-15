import * as React from "react";
import { cn } from "@/lib/cn";

export function Toggle({
  pressed,
  onPressedChange,
  children,
  className,
}: {
  pressed: boolean;
  onPressedChange: (v: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors",
        pressed
          ? "bg-accent text-white border-transparent"
          : "bg-surface1 text-text-secondary hover:bg-surface2",
        className
      )}
    >
      {children}
    </button>
  );
}
