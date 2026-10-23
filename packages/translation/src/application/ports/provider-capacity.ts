import type { Option } from "@lambe/kernel/option";

export interface ProviderCapacity {
  concurrency(): Option<number>;
}
