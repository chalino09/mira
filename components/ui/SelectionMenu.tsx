"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SelectionMenuOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export function SelectionMenu({
  align = "left",
  ariaLabel,
  buttonClassName,
  className,
  menuClassName,
  onChange,
  options,
  value
}: {
  align?: "left" | "right";
  ariaLabel: string;
  buttonClassName?: string;
  className?: string;
  menuClassName?: string;
  onChange: (value: string) => void;
  options: SelectionMenuOption[];
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, open]);

  const nextEnabledIndex = (start: number, direction: 1 | -1) => {
    if (!options.length) return 0;
    for (let offset = 1; offset <= options.length; offset += 1) {
      const index = (start + direction * offset + options.length) % options.length;
      if (!options[index]?.disabled) return index;
    }
    return start;
  };

  const openMenu = (index = selectedIndex) => {
    setFocusedIndex(options[index]?.disabled ? nextEnabledIndex(index, 1) : index);
    setOpen(true);
  };

  const choose = (option: SelectionMenuOption) => {
    if (option.disabled) return;
    setOpen(false);
    if (option.value !== value) onChange(option.value);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div className={cn("relative min-w-0", className)} ref={containerRef}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={cn(
          "flex min-h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-app-border bg-white px-3 text-left text-xs font-medium text-app-text outline-none transition-[background-color,border-color,color,transform] duration-150 ease-out hover:bg-app-sidebar focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green active:scale-[0.96]",
          buttonClassName
        )}
        disabled={!options.length}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowDown" ? selectedIndex : nextEnabledIndex(selectedIndex, -1));
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="truncate">{selectedOption?.label ?? "Seleccionar"}</span>
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-app-muted transition-transform duration-150 ease-out", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          aria-label={ariaLabel}
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 min-w-full w-max max-w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-app-border bg-white p-1.5 shadow-[0_18px_44px_rgba(13,13,13,0.16)]",
            align === "right" ? "right-0" : "left-0",
            menuClassName
          )}
          id={menuId}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setFocusedIndex((current) => nextEnabledIndex(current, event.key === "ArrowDown" ? 1 : -1));
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              const edgeIndex = event.key === "Home" ? -1 : 0;
              setFocusedIndex(nextEnabledIndex(edgeIndex, event.key === "Home" ? 1 : -1));
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              triggerRef.current?.focus();
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              const option = options[focusedIndex];
              if (option) choose(option);
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
          role="menu"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <button
                aria-checked={selected}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left outline-none transition-colors duration-150 ease-out focus-visible:bg-app-soft",
                  selected ? "bg-app-soft text-app-green" : "text-app-text hover:bg-app-sidebar",
                  option.disabled && "cursor-not-allowed opacity-45"
                )}
                disabled={option.disabled}
                key={option.value}
                onClick={() => choose(option)}
                ref={(element) => { itemRefs.current[index] = element; }}
                role="menuitemradio"
                tabIndex={focusedIndex === index ? 0 : -1}
                type="button"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{option.label}</span>
                  {option.description ? <span className="truncate text-[11px] text-app-muted">{option.description}</span> : null}
                </span>
                <Check aria-hidden="true" className={cn("h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
