"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn, formatNumericInput, formatQuantityInput } from "@/lib/utils";

const fieldClass =
  "h-11 w-full rounded-xl border border-app-border bg-white px-3 text-sm text-app-text outline-none transition placeholder:text-app-muted focus:border-app-green focus:ring-2 focus:ring-app-green/10";

export function Field({
  label,
  children,
  className,
  preserveCase = false
}: {
  label: ReactNode;
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

type FormattedInputValue = string | number | null | undefined;

const unitGroups = [
  { label: "Insumos e inventario", values: ["ml", "lt", "gr", "kg", "unidad"] },
  { label: "Mediciones", values: ["ppm", "mg/L", "meq/L", "mmol/L", "mS/cm", "dS/m", "pH", "°C", "°F"] }
] as const;

const knownUnits = new Set<string>(unitGroups.flatMap((group) => group.values));

type FormattedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "defaultValue" | "value"> & {
  defaultValue?: FormattedInputValue;
  value?: FormattedInputValue;
};

const FormattedInput = forwardRef<HTMLInputElement, FormattedInputProps & {
  formatter: (value: FormattedInputValue) => string;
}>(function FormattedInput({
  className,
  defaultValue,
  value: controlledValue,
  onChange,
  formatter,
  ...props
}, ref) {
  const isControlled = controlledValue !== undefined;
  const formattedDefaultValue = defaultValue == null ? "" : formatter(defaultValue);
  const [value, setValue] = useState(formattedDefaultValue);

  useEffect(() => {
    setValue(formattedDefaultValue);
  }, [formattedDefaultValue, isControlled]);

  const displayValue = isControlled ? formatter(controlledValue) : value;

  return (
    <input
      ref={ref}
      className={cn(fieldClass, className)}
      inputMode="decimal"
      type="text"
      value={displayValue}
      onChange={(event) => {
        const formattedValue = formatter(event.currentTarget.value);
        if (!isControlled) {
          setValue(formattedValue);
        }
        event.currentTarget.value = formattedValue;
        onChange?.(event);
      }}
      {...props}
    />
  );
});

export const FormattedNumberInput = forwardRef<HTMLInputElement, FormattedInputProps>(function FormattedNumberInput(props, ref) {
  return <FormattedInput {...props} formatter={formatNumericInput} ref={ref} />;
});

export const FormattedQuantityInput = forwardRef<HTMLInputElement, FormattedInputProps>(function FormattedQuantityInput(props, ref) {
  return <FormattedInput {...props} formatter={formatQuantityInput} ref={ref} />;
});

export function SelectInput({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClass, "appearance-none", className)} {...props}>
      {children}
    </select>
  );
}

export function UnitSelectInput({ value, defaultValue, ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, "children">) {
  const selectedValue = value ?? defaultValue;
  const legacyUnit = selectedValue == null ? "" : String(selectedValue);

  return (
    <SelectInput defaultValue={defaultValue} value={value} {...props}>
      <option disabled value="">Selecciona unidad</option>
      {!knownUnits.has(legacyUnit) && legacyUnit ? <option value={legacyUnit}>{legacyUnit}</option> : null}
      {unitGroups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.values.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </optgroup>
      ))}
    </SelectInput>
  );
}

export function TextArea({
  autoGrow = false,
  className,
  onInput,
  rows,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean }) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    if (!autoGrow || !textAreaRef.current) return;
    textAreaRef.current.style.height = "auto";
    textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
  };

  useEffect(resize, [autoGrow, props.defaultValue, props.value]);

  return (
    <textarea
      ref={textAreaRef}
      className={cn(
        "min-h-28 w-full rounded-xl border border-app-border bg-white px-3 py-2.5 text-sm text-app-text outline-none transition placeholder:text-app-muted focus:border-app-green focus:ring-2 focus:ring-app-green/10",
        autoGrow && "min-h-11 resize-none overflow-hidden",
        className
      )}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
      rows={autoGrow ? rows ?? 1 : rows}
      {...props}
    />
  );
}
