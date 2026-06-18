import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon: Icon, title, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-app border border-dashed border-app-border bg-white px-6 text-center">
      <Icon className="mb-3 h-6 w-6 text-app-muted" />
      <p className="max-w-sm text-sm font-medium text-app-text">{title}</p>
      {actionLabel && onAction ? (
        <Button className="mt-4" onClick={onAction} variant="primary">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
