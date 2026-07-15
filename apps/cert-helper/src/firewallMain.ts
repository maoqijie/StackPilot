import { handleFirewallRequest } from "./firewallProtocol.js";

const MAX_REQUEST_BYTES = 4 * 1024;
export async function serveFirewall(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout) {
  let request = "";
  for await (const chunk of input) {
    request += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (Buffer.byteLength(request) > MAX_REQUEST_BYTES) { output.write(`${JSON.stringify({ ok: false, operation: "firewall-list", errorCode: "REQUEST_TOO_LARGE", message: "Request exceeded helper limit" })}\n`); return; }
    if (request.includes("\n")) break;
  }
  const [line, ...remaining] = request.split(/\r?\n/);
  const response = remaining.some((item) => item.trim().length > 0) || !line
    ? { ok: false, operation: "firewall-list", errorCode: "INVALID_REQUEST", message: "Exactly one JSON request is required" }
    : await handleFirewallRequest(line);
  output.write(`${JSON.stringify(response)}\n`);
}

if (process.argv[1]?.endsWith("/firewallMain.js")) serveFirewall().catch(() => { process.stderr.write("Firewall helper failed; inspect journal logs.\n"); process.exitCode = 1; });
