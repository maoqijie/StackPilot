import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSystemdServices } from "../api/systemdApi";

const payload = { collectedAt: "2026-07-15T01:02:03.000Z", collectionStatus: "complete", warnings: [], services: [] };

describe("systemd API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the authenticated read-only endpoint and forwards cancellation", async () => {
    const controller = new AbortController(); const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock); await expect(fetchSystemdServices(controller.signal)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/systemd/services", expect.objectContaining({ signal: controller.signal, credentials: "include" }));
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("method");
  });

  it("rejects malformed backend data instead of rendering fixtures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...payload, collectionStatus: "invented" }), { status: 200 })));
    await expect(fetchSystemdServices()).rejects.toThrow();
  });
});
