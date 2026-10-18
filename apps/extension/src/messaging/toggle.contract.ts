import { z } from "zod";

export const toggleMessageSchema = z.object({ type: z.literal("lambe/toggle") });

export type ToggleMessage = z.infer<typeof toggleMessageSchema>;

export const TOGGLE_MESSAGE: ToggleMessage = { type: "lambe/toggle" };
