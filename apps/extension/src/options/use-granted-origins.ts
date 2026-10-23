import { Option } from "@lambe/kernel/option";
import { useEffect, useState } from "react";
import { chromeHostAccess } from "../access/host-access";

export function useGrantedOrigins(): Option<string[]> {
  const [granted, setGranted] = useState(Option.none<string[]>());

  useEffect(() => {
    const refresh = (): void => {
      void chromeHostAccess.granted().then((origins) => setGranted(Option.some(origins)));
    };

    refresh();
    chrome.permissions.onAdded.addListener(refresh);
    chrome.permissions.onRemoved.addListener(refresh);

    return () => {
      chrome.permissions.onAdded.removeListener(refresh);
      chrome.permissions.onRemoved.removeListener(refresh);
    };
  }, []);

  return granted;
}
