import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFirewallOpenPorts } from "../api/firewallApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const payload = { collectedAt: "2026-07-15T06:00:00.000Z", collectionStatus: "complete", backend: "ss", warnings: [], ports: [{ id: "port_aaaaaaaaaaaaaaaaaaaaaaaa", protocol: "TCP", port: 443, address: "0.0.0.0", source: "0.0.0.0/0", exposure: "public", host: "prod-controller" }] };

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
