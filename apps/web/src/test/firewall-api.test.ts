import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFirewallRule, deleteFirewallRule, fetchFirewall, fetchFirewallDenyRecords, fetchFirewallOpenPorts } from "../api/firewallApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const payload = { collectedAt: "2026-07-15T06:00:00.000Z", collectionStatus: "complete", backend: "ss", warnings: [], ports: [{ id: "port_aaaaaaaaaaaaaaaaaaaaaaaa", protocol: "TCP", port: 443, address: "0.0.0.0", source: "0.0.0.0/0", exposure: "public", host: "prod-controller" }] };
const ufwPayload = { collectedAt: "2026-07-15T14:00:00.000Z", collectionStatus: "complete", backend: "ufw", backendStatus: "inactive", host: "host-a", warnings: [], rules: [] };
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
    await expect(fetchFirewall()).resolves.toEqual(ufwPayload);
    expect(fetchMock).toHaveBeenCalledWith("/api/firewall", expect.objectContaining({ credentials: "include" }));
  });

  it("sends reauthentication proof for mutations", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...ufwPayload, message: "done", tone: "success" }), { status: 200 }));
    await createFirewallRule({ name: "HTTPS", port: 443, protocol: "TCP", source: "0.0.0.0/0", idempotencyKey: crypto.randomUUID() }, "proof");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/firewall/rules", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-Reauth-Proof": "proof" }) }));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...ufwPayload, message: "done", tone: "warning" }), { status: 200 }));
    const id = `fw_${"a".repeat(64)}`;
    await deleteFirewallRule(id, crypto.randomUUID(), "proof");
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/firewall/${id}`, expect.objectContaining({ method: "DELETE" }));
  });
});
