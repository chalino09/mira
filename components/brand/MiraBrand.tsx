import { cn } from "@/lib/utils";

type PortalMarkProps = {
  className?: string;
  animated?: boolean;
};

export function PortalMark({ className, animated = false }: PortalMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn("text-app-green", animated && "animate-portal-breathe", className)}
      fill="none"
      viewBox="0 0 64 40"
    >
      <path
        d="M10 14C21 4.5 43 4.5 54 14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.35"
      />
      <path
        d="M10 26C21 35.5 43 35.5 54 26"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}

type MiraWordmarkProps = {
  className?: string;
};

export function MiraWordmark({ className }: MiraWordmarkProps) {
  return (
    <span
      className={cn(
        "font-sans text-sm font-medium lowercase tracking-[0.36em] text-app-text",
        className
      )}
    >
      mira
    </span>
  );
}

type MiraBrandProps = {
  className?: string;
  markClassName?: string;
  wordClassName?: string;
  animated?: boolean;
  stacked?: boolean;
};

export function MiraBrand({
  className,
  markClassName,
  wordClassName,
  animated = false,
  stacked = false
}: MiraBrandProps) {
  return (
    <div className={cn("flex items-center gap-2.5", stacked && "flex-col gap-2", className)}>
      <PortalMark animated={animated} className={cn("h-6 w-10", markClassName)} />
      <MiraWordmark className={wordClassName} />
    </div>
  );
}
