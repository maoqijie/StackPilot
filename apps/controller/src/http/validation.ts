import type { z } from "zod";
import { ApiError } from "./errors/ApiError.js";

export function parseSchema<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  const location = first?.path.length ? ` (${first.path.join(".")})` : "";
  throw new ApiError(400, "BAD_REQUEST", `${label}无效${location}：${first?.message ?? "格式错误"}`);
}
