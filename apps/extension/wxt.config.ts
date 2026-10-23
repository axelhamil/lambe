import { defineConfig } from "wxt";
import { LOCAL_HOSTS, OPTIONAL_HOSTS } from "./src/permissions";

const EXTENSION_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzz0oDI//X04Q7IUrhE1saHVjV1/ijFnxwWjFvbPFF672/L24fFXU+CMNCBkWnoCQFirudywZ0b3BK6akYrV7t+Wh6Ckr324h3KW55eC2PKDiazG247seC3iRf4AKpT8lYSqyayzs+C7AluSm8BHaNdnHcQrixI1RHfznHegyIbGD/SkyxsZ7KV/pkLCNxAD/h7Klf6BxUDtXILij37s3WsB+YqYx8neMlKQ6Xgfeq1NpEsEi8ir2y/9R9WfKySOCsC9BV7CodBM1aupnXXHjdOe2mRTMXx+Ka53cmFzpOMRIBTvmyVNP88A9s03MppmnUMgWGU1H8x5U1P4fq1iczQIDAQAB";

const ICONS = {
  16: "icon/16.png",
  32: "icon/32.png",
  48: "icon/48.png",
  128: "icon/128.png",
};

const STORE_BUILD = process.env.LAMBE_STORE === "1";

export default defineConfig({
  imports: false,
  modules: ["@wxt-dev/i18n/module"],
  zip: {
    artifactTemplate: STORE_BUILD
      ? "{{name}}-{{version}}-{{browser}}-store.zip"
      : "{{name}}-{{version}}-{{browser}}.zip",
  },
  manifest: {
    name: "__MSG_ext_name__",
    description: "__MSG_ext_description__",
    default_locale: "en",
    ...(STORE_BUILD ? {} : { key: EXTENSION_PUBLIC_KEY }),
    permissions: ["storage", "unlimitedStorage", "activeTab", "scripting"],
    host_permissions: LOCAL_HOSTS,
    optional_host_permissions: OPTIONAL_HOSTS,
    icons: ICONS,
    action: { default_title: "__MSG_ext_actionTitle__", default_icon: ICONS },
    commands: {
      "toggle-translation": {
        suggested_key: { default: "Alt+L" },
        description: "__MSG_ext_commandToggle__",
      },
    },
  },
});
