"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
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
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      const currentPaddingRight = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
    }
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusableSelector = [
      "button:not([disabled])",
      "[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");

    window.requestAnimationFrame(() => {
      (panel?.querySelector<HTMLElement>("[autofocus]")
        ?? panel?.querySelector<HTMLElement>(focusableSelector)
        ?? panel)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      triggerRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-overlay-enter fixed inset-0 z-[60] flex items-end bg-black/20 backdrop-blur-sm sm:items-center sm:justify-center sm:p-3"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn("modal-panel-enter min-h-[100dvh] w-full overflow-hidden overscroll-contain border-y border-app-border bg-white outline-none sm:min-h-0 sm:max-h-[92vh] sm:rounded-app sm:border sm:max-w-4xl", panelClassName)}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex min-h-16 items-center justify-between border-b border-app-border px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-base font-semibold text-app-text" id={titleId}>{title}</h2>
          <Button
            aria-label="Cerrar"
            className="h-11 w-11 px-0 sm:h-8 sm:w-8"
            icon={<X aria-hidden="true" className="h-4 w-4" />}
            onClick={onClose}
            variant="ghost"
          />
        </div>
        <div
          className={cn("max-h-[calc(100dvh-64px)] overflow-y-auto px-4 py-5 sm:max-h-[calc(92vh-64px)] sm:px-5", bodyClassName)}
          data-modal-scroll
        >
          {children}
        </div>
      </div>
    </div>
  );
}
