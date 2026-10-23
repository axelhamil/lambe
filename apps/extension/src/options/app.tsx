import { useEffect, useState } from "react";
import { t } from "../i18n/t";
import { LambeGlyph } from "./lambe-glyph";
import { Onboarding } from "./onboarding";
import { SECTION_NAME, SECTION_SUMMARY, type SectionId, sectionFromHash } from "./section-model";
import { SectionNav } from "./section-nav";
import { SitesSection } from "./sections/sites-section";
import { TranslationSection } from "./sections/translation-section";
import { YoutubeSection } from "./sections/youtube-section";
import { SettingsProblem } from "./settings-problem";

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

  return (
    <div className="shell min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="shell-sidebar flex flex-col gap-4 px-4 py-5 md:sticky md:top-0 md:h-dvh md:gap-10 md:px-5 md:py-8">
        <p className="brand flex items-center gap-2.5 md:px-3">
          <LambeGlyph className="brand-glyph" />
          {t("ext.name")}
        </p>
        <SectionNav current={section} />
      </aside>
      <main className="shell-main flex flex-col gap-10 px-4 py-8 md:px-14 md:py-16">
        <SettingsProblem />
        <Onboarding />
        <section className="flex flex-col gap-2" aria-labelledby="section-title">
          <h1 id="section-title" className="section-title">
            {t(SECTION_NAME[section])}
          </h1>
          <p className="section-summary">{t(SECTION_SUMMARY[section])}</p>
        </section>
        {section === "translation" && <TranslationSection />}
        {section === "sites" && <SitesSection />}
        {section === "youtube" && <YoutubeSection />}
      </main>
    </div>
  );
}
