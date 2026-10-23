import type { ReactNode } from "react";
import { Field, FieldContent, FieldDescription } from "./components/ui/field";
import { Switch } from "./components/ui/switch";
import { TipLabel } from "./help-tip";

export interface SwitchFieldProps {
  id: string;
  label: string;
  description: string;
  tip: string;
  checked: boolean;
  onCheckedChange(on: boolean): void;
  children?: ReactNode;
}

export function SwitchField({
  id,
  label,
  description,
  tip,
  checked,
  onCheckedChange,
  children,
}: SwitchFieldProps) {
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <TipLabel htmlFor={id} label={label} tip={tip} />
        <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
        {children}
      </FieldContent>
      <Switch
        id={id}
        aria-describedby={`${id}-description`}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </Field>
  );
}
