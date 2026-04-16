import { cn } from "../lib/utils";
import type { ButtonHTMLAttributes } from "react";

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function GlassButton({
  variant = "secondary",
  className,
  children,
  ...props
}: GlassButtonProps) {
  const isPrimary = variant === "primary";

  return (
    <button
      className={cn(
        "rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors duration-150",
        "text-text-primary border",
        isPrimary
          ? "bg-glass-primary border-glass-border-primary hover:bg-glass-primary-hover"
          : "bg-glass border-glass-border hover:bg-glass-hover",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
