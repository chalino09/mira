"use client";

import { useEffect, useState } from "react";
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
  label: string;
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
  { label: "Inventario", values: ["kg", "g", "mg", "t", "L", "mL", "m³", "h", "min", "unidad", "pieza", "caja", "saco", "rollo"] },
  { label: "Aplicación y nutrición", values: ["ml/L", "g/L", "L/ha", "kg/ha", "ml/20 L", "g/20 L", "cc/L", "%"] },
  { label: "Mediciones", values: ["ppm", "mg/L", "meq/L", "mmol/L", "mS/cm", "dS/m", "pH", "°C", "°F"] }
] as const;

const knownUnits = new Set<string>(unitGroups.flatMap((group) => group.values));

type FormattedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "defaultValue" | "value"> & {
  defaultValue?: FormattedInputValue;
  value?: FormattedInputValue;
};

function FormattedInput({
  className,
  defaultValue,
  value: controlledValue,
  onChange,
  formatter,
  ...props
}: FormattedInputProps & {
  formatter: (value: FormattedInputValue) => string;
}) {
  const isControlled = controlledValue !== undefined;
  const formattedDefaultValue = defaultValue == null ? "" : formatter(defaultValue);
  const [value, setValue] = useState(formattedDefaultValue);

  useEffect(() => {
    setValue(formattedDefaultValue);
  }, [formattedDefaultValue, isControlled]);

  const displayValue = isControlled ? formatter(controlledValue) : value;

  return (
    <input
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
}

export function FormattedNumberInput(props: FormattedInputProps) {
  return <FormattedInput {...props} formatter={formatNumericInput} />;
}

export function FormattedQuantityInput(props: FormattedInputProps) {
  return <FormattedInput {...props} formatter={formatQuantityInput} />;
}

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

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-xl border border-app-border bg-white px-3 py-2.5 text-sm text-app-text outline-none transition placeholder:text-app-muted focus:border-app-green focus:ring-2 focus:ring-app-green/10",
        className
      )}
      {...props}
    />
  );
}
