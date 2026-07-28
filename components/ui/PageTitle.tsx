import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function PageTitle({ className, ...props }: ComponentPropsWithoutRef<"h1">) {
  return (
    <h1
      className={cn(
        "text-balance text-3xl font-light leading-none tracking-normal text-app-text sm:text-4xl md:text-6xl",
        className
      )}
      {...props}
    />
  );
}
