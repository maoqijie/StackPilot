import { createHash } from "node:crypto";

export function certificateIdForCertbotName(name: string) {
  return `cert_${createHash("sha256").update(`certbot:${name}`).digest("hex").slice(0, 32)}`;
}

export function certbotNameFromCertificatePath(path: string, liveRoot = "/etc/letsencrypt/live") {
  const prefix = `${liveRoot.replace(/\/$/, "")}/`;
  if (!path.startsWith(prefix)) return null;
  const [name, file, ...rest] = path.slice(prefix.length).split("/");
  if (rest.length || !name || !/^[A-Za-z0-9._-]{1,128}$/.test(name)) return null;
  return /^(?:cert|chain|fullchain)\.pem$/.test(file ?? "") ? name : null;
}
