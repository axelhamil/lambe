import { useEffect, useState } from "react";
import { t } from "../i18n/t";
import { AppSidebar } from "./app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./components/ui/sidebar";
import { Toaster } from "./components/ui/sonner";
import { LambeGlyph } from "./lambe-glyph";
import { Onboarding } from "./onboarding";
import { SECTION_NAME, SECTION_SUMMARY, type SectionId, sectionFromHash } from "./section-model";
import { CacheSection } from "./sections/cache-section";
import { PrivacySection } from "./sections/privacy-section";
import { PromptSection } from "./sections/prompt-section";
import { ProviderSection } from "./sections/provider-section";
import { ShortcutSection } from "./sections/shortcut-section";
import { SitesSection } from "./sections/sites-section";
import { TranslationSection } from "./sections/translation-section";
import { YoutubeSection } from "./sections/youtube-section";
import { SettingsProblem } from "./settings-problem";

const SECTION_VIEW = {
  provider: ProviderSection,
  translation: TranslationSection,
  sites: SitesSection,
  youtube: YoutubeSection,
  shortcut: ShortcutSection,
  prompt: PromptSection,
  cache: CacheSection,
  privacy: PrivacySection,
} satisfies Record<SectionId, () => React.JSX.Element>;

function useHashSection(): SectionId {
  const [section, setSection] = useState(() => sectionFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = (): void => setSection(sectionFromHash(window.location.hash));

    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return section;
}

export function App() {
  const section = useHashSection();
  const View = SECTION_VIEW[section];

  return (
    <SidebarProvider>
      <AppSidebar current={section} />
      <SidebarInset>
        <header className="flex items-center gap-inline p-inline md:hidden">
          <SidebarTrigger aria-label={t("options.shell.openMenu")} />
          <LambeGlyph className="size-6" />
          {t("ext.name")}
        </header>
        <div className="flex w-full max-w-content flex-col gap-block self-center px-gutter py-block md:px-page md:py-page">
          <SettingsProblem />
          <Onboarding />
          <hgroup className="flex flex-col gap-tight">
            <h1>{t(SECTION_NAME[section])}</h1>
            <p>{t(SECTION_SUMMARY[section])}</p>
          </hgroup>
          <View />
        </div>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
