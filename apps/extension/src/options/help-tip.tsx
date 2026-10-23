import { InfoIcon } from "lucide-react";
import { t } from "../i18n/t";
import { Button } from "./components/ui/button";
import { FieldLabel } from "./components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";

export interface HelpTipProps {
  topic: string;
  text: string;
}

export interface TipLabelProps {
  htmlFor: string;
  label: string;
  tip: string;
}

export function HelpTip({ topic, text }: HelpTipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("options.shell.helpFor", topic)}
        >
          <InfoIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
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
