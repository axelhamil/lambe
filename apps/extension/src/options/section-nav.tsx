import { t } from "../i18n/t";
import { Button } from "./components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { hashOf, SECTION_NAME, SECTIONS, type SectionId, sectionFromHash } from "./section-model";

interface SectionNavProps {
  current: SectionId;
}

const openSection = (value: string): void => {
  window.location.hash = hashOf(sectionFromHash(value));
};

export function SectionNav({ current }: SectionNavProps) {
  return (
    <>
      <nav className="section-nav hidden md:block" aria-label={t("options.shell.navLabel")}>
        <ul className="flex flex-col gap-0.5">
          {SECTIONS.map((section) => (
            <li key={section}>
              <Button asChild variant="ghost" className="w-full justify-start">
                <a href={hashOf(section)} aria-current={section === current ? "page" : undefined}>
                  {t(SECTION_NAME[section])}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </nav>
      <Select value={current} onValueChange={openSection}>
        <SelectTrigger
          className="section-picker w-full md:hidden"
          aria-label={t("options.shell.navLabel")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SECTIONS.map((section) => (
            <SelectItem key={section} value={section}>
              {t(SECTION_NAME[section])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
