import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFirewallDenyRecords } from "../api/firewallApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const payload = { collectedAt: "2026-07-15T01:02:03.000Z", collectionStatus: "complete", warnings: [], records: [] };

describe("firewall deny API", () => {
  beforeEach(() => fetchMock.mockReset());

  it("parses real records and forwards request cancellation", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(fetchFirewallDenyRecords(controller.signal)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/firewall/deny-records", expect.objectContaining({ signal: controller.signal, credentials: "include" }));
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("method");
  });

  it("rejects malformed data instead of rendering fixtures", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, collectionStatus: "invented" }), { status: 200 }));
    await expect(fetchFirewallDenyRecords()).rejects.toThrow();
  });
});
