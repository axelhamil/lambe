import { z } from "zod";
import { SECTIONS } from "../options/section-model";
import { siteRuleSchema } from "../settings/site-rule";

const OPTIONS_PAGE = "/options.html";

export const openOptionsMessageSchema = z
  .object({
    type: z.literal("lambe/open-options"),
    section: z.enum(SECTIONS).optional(),
    origin: siteRuleSchema.shape.origin.optional(),
  })
  .refine((message) => message.origin === undefined || message.section === "sites", {
    message: "Only the sites section takes an origin.",
  });

export type OpenOptionsMessage = z.infer<typeof openOptionsMessageSchema>;

export function optionsPathOf(message: OpenOptionsMessage): string {
  if (message.section === undefined) return OPTIONS_PAGE;

  const query = message.origin === undefined ? "" : `?origin=${encodeURIComponent(message.origin)}`;

  return `${OPTIONS_PAGE}#${message.section}${query}`;
}
