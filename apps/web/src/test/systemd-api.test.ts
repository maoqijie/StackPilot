import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSystemdJournal, fetchSystemdUnits, mutateSystemdUnit } from "../api/systemdApi";
import { setCsrfToken } from "../api/client";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const unit = { id: "nginx.service", name: "nginx.service", description: "Nginx", host: "prod-host", state: "active", activeState: "active", subState: "running", restarts: 1, memoryBytes: 1024, stateChangedAt: "2026-07-15T00:00:00.000Z", availableActions: ["start", "stop", "restart"] };

describe("systemd API", () => {
  beforeEach(() => { fetchMock.mockReset(); setCsrfToken("csrf-token-held-in-memory-1234567890"); });

  it("parses inventory and journal payloads", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ units: [unit], host: "prod-host", collectedAt: "2026-07-15T00:00:00.000Z", warnings: [] }), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ unit: "nginx.service", entries: [{ timestamp: "2026-07-15T00:00:00.000Z", message: "started" }], collectedAt: "2026-07-15T00:00:01.000Z", truncated: false }), { status: 200 }));
    expect((await fetchSystemdUnits()).units[0]?.host).toBe("prod-host");
    expect((await fetchSystemdJournal("nginx.service")).entries[0]?.message).toBe("started");
  });

  it("sends CSRF and one-time reauthentication proof for mutations", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ unit, collectedAt: "2026-07-15T00:00:01.000Z", message: "nginx.service 已重启", tone: "success" }), { status: 200 }));
    const idempotencyKey = "11111111-1111-4111-8111-111111111111";
    await mutateSystemdUnit("nginx.service", "restart", "proof-held-in-memory-1234567890123456", idempotencyKey);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(fetchMock).toHaveBeenCalledWith("/api/systemd/services/nginx.service/restart", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-token-held-in-memory-1234567890", "X-Reauth-Proof": "proof-held-in-memory-1234567890123456" }) }));
    expect(JSON.parse(String(init.body))).toEqual({ idempotencyKey });
  });
});
