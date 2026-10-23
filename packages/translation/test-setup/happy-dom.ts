import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({
  settings: {
    disableCSSFileLoading: true,
    disableJavaScriptFileLoading: true,
    disableIframePageLoading: true,
    handleDisabledFileLoadingAsSuccess: true,
  },
});
