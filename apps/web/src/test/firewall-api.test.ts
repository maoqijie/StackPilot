import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFirewallRule, deleteFirewallRule, fetchFirewallDenyRecords, fetchFirewallOpenPorts, fetchFirewallRules } from "../api/firewallApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const payload = { collectedAt: "2026-07-15T06:00:00.000Z", collectionStatus: "complete", backend: "ss", warnings: [], ports: [{ id: "port_aaaaaaaaaaaaaaaaaaaaaaaa", protocol: "TCP", port: 443, address: "0.0.0.0", source: "0.0.0.0/0", exposure: "public", host: "prod-controller" }] };
const ufwPayload = { engine: "ufw", host: "host-a", active: false, collectedAt: "2026-07-15T14:00:00.000Z", collectionStatus: "complete", warnings: ["UFW 当前未启用；规则写操作已禁用"], rules: [] };
const denyPayload = { collectedAt: "2026-07-15T01:02:03.000Z", collectionStatus: "complete", warnings: [], records: [] };

describe("firewall open-port API", () => {
  beforeEach(() => fetchMock.mockReset());

  it("uses a read-only request and forwards cancellation", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(fetchFirewallOpenPorts(controller.signal)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/firewall/open-ports", expect.objectContaining({ credentials: "include", signal: controller.signal }));
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("method");
  });

  it("rejects malformed backend data instead of rendering fixtures", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, ports: [{ ...payload.ports[0], port: 70000 }] }), { status: 200 }));
    await expect(fetchFirewallOpenPorts()).rejects.toThrow();
  });
});

describe("firewall deny API", () => {
  beforeEach(() => fetchMock.mockReset());

  it("loads the Agent-backed deny payload as a read-only request", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(denyPayload), { status: 200 }));
    await expect(fetchFirewallDenyRecords()).resolves.toEqual(denyPayload);
    expect(fetchMock).toHaveBeenCalledWith("/api/firewall/deny-records", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("method");
  });
});

describe("firewall UFW API", () => {
  beforeEach(() => fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify(ufwPayload), { status: 200 })));

  it("parses a backend-owned payload", async () => {
    await expect(fetchFirewallRules()).resolves.toEqual(ufwPayload);
    expect(fetchMock).toHaveBeenCalledWith("/api/firewall/rules", expect.objectContaining({ credentials: "include" }));
  });

  it("sends reauthentication proof for mutations", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...ufwPayload, message: "done", tone: "success" }), { status: 200 }));
    await createFirewallRule({ name: "HTTPS", port: 443, protocol: "tcp", source: "0.0.0.0/0", idempotencyKey: crypto.randomUUID() }, "proof");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/firewall/rules", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-Reauth-Proof": "proof" }) }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...ufwPayload, message: "done", tone: "warning" }), { status: 200 }));
    const id = "firewall:11111111-1111-4111-8111-111111111111:ipv4";
    const input = { version: "a".repeat(64), idempotencyKey: crypto.randomUUID() };
    await deleteFirewallRule(id, input, "proof");
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/firewall/rules/${encodeURIComponent(id)}`, expect.objectContaining({ method: "DELETE", body: JSON.stringify(input) }));
  });
});
