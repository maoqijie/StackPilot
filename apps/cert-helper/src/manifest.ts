import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { HelperError, type SiteManifest } from "./types.js";
import { safeRelativePath } from "./validation.js";

export async function readManifest(repositoryRoot: string): Promise<SiteManifest> {
  let value: unknown;
  try { value = JSON.parse(await readFile(join(repositoryRoot, ".stackpilot", "site.json"), "utf8")); }
  catch { throw new HelperError("MANIFEST_REQUIRED", "Repository must contain strict .stackpilot/site.json"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HelperError("INVALID_MANIFEST", "Site manifest must be an object");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "buildScript,healthCheckPath,outputDirectory,runtime,schemaVersion,startScript,workingDirectory" || record.schemaVersion !== 1
    || !["static", "node20", "node22"].includes(String(record.runtime))) throw new HelperError("INVALID_MANIFEST", "Site manifest fields are invalid");
  const workingDirectory = record.workingDirectory === "." ? "." : safeRelativePath(record.workingDirectory, "workingDirectory");
  const outputDirectory = record.outputDirectory === null ? null : safeRelativePath(record.outputDirectory, "outputDirectory");
  const script = (value: unknown, field: string) => value === null ? null : typeof value === "string" && /^[A-Za-z0-9:_-]{1,80}$/.test(value) ? value : (() => { throw new HelperError("INVALID_MANIFEST", `${field} is invalid`); })();
  const buildScript = script(record.buildScript, "buildScript"); const startScript = script(record.startScript, "startScript");
  if (record.runtime === "static" && !outputDirectory || record.runtime !== "static" && !startScript) throw new HelperError("INVALID_MANIFEST", "Runtime fields are inconsistent");
  if (record.runtime === "static" && buildScript) throw new HelperError("INVALID_MANIFEST", "Static releases must be prebuilt; select node20 or node22 to run npm scripts");
  if (!(record.healthCheckPath === null || typeof record.healthCheckPath === "string" && /^\/(?!\/)[^?#]{0,255}$/.test(record.healthCheckPath))) throw new HelperError("INVALID_MANIFEST", "healthCheckPath is invalid");
  return { schemaVersion: 1, runtime: record.runtime as SiteManifest["runtime"], workingDirectory, buildScript, outputDirectory, startScript, healthCheckPath: record.healthCheckPath as string | null };
}
