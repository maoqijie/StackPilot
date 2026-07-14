import { z } from "zod";

export const PHYSICAL_HOST_ID_PREFIX = "ph_" as const;
export const PhysicalHostIdSchema = z.string().regex(/^ph_[a-f0-9]{64}$/);

export type PhysicalHostId = z.infer<typeof PhysicalHostIdSchema>;
