import { InfoIcon } from "lucide-react";
import type { ComponentProps, ReactElement } from "react";
import { t } from "../i18n/t";
import { Button } from "./components/ui/button";
import { FieldLabel } from "./components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

export interface TippedProps {
  tip: string;
  side?: ComponentProps<typeof TooltipContent>["side"];
  children: ReactElement;
}

export interface HelpTipProps {
  topic: string;
  text: string;
}

export interface TipLabelProps {
  htmlFor: string;
  label: string;
  tip: string;
}

export function Tipped({ tip, side, children }: TippedProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export function HelpTip({ topic, text }: HelpTipProps) {
  return (
    <Tipped tip={text}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("options.shell.helpFor", topic)}
      >
        <InfoIcon />
      </Button>
    </Tipped>
  );
}

export function TipLabel({ htmlFor, label, tip }: TipLabelProps) {
  return (
    <span className="flex items-center gap-tight">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <HelpTip topic={label} text={tip} />
    </span>
  );
}
