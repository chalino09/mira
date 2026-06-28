"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const inputShellClass =
  "relative flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-app-border bg-white px-3 text-left text-sm text-app-text outline-none transition hover:bg-app-sidebar focus:border-app-green focus:ring-2 focus:ring-app-green/10 disabled:cursor-not-allowed disabled:opacity-50";

type PickerChange = ChangeEvent<HTMLInputElement>;

function emitInputChange(
  name: string | undefined,
  value: string,
  onChange: ((event: PickerChange) => void) | undefined
) {
  onChange?.({
    target: { name, value },
    currentTarget: { name, value }
  } as PickerChange);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function formatDateLabel(value?: string) {
  const parsed = parseDateKey(value);
  if (!parsed) return "Seleccionar fecha";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(parsed).replace(".", "");
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function isDateAllowed(value: string, min?: string, max?: string) {
  if (min && value < min) return false;
  if (max && value > max) return false;
  return true;
}

function useCloseOnOutsideClick<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose, open]);

  return ref;
}

type DatePickerInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: (event: PickerChange) => void;
  showQuickActions?: boolean;
};

export function DatePickerInput({
  className,
  defaultValue = "",
  disabled,
  max,
  min,
  name,
  onChange,
  required,
  showQuickActions = true,
  value,
  ...props
}: DatePickerInputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = value ?? internalValue;
  const selectedDate = parseDateKey(selectedValue);
  const [viewMonth, setViewMonth] = useState(startOfMonth(selectedDate ?? new Date()));
  const [open, setOpen] = useState(false);
  const containerRef = useCloseOnOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const today = dateKey(new Date());
  const minValue = min == null ? undefined : String(min);
  const maxValue = max == null ? undefined : String(max);

  useEffect(() => {
    const nextDate = parseDateKey(selectedValue);
    if (nextDate) setViewMonth(startOfMonth(nextDate));
  }, [selectedValue]);

  const setSelectedValue = (nextValue: string) => {
    if (!isDateAllowed(nextValue, minValue, maxValue)) return;
    if (value === undefined) setInternalValue(nextValue);
    emitInputChange(name, nextValue, onChange);
    setViewMonth(startOfMonth(parseDateKey(nextValue) ?? new Date()));
    setOpen(false);
  };

  const firstOfMonth = startOfMonth(viewMonth);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = addDays(firstOfMonth, -mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const quickActions = [
    { label: "Hoy", value: today },
    { label: "Ayer", value: dateKey(addDays(new Date(), -1)) },
    { label: "7 días", value: dateKey(addDays(new Date(), -7)) },
    { label: "30 días", value: dateKey(addDays(new Date(), -30)) }
  ].filter((action) => isDateAllowed(action.value, minValue, maxValue));

  return (
    <div ref={containerRef} className="relative">
      <input disabled={disabled} name={name} readOnly required={required} type="hidden" value={selectedValue} {...props} />
      <button
        aria-expanded={open}
        className={cn(inputShellClass, className)}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={cn(!selectedValue && "text-app-muted")}>{formatDateLabel(selectedValue)}</span>
        <CalendarDays className="h-4 w-4 text-app-muted" />
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-app-border bg-white p-3 shadow-[0_18px_44px_rgba(13,13,13,0.16)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              aria-label="Mes anterior"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-app-border text-app-muted hover:bg-app-sidebar hover:text-app-text"
              onClick={() => setViewMonth((current) => addMonths(current, -1))}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold capitalize text-app-text">{monthLabel(viewMonth)}</p>
            <button
              aria-label="Mes siguiente"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-app-border text-app-muted hover:bg-app-sidebar hover:text-app-text"
              onClick={() => setViewMonth((current) => addMonths(current, 1))}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {showQuickActions && quickActions.length ? (
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {quickActions.map((action) => (
                <button
                  className="h-8 rounded-lg border border-app-border px-2 text-xs font-medium text-app-muted hover:bg-app-sidebar hover:text-app-text"
                  key={action.label}
                  onClick={() => setSelectedValue(action.value)}
                  type="button"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-app-muted">
            {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = dateKey(day);
              const isCurrentMonth = day.getMonth() === viewMonth.getMonth();
              const isSelected = key === selectedValue;
              const isToday = key === today;
              const disabledDay = !isDateAllowed(key, minValue, maxValue);

              return (
                <button
                  aria-label={formatDateLabel(key)}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-lg text-sm font-medium transition",
                    isCurrentMonth ? "text-app-text" : "text-app-muted/45",
                    isToday && !isSelected && "ring-1 ring-app-green/30",
                    isSelected && "bg-app-green text-white",
                    !isSelected && !disabledDay && "hover:bg-app-sidebar",
                    disabledDay && "cursor-not-allowed opacity-30"
                  )}
                  disabled={disabledDay}
                  key={key}
                  onClick={() => setSelectedValue(key)}
                  type="button"
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function parseTime(value?: string | null) {
  const [hourText, minuteText] = (value ?? "").split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return { hour: 8, minute: 0 };
  }

  return {
    hour: Math.min(23, Math.max(0, hour)),
    minute: Math.min(59, Math.max(0, minute))
  };
}

function timeKey(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatTimeLabel(value?: string) {
  if (!value) return "Sin hora";
  const parsed = parseTime(value);
  return new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(2026, 0, 1, parsed.hour, parsed.minute)).replace(/\s/g, " ");
}

type TimePickerInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: (event: PickerChange) => void;
};

export function TimePickerInput({
  className,
  defaultValue = "",
  disabled,
  name,
  onChange,
  required,
  value,
  ...props
}: TimePickerInputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = value ?? internalValue;
  const [open, setOpen] = useState(false);
  const containerRef = useCloseOnOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const parsed = parseTime(selectedValue);
  const selectedHour12 = parsed.hour % 12 || 12;
  const selectedPeriod = parsed.hour >= 12 ? "PM" : "AM";
  const minuteOptions = [0, 15, 30, 45];

  const setSelectedValue = (nextValue: string, close = false) => {
    if (value === undefined) setInternalValue(nextValue);
    emitInputChange(name, nextValue, onChange);
    if (close) setOpen(false);
  };

  const setTimePart = (hour12: number, minute: number, period: "AM" | "PM") => {
    const normalizedHour = period === "PM"
      ? (hour12 % 12) + 12
      : hour12 % 12;
    setSelectedValue(timeKey(normalizedHour, minute));
  };

  const setCurrentTime = () => {
    const now = new Date();
    const roundedMinute = Math.round(now.getMinutes() / 15) * 15;
    const next = new Date(now);
    next.setMinutes(roundedMinute === 60 ? 0 : roundedMinute);
    if (roundedMinute === 60) next.setHours(now.getHours() + 1);
    setSelectedValue(timeKey(next.getHours(), next.getMinutes()), true);
  };

  return (
    <div ref={containerRef} className="relative">
      <input disabled={disabled} name={name} readOnly required={required} type="hidden" value={selectedValue} {...props} />
      <button
        aria-expanded={open}
        className={cn(inputShellClass, className)}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={cn(!selectedValue && "text-app-muted")}>{formatTimeLabel(selectedValue)}</span>
        <Clock3 className="h-4 w-4 text-app-muted" />
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-app-border bg-white p-3 shadow-[0_18px_44px_rgba(13,13,13,0.16)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-app-text">{formatTimeLabel(selectedValue)}</p>
            <button
              className="h-8 rounded-lg border border-app-border px-3 text-xs font-medium text-app-muted hover:bg-app-sidebar hover:text-app-text"
              onClick={setCurrentTime}
              type="button"
            >
              Ahora
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1.2fr_0.9fr_0.8fr]">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-muted">Hora</p>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                  <button
                    className={cn(
                      "h-9 rounded-lg border text-sm font-medium",
                      hour === selectedHour12
                        ? "border-app-green bg-app-green text-white"
                        : "border-app-border text-app-text hover:bg-app-sidebar"
                    )}
                    key={hour}
                    onClick={() => setTimePart(hour, parsed.minute, selectedPeriod)}
                    type="button"
                  >
                    {hour}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-muted">Min</p>
              <div className="grid grid-cols-2 gap-1">
                {minuteOptions.map((minute) => (
                  <button
                    className={cn(
                      "h-9 rounded-lg border text-sm font-medium",
                      minute === parsed.minute
                        ? "border-app-green bg-app-green text-white"
                        : "border-app-border text-app-text hover:bg-app-sidebar"
                    )}
                    key={minute}
                    onClick={() => setTimePart(selectedHour12, minute, selectedPeriod)}
                    type="button"
                  >
                    {String(minute).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-muted">Turno</p>
              <div className="grid gap-1">
                {(["AM", "PM"] as const).map((period) => (
                  <button
                    className={cn(
                      "h-9 rounded-lg border text-sm font-medium",
                      period === selectedPeriod
                        ? "border-app-green bg-app-green text-white"
                        : "border-app-border text-app-text hover:bg-app-sidebar"
                    )}
                    key={period}
                    onClick={() => setTimePart(selectedHour12, parsed.minute, period)}
                    type="button"
                  >
                    {period === "AM" ? "a.m." : "p.m."}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            className="mt-3 h-9 w-full rounded-lg bg-app-green text-sm font-semibold text-white hover:bg-[#244B37]"
            onClick={() => setOpen(false)}
            type="button"
          >
            Listo
          </button>
        </div>
      ) : null}
    </div>
  );
}
