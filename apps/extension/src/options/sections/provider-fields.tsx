import type { Option } from "@lambe/kernel/option";
import { t } from "../../i18n/t";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "../components/ui/field";
import { Input } from "../components/ui/input";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { localModelGuideUrl } from "../project-links";
import type { ProviderDraft, ProviderKind } from "./provider-model";

const KIND_LABEL = {
  ollama: "options.provider.kind.ollama",
  "openai-compatible": "options.provider.kind.openaiCompatible",
} as const;

const KIND_DESCRIPTION = {
  ollama: "options.provider.kindDescription.ollama",
  "openai-compatible": "options.provider.kindDescription.openaiCompatible",
} as const;

const PROVIDER_KINDS: ProviderKind[] = ["ollama", "openai-compatible"];
export const isProviderKind = (value: string): value is ProviderKind =>
  PROVIDER_KINDS.some((kind) => kind === value);

export interface ModelFieldProps {
  draft: ProviderDraft;
  models: string[];
  listed: Option<string>;
  onChange(model: string): void;
}

export function ModelField({ draft, models, listed, onChange }: ModelFieldProps) {
  if (models.length === 0) {
    return (
      <Input
        id="provider-model"
        value={draft.model}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby="provider-model-description"
        autoComplete="off"
        spellCheck={false}
      />
    );
  }

  const missing = draft.model !== "" && listed.isNone();

  return (
    <Select value={listed.unwrapOr(draft.model)} onValueChange={onChange}>
      <SelectTrigger id="provider-model" aria-describedby="provider-model-description">
        <SelectValue placeholder={t("options.provider.modelPlaceholder")} />
      </SelectTrigger>
      <SelectContent>
        {missing && (
          <SelectItem value={draft.model}>
            {t("options.provider.modelNotInstalledItem", draft.model)}
          </SelectItem>
        )}
        {models.map((model) => (
          <SelectItem key={model} value={model}>
            {model}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface KindChoiceProps {
  value: ProviderKind;
  onChange(value: string): void;
}

export function KindChoice({ value, onChange }: KindChoiceProps) {
  return (
    <FieldSet>
      <FieldLegend>{t("options.provider.kindLabel")}</FieldLegend>
      <RadioGroup value={value} onValueChange={onChange} className="md:grid-cols-2">
        {PROVIDER_KINDS.map((kind) => (
          <FieldLabel key={kind} htmlFor={`provider-kind-${kind}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{t(KIND_LABEL[kind])}</FieldTitle>
                <FieldDescription>{t(KIND_DESCRIPTION[kind])}</FieldDescription>
              </FieldContent>
              <RadioGroupItem value={kind} id={`provider-kind-${kind}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      <FieldDescription>
        {t("options.provider.guideIntro")}{" "}
        <a href={localModelGuideUrl(chrome.i18n.getUILanguage())} target="_blank" rel="noreferrer">
          {t("options.provider.guide")}
        </a>
      </FieldDescription>
    </FieldSet>
  );
}
