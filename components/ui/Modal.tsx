"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  bodyClassName?: string;
  panelClassName?: string;
};

export function Modal({ title, open, onClose, children, bodyClassName, panelClassName }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/20 backdrop-blur-sm sm:items-center sm:justify-center sm:p-3">
      <div className={cn("min-h-[100dvh] w-full overflow-hidden border-y border-app-border bg-white sm:min-h-0 sm:max-h-[92vh] sm:rounded-app sm:border sm:max-w-4xl", panelClassName)}>
        <div className="flex min-h-16 items-center justify-between border-b border-app-border px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-base font-semibold text-app-text">{title}</h2>
          <Button
            aria-label="Cerrar"
            className="h-11 w-11 px-0 sm:h-8 sm:w-8"
            icon={<X className="h-4 w-4" />}
            onClick={onClose}
            variant="ghost"
          />
        </div>
        <div className={cn("max-h-[calc(100dvh-64px)] overflow-y-auto px-4 py-5 sm:max-h-[calc(92vh-64px)] sm:px-5", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}
