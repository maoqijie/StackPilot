import { createServer as createHttpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import selfsigned from "selfsigned";
import { createControllerServices } from "../../../apps/controller/dist/app.js";
import { createStackPilotAgentServer, createStackPilotServer } from "../../../apps/controller/dist/server.js";
import { loadControllerConfig } from "../../../apps/controller/dist/config/environment.js";
import { openDatabase } from "../../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../../apps/controller/dist/identity/identityService.js";
import { SqliteAgentControlRepository } from "../../../apps/controller/dist/repositories/sqliteAgentControlRepository.js";
import { FakePlatformAdapter } from "../../controller/support/fakePlatform.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const runtime = join(root, "output", "e2e", "runtime");
rmSync(runtime, { recursive: true, force: true });
mkdirSync(runtime, { recursive: true });

const certificate = await selfsigned.generate([{ name: "commonName", value: "127.0.0.1" }], {
  keySize: 2048,
  days: 1,
  algorithm: "sha256",
  extensions: [
    { name: "basicConstraints", cA: true },
    { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true },
    { name: "subjectAltName", altNames: [{ type: 7, ip: "127.0.0.1" }, { type: 2, value: "localhost" }] },
  ],
});
const certPath = join(runtime, "controller-ca.crt");
const keyPath = join(runtime, "controller.key");
await Promise.all([writeFile(certPath, certificate.cert), writeFile(keyPath, certificate.private)]);

const config = loadControllerConfig({
  HOST: "127.0.0.1", PORT: "18787", STACKPILOT_DATABASE_PATH: join(runtime, "stackpilot.sqlite3"),
  STACKPILOT_MASTER_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", STACKPILOT_COOKIE_SECURE: "1", STACKPILOT_PRODUCTION: "1",
  STACKPILOT_ALLOWED_ORIGINS: "https://127.0.0.1:18443", STACKPILOT_AGENT_HOST: "127.0.0.1", STACKPILOT_AGENT_PORT: "19443",
  STACKPILOT_AGENT_TLS_CERT_PATH: certPath, STACKPILOT_AGENT_TLS_KEY_PATH: keyPath,
  STACKPILOT_AGENT_STATE_PATH: join(runtime, "legacy.json"), STACKPILOT_TRUSTED_PROXIES: "127.0.0.1/32",
});
const database = openDatabase(config.databasePath);
const identity = new IdentityService(database, Buffer.alloc(32, 8));
if (!identity.hasAdministrator()) {
  await identity.createInitialAdministrator("e2e-admin", "E2E Administrator", "e2e administrator password");
  await identity.createUser("e2e-reader", "E2E Reader", "e2e reader password", ["audit-reader"], []);
}
const repository = new SqliteAgentControlRepository(database, identity.audit);
const platform = new FakePlatformAdapter();
const services = createControllerServices(platform, root, config, repository);
const options = { config, database, identity, agentRepository: repository, platform, services, repoRoot: root };
const management = createStackPilotServer(options);
const agent = createStackPilotAgentServer({ cert: certificate.cert, key: certificate.private }, options);
management.listen(18787, "127.0.0.1");
agent.listen(19443, "127.0.0.1");

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const webRoot = join(root, "apps", "web", "dist");
const proxy = createHttpsServer({ cert: certificate.cert, key: certificate.private, minVersion: "TLSv1.2" }, (request, response) => {
  response.setHeader("Strict-Transport-Security", "max-age=31536000");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
  if (request.url?.startsWith("/api/") || request.url === "/healthz" || request.url === "/readyz") {
    const upstream = httpRequest({ host: "127.0.0.1", port: 18787, path: request.url, method: request.method, headers: { ...request.headers, host: "127.0.0.1:18787", forwarded: `for=${request.socket.remoteAddress};proto=https;host=127.0.0.1:18443`, "x-forwarded-for": request.socket.remoteAddress ?? "", "x-forwarded-proto": "https" } }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on("error", () => { response.writeHead(502); response.end(); });
    request.pipe(upstream);
    return;
  }
  const requested = normalize(decodeURIComponent((request.url ?? "/").split("?")[0]));
  const candidate = join(webRoot, requested === "/" ? "index.html" : requested);
  const path = candidate.startsWith(webRoot) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(webRoot, "index.html");
  response.setHeader("Content-Type", mime[extname(path)] ?? "application/octet-stream");
  createReadStream(path).pipe(response);
});
proxy.listen(18443, "127.0.0.1", () => process.stdout.write("StackPilot E2E production fixture ready\n"));

const close = () => { proxy.close(); agent.close(); management.close(() => database.close()); };
process.once("SIGTERM", close);
process.once("SIGINT", close);

