import type { ReactNode } from "react";

interface SettingRowProps {
  id: string;
  label: string;
  hint: string;
  control: ReactNode;
  children?: ReactNode;
}

export function SettingRow({ id, label, hint, control, children }: SettingRowProps) {
  return (
    <div className="setting-row grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-8 gap-y-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="setting-label">
          {label}
        </label>
        <p id={`${id}-hint`} className="setting-hint">
          {hint}
        </p>
      </div>
      {control}
      {children}
    </div>
  );
}
