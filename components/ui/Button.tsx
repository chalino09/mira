"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  icon?: ReactNode;
};

export function Button({
  className,
  variant = "secondary",
  icon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-app-green/20 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "border-app-green bg-app-green text-white hover:bg-[#244B37]",
        variant === "secondary" &&
          "border-app-border bg-white text-app-text hover:bg-app-sidebar",
        variant === "ghost" &&
          "border-transparent bg-transparent text-app-muted hover:bg-app-sidebar hover:text-app-text",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
