import {
  CaptionsIcon,
  DatabaseIcon,
  GlobeIcon,
  KeyboardIcon,
  LanguagesIcon,
  type LucideIcon,
  ScrollTextIcon,
  ServerIcon,
  ShieldIcon,
} from "lucide-react";
import { t } from "../i18n/t";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./components/ui/sidebar";
import { Tipped } from "./help-tip";
import { LambeGlyph } from "./lambe-glyph";
import { hashOf, NAV_GROUPS, SECTION_NAME, type SectionId } from "./section-model";
import { useSettings } from "./use-settings";

const SECTION_ICON = {
  provider: ServerIcon,
  translation: LanguagesIcon,
  sites: GlobeIcon,
  youtube: CaptionsIcon,
  shortcut: KeyboardIcon,
  prompt: ScrollTextIcon,
  cache: DatabaseIcon,
  privacy: ShieldIcon,
} satisfies Record<SectionId, LucideIcon>;

export interface AppSidebarProps {
  current: SectionId;
}

function ModelInUse() {
  const { loaded } = useSettings();
  const { setOpenMobile } = useSidebar();
  const { provider } = loaded.settings;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Tipped side="right" tip={t("options.shell.modelInUseTip", provider.baseUrl)}>
          <SidebarMenuButton asChild>
            <a
              href={hashOf("provider")}
              aria-label={t("options.shell.modelInUse", provider.model)}
              onClick={() => setOpenMobile(false)}
            >
              <ServerIcon />
              <span>{provider.model}</span>
            </a>
          </SidebarMenuButton>
        </Tipped>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar({ current }: AppSidebarProps) {
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        <p className="flex items-center gap-inline p-inline">
          <LambeGlyph className="size-7" />
          {t("ext.name")}
        </p>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={t("options.shell.navLabel")}>
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{t(group.label)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.sections.map((section) => {
                    const Icon = SECTION_ICON[section];

                    return (
                      <SidebarMenuItem key={section}>
                        <SidebarMenuButton asChild isActive={section === current}>
                          <a
                            href={hashOf(section)}
                            aria-current={section === current ? "page" : undefined}
                            onClick={() => setOpenMobile(false)}
                          >
                            <Icon />
                            <span>{t(SECTION_NAME[section])}</span>
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <ModelInUse />
      </SidebarFooter>
    </Sidebar>
  );
}
