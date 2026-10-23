import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { t } from "../../i18n/t";
import { Button } from "../components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import {
  browserLanguage,
  type LanguageOption,
  labelOf,
  languageOptions,
  searchLanguages,
} from "../languages";
import { SettingRow } from "../setting-row";
import { useSettings } from "../use-settings";

const ID = "target-language";

interface LanguageItemProps {
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
      {option.native !== option.label && (
        <span className="language-native ml-auto">{option.native}</span>
      )}
    </CommandItem>
  );
}

export function TranslationSection() {
  const { loaded, update } = useSettings();
  const uiLanguage = chrome.i18n.getUILanguage();
  const options = useMemo(() => languageOptions(uiLanguage), [uiLanguage]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const target = loaded.settings.target;
  const suggested = browserLanguage(options, uiLanguage)
    .filter(() => query.trim() === "")
    .toUndefined();

  const choose = (code: string): void => {
    setOpen(false);
    setQuery("");
    void update((current) => ({ ...current, target: code }));
  };

  return (
    <div className="settings-panel">
      <SettingRow
        id={ID}
        label={t("options.translation.targetLabel")}
        hint={t("options.translation.targetHint")}
        control={
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                id={ID}
                variant="outline"
                role="combobox"
                aria-expanded={open}
                aria-describedby={`${ID}-hint`}
                className="w-full justify-between max-md:col-span-2 md:w-60"
              >
                {labelOf(target, uiLanguage)}
                <ChevronsUpDownIcon className="opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-(--radix-popover-trigger-width) p-0 md:w-72">
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
        }
      />
    </div>
  );
}
