import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { isIP } from "node:net";
import { FirewallOpenPortsPayloadSchema, type FirewallExposure, type FirewallOpenPort, type FirewallOpenPortsPayload } from "@stackpilot/contracts";
import { probeListeningSockets, type SocketProbe } from "../../platform/firewallOpenPortProbe.js";


function splitEndpoint(value: string): { address: string; port: number } | null {
  const closingBracket = value.lastIndexOf("]:");
  const separator = closingBracket >= 0 ? closingBracket + 1 : value.lastIndexOf(":");
  if (separator < 0) return null;
  const port = Number(value.slice(separator + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  const rawAddress = value.slice(0, separator);
  const address = rawAddress.startsWith("[") && rawAddress.endsWith("]") ? rawAddress.slice(1, -1) : rawAddress;
  return address ? { address, port } : null;
}

function addressMeta(address: string): { exposure: FirewallExposure; source: string } {
  const normalized = address.split("%", 1)[0] ?? address;
  if (["0.0.0.0", "*"].includes(normalized)) return { exposure: "public", source: "0.0.0.0/0" };
  if (["::", "::0"].includes(normalized)) return { exposure: "public", source: "::/0" };
  if (/^127\./.test(normalized) || normalized === "::1") return { exposure: "loopback", source: "仅本机" };
  if (isIP(normalized) === 4 && (/^10\./.test(normalized) || /^192\.168\./.test(normalized) || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized))) return { exposure: "private", source: "私有网络" };
  if (isIP(normalized) === 6 && (/^f[cd]/i.test(normalized) || /^fe[89ab]/i.test(normalized))) return { exposure: "private", source: "私有网络" };
  return { exposure: "specific", source: "指定地址" };
}

export function parseListeningSockets(output: string, host = hostname()): FirewallOpenPort[] {
  const records = output.split(/\r?\n/).flatMap((line) => {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 5) return [];
    const protocol = fields[0]?.toLowerCase() === "tcp" ? "TCP" as const : fields[0]?.toLowerCase() === "udp" ? "UDP" as const : null;
    const endpoint = splitEndpoint(fields[4] ?? "");
    if (!protocol || !endpoint) return [];
    const meta = addressMeta(endpoint.address);
    const digest = createHash("sha256").update(`${protocol}\0${endpoint.address}\0${endpoint.port}`).digest("hex").slice(0, 24);
    return [{ id: `port_${digest}`, protocol, port: endpoint.port, address: endpoint.address, source: meta.source, exposure: meta.exposure, host }];
  });
  return [...new Map(records.map((record) => [record.id, record])).values()]
    .sort((left, right) => left.port - right.port || left.protocol.localeCompare(right.protocol) || left.address.localeCompare(right.address));
}

export class FirewallOpenPortService {
  constructor(private readonly probe: SocketProbe = probeListeningSockets, private readonly host = hostname()) {}
  async list(): Promise<FirewallOpenPortsPayload> {
    const collectedAt = new Date().toISOString();
    try {
      return FirewallOpenPortsPayloadSchema.parse({ collectedAt, collectionStatus: "complete", backend: "ss", warnings: [], ports: parseListeningSockets(await this.probe(), this.host) });
    } catch {
      return FirewallOpenPortsPayloadSchema.parse({ collectedAt, collectionStatus: "unavailable", backend: "ss", warnings: ["主机监听端口采集暂不可用"], ports: [] });
    }
  }
}
