import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { buildCertificateMap } from "./certificateMap.js";
import { runFixedCommand, type FixedCommandRunner } from "./runner.js";
import { HelperError } from "./types.js";

export async function certificateHelperReady() {
  try { await Promise.all(["/usr/bin/systemctl", "/usr/sbin/nginx", "/usr/bin/certbot"].map((path) => access(path, constants.X_OK))); return true; } catch { return false; }
}

export async function renewCertbotCertificate(name: string, run: FixedCommandRunner = runFixedCommand) {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(name)) throw new HelperError("CERTIFICATE_NAME_INVALID", "Certificate name is invalid");
  await run("/usr/bin/certbot", ["renew", "--cert-name", name, "--non-interactive", "--no-random-sleep-on-renew"], 540_000);
  await run("/usr/sbin/nginx", ["-t"], 30_000);
  await run("/usr/bin/systemctl", ["reload", "nginx.service"], 20_000);
}

export async function renewOpaqueCertificate(certificateId: string, run?: FixedCommandRunner) {
  const name = (await buildCertificateMap()).get(certificateId);
  if (!name) throw new HelperError("CERTIFICATE_NOT_FOUND", "Certificate is not mapped from active Nginx configuration");
  await renewCertbotCertificate(name, run);
}
