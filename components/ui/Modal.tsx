"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ title, open, onClose, children }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/20 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="max-h-[92vh] w-full overflow-hidden rounded-app border border-app-border bg-white sm:max-w-4xl">
        <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
          <h2 className="text-base font-semibold text-app-text">{title}</h2>
          <Button
            aria-label="Cerrar"
            className="h-8 w-8 px-0"
            icon={<X className="h-4 w-4" />}
            onClick={onClose}
            variant="ghost"
          />
        </div>
        <div className="max-h-[calc(92vh-64px)] overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
