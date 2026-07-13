import { createHash } from "node:crypto";

export function certificateSourceIdForPath(path: string) {
  return `source_${createHash("sha256").update(`public-certificate:${path}`).digest("hex").slice(0, 32)}`;
}
