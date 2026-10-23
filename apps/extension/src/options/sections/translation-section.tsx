import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { t } from "../../i18n/t";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "../components/ui/command";
import { Field, FieldDescription } from "../components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { TipLabel } from "../help-tip";
import {
  browserLanguage,
  type LanguageOption,
  labelOf,
  languageOptions,
  searchLanguages,
} from "../languages";
import { toastSaved } from "../saved-toast";
import { useSettings } from "../use-settings";

const ID = "target-language";

export interface LanguageItemProps {
  option: LanguageOption;
  value: string;
  selected: boolean;
  onChoose(code: string): void;
}

function LanguageItem({ option, value, selected, onChoose }: LanguageItemProps) {
  return (
    <CommandItem value={value} onSelect={() => onChoose(option.code)}>
      <CheckIcon className={selected ? undefined : "invisible"} />
      {option.label}
      {option.native !== option.label && <CommandShortcut>{option.native}</CommandShortcut>}
    </CommandItem>
  );
}

export function TranslationSection() {
  const { loaded, update, uiLanguage } = useSettings();
  const options = useMemo(() => languageOptions(uiLanguage), [uiLanguage]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const target = loaded.settings.target;
  const browser = browserLanguage(options, uiLanguage);
  const suggested = browser.filter(() => query.trim() === "").toUndefined();
  const browserName = browser.map(({ label }) => label).unwrapOr(uiLanguage);

  const choose = (code: string): void => {
    setOpen(false);
    setQuery("");
    void update((current) => ({ ...current, target: code })).then((saved) =>
      toastSaved(saved, t("options.translation.saved", labelOf(code, uiLanguage))),
    );
  };

  return (
    <Card>
      <CardContent>
        <Field>
          <TipLabel
            htmlFor={ID}
            label={t("options.translation.targetLabel")}
            tip={t("options.translation.targetTip", browserName)}
          />
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                id={ID}
                variant="outline"
                role="combobox"
                aria-expanded={open}
                aria-describedby={`${ID}-description`}
                className="justify-between md:max-w-xs"
              >
                {labelOf(target, uiLanguage)}
                <ChevronsUpDownIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
              <Command shouldFilter={false} label={t("options.translation.pick")}>
                <CommandInput
                  value={query}
                  onValueChange={setQuery}
                  placeholder={t("options.translation.search")}
                />
                <CommandList>
                  <CommandEmpty>{t("options.translation.empty")}</CommandEmpty>
                  {suggested && (
                    <CommandGroup heading={t("options.translation.browserGroup")}>
                      <LanguageItem
                        option={suggested}
                        value={`browser:${suggested.code}`}
                        selected={suggested.code === target}
                        onChoose={choose}
                      />
                    </CommandGroup>
                  )}
                  <CommandGroup heading={t("options.translation.allGroup")}>
                    {searchLanguages(options, query).map((option) => (
                      <LanguageItem
                        key={option.code}
                        option={option}
                        value={option.code}
                        selected={option.code === target}
                        onChoose={choose}
                      />
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <FieldDescription id={`${ID}-description`}>
            {t("options.translation.targetHint")}
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
}
