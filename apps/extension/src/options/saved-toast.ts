import { toast } from "sonner";
import { renderError } from "../i18n/render-error";
import type { Saved } from "./sections/settings-access";

export function toastSaved(saved: Saved, success: string): void {
  saved.match({
    ok: () => toast.success(success),
    fail: (problem) => toast.error(renderError({ code: problem.code })),
  });
}
