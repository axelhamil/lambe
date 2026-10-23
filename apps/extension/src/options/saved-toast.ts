import type { Result } from "@lambe/kernel/result";
import { toast } from "sonner";
import { problemNotice, type Saved } from "./sections/settings-access";

export function toastResult<E>(
  result: Result<unknown, E>,
  success: string,
  failure?: (error: E) => string,
): void {
  if (result.isSuccess) {
    toast.success(success);

    return;
  }

  if (failure) toast.error(failure(result.getError()));
}

export function toastSaved(saved: Saved, success: string): void {
  toastResult(saved, success, problemNotice);
}
