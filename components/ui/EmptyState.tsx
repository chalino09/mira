import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  actionClassName?: string;
};

export function EmptyState({ icon: Icon, title, actionLabel, onAction, actionClassName }: EmptyStateProps) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-app border border-dashed border-app-border bg-white px-6 text-center">
      <Icon className="mb-3 h-6 w-6 text-app-muted" />
      <p className="max-w-sm text-sm font-medium text-app-text">{title}</p>
      {actionLabel && onAction ? (
        <Button className={cn("mt-4", actionClassName)} onClick={onAction} variant="primary">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
