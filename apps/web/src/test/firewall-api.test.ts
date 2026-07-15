import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFirewallDenyRecords, fetchFirewallOpenPorts } from "../api/firewallApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const denyPayload = { collectedAt: "2026-07-15T01:02:03.000Z", collectionStatus: "complete", warnings: [], records: [] };
const openPortsPayload = { collectedAt: "2026-07-15T06:00:00.000Z", collectionStatus: "complete", backend: "ss", warnings: [], ports: [{ id: "port_aaaaaaaaaaaaaaaaaaaaaaaa", protocol: "TCP", port: 443, address: "0.0.0.0", source: "0.0.0.0/0", exposure: "public", host: "prod-controller" }] };

beforeEach(() => fetchMock.mockReset());

describe("firewall deny API", () => {
  it("parses real records and forwards request cancellation", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(denyPayload), { status: 200 }));
    await expect(fetchFirewallDenyRecords(controller.signal)).resolves.toEqual(denyPayload);
    expect(fetchMock).toHaveBeenCalledWith("/api/firewall/deny-records", expect.objectContaining({ signal: controller.signal, credentials: "include" }));
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("method");
  });

  it("rejects malformed data instead of rendering fixtures", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...denyPayload, collectionStatus: "invented" }), { status: 200 }));
    await expect(fetchFirewallDenyRecords()).rejects.toThrow();
  });
});

describe("firewall open-port API", () => {
  it("uses a read-only request and forwards cancellation", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(openPortsPayload), { status: 200 }));
    await expect(fetchFirewallOpenPorts(controller.signal)).resolves.toEqual(openPortsPayload);
    expect(fetchMock).toHaveBeenCalledWith("/api/firewall/open-ports", expect.objectContaining({ credentials: "include", signal: controller.signal }));
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("method");
  });

  it("rejects malformed backend data instead of rendering fixtures", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...openPortsPayload, ports: [{ ...openPortsPayload.ports[0], port: 70000 }] }), { status: 200 }));
    await expect(fetchFirewallOpenPorts()).rejects.toThrow();
  });
});
