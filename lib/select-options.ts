import { Children, Fragment, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import type { SelectionMenuOption } from "@/components/ui/SelectionMenu";

export function selectOptions(children: ReactNode, group?: string): SelectionMenuOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    const element = child as ReactElement<{ children?: ReactNode; disabled?: boolean; label?: string; value?: string | number }>;
    // React.Children does not traverse fragments, which can wrap all area options.
    if (element.type === Fragment) {
      return selectOptions(element.props.children, group);
    }
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
