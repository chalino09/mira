"use client";

import { Children, forwardRef, isValidElement, useEffect, useRef, useState } from "react";
import type { ChangeEvent, InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn, formatCurrencyInput, formatNumericInput, formatQuantityInput } from "@/lib/utils";
import { SelectionMenu, type SelectionMenuOption } from "@/components/ui/SelectionMenu";

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

  // Like a native input, defaultValue initializes this capture only. Remote
  // updates must not replace an uncontrolled value the user is editing.
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

export const FormattedCurrencyInput = forwardRef<HTMLInputElement, FormattedInputProps>(function FormattedCurrencyInput(props, ref) {
  return <FormattedInput {...props} formatter={formatCurrencyInput} ref={ref} />;
});

export const FormattedQuantityInput = forwardRef<HTMLInputElement, FormattedInputProps>(function FormattedQuantityInput(props, ref) {
  return <FormattedInput {...props} formatter={formatQuantityInput} ref={ref} />;
});

function selectOptions(children: ReactNode, group?: string): SelectionMenuOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    const element = child as ReactElement<{ children?: ReactNode; disabled?: boolean; label?: string; value?: string | number }>;
    if (element.type === "optgroup") {
      return selectOptions(element.props.children, element.props.label);
    }
    if (element.type !== "option") return [];
    const label = Children.toArray(element.props.children).join("") || String(element.props.value ?? "");
    return [{
      value: String(element.props.value ?? label),
      label,
      description: group,
      disabled: element.props.disabled
    }];
  });
}

export function SelectInput({
  "aria-label": ariaLabel,
  autoFocus,
  children,
  className,
  defaultValue,
  disabled,
  id,
  name,
  onChange,
  required,
  value,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = selectOptions(children);
  const firstValue = options.find((option) => !option.disabled)?.value ?? options[0]?.value ?? "";
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? firstValue));
  const selectedValue = value === undefined ? internalValue : String(value);
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label ?? "Seleccionar";

  const handleChange = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue);
    onChange?.({
      target: { name, value: nextValue },
      currentTarget: { name, value: nextValue }
    } as ChangeEvent<HTMLSelectElement>);
  };

  return (
    <>
      <input disabled={disabled} name={name} type="hidden" value={selectedValue} />
      <SelectionMenu
        ariaLabel={String(ariaLabel ?? props.title ?? selectedLabel)}
        autoFocus={autoFocus}
        buttonClassName={cn(fieldClass, "min-w-0 justify-between", className)}
        className="min-w-0"
        disabled={disabled}
        id={id}
        menuClassName="max-h-72 w-full overflow-y-auto"
        onChange={handleChange}
        options={options}
        value={selectedValue}
      />
      {required && !selectedValue ? <span className="sr-only" role="alert">Selecciona una opción</span> : null}
    </>
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
