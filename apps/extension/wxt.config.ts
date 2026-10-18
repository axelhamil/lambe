import { defineConfig } from "wxt";
import { PAGE_MATCHES, PROVIDER_HOSTS } from "./src/permissions";

const EXTENSION_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzz0oDI//X04Q7IUrhE1saHVjV1/ijFnxwWjFvbPFF672/L24fFXU+CMNCBkWnoCQFirudywZ0b3BK6akYrV7t+Wh6Ckr324h3KW55eC2PKDiazG247seC3iRf4AKpT8lYSqyayzs+C7AluSm8BHaNdnHcQrixI1RHfznHegyIbGD/SkyxsZ7KV/pkLCNxAD/h7Klf6BxUDtXILij37s3WsB+YqYx8neMlKQ6Xgfeq1NpEsEi8ir2y/9R9WfKySOCsC9BV7CodBM1aupnXXHjdOe2mRTMXx+Ka53cmFzpOMRIBTvmyVNP88A9s03MppmnUMgWGU1H8x5U1P4fq1iczQIDAQAB";

const ALL_FRAMES = process.env.LAMBE_ALL_FRAMES === "1";

export default defineConfig({
  imports: false,
  manifest: {
    name: "Lambë",
    description: "Translates web pages in place with a local LLM.",
    key: EXTENSION_PUBLIC_KEY,
    permissions: ["storage", "unlimitedStorage"],
    host_permissions: [...PAGE_MATCHES, ...PROVIDER_HOSTS],
    action: { default_title: "Translate this page with Lambë" },
    commands: {
      "toggle-translation": {
        suggested_key: { default: "Alt+L" },
        description: "Toggle the translation of the current page",
      },
    },
  },
  vite: () => ({
    define: { "import.meta.env.LAMBE_ALL_FRAMES": JSON.stringify(ALL_FRAMES ? "1" : "0") },
  }),
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      for (const script of manifest.content_scripts ?? []) {
        script.matches = [...PAGE_MATCHES];
        script.all_frames = ALL_FRAMES;
      }
    },
  },
});
