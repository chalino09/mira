"use client";

import { useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn, formatNumericInput } from "@/lib/utils";

const fieldClass =
  "h-11 w-full rounded-xl border border-app-border bg-white px-3 text-sm text-app-text outline-none transition placeholder:text-app-muted focus:border-app-green focus:ring-2 focus:ring-app-green/10";

export function Field({
  label,
  children,
  className,
  preserveCase = false
}: {
  label: string;
  children: ReactNode;
  className?: string;
  preserveCase?: boolean;
}) {
  return (
    <label className={cn("grid gap-2", className)}>
      <span className={cn(
        "text-[11px] font-semibold tracking-[0.18em] text-app-muted",
        !preserveCase && "uppercase"
      )}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function FormattedNumberInput({
  className,
  defaultValue,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "defaultValue"> & {
  defaultValue?: number | string | null;
}) {
  const [value, setValue] = useState(defaultValue == null ? "" : formatNumericInput(defaultValue));

  return (
    <input
      className={cn(fieldClass, className)}
      inputMode="decimal"
      type="text"
      value={value}
      onChange={(event) => setValue(formatNumericInput(event.target.value))}
      {...props}
    />
  );
}

export function SelectInput({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClass, "appearance-none", className)} {...props}>
      {children}
    </select>
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-xl border border-app-border bg-white px-3 py-2.5 text-sm text-app-text outline-none transition placeholder:text-app-muted focus:border-app-green focus:ring-2 focus:ring-app-green/10",
        className
      )}
      {...props}
    />
  );
}
