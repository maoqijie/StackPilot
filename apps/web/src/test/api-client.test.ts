import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson, setCsrfToken } from "../api/client";
import { createCertificateRenewal } from "../api/sitesApi";

describe("requestJson", () => {
  afterEach(() => { setCsrfToken(""); vi.unstubAllGlobals(); });

  it("returns JSON and preserves request cancellation", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestJson<{ ok: boolean }>("/health", { signal: controller.signal })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.objectContaining({ signal: controller.signal, credentials: "include" }));
  });

  it("surfaces safe API error messages and falls back to status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })).mockResolvedValueOnce(new Response("gateway failed", { status: 502 })));

    await expect(requestJson("/private")).rejects.toThrow("未授权");
    await expect(requestJson("/unavailable")).rejects.toThrow("请求失败 (502)");
  });

  it("forwards AbortError without replacing it", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));
    await expect(requestJson("/slow", { signal: new AbortController().signal })).rejects.toBe(abortError);
  });

  it("sends CSRF and one-time reauth proof for certificate renewal", async () => {
    setCsrfToken("csrf-token-held-only-in-memory-123456");
    const response = {
      batchId: "9e83bbd0-9399-46ed-80a4-a36752cbb86b", status: "queued",
      createdAt: "2026-07-13T12:30:00.000Z", updatedAt: "2026-07-13T12:30:00.000Z",
      operations: [{ siteIds: ["site-api-example"], nodeId: "node-local", certificateId: "cert_api_example", taskId: "751392f5-6bb8-4f39-a43a-8351081f13d5", status: "queued", message: null, updatedAt: "2026-07-13T12:30:00.000Z" }],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 202, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await createCertificateRenewal({ siteIds: ["site-api-example"], idempotencyKey: "cert-renewal-request-1" }, "reauth-proof-held-only-in-memory-123456");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({ "X-CSRF-Token": "csrf-token-held-only-in-memory-123456", "X-Reauth-Proof": "reauth-proof-held-only-in-memory-123456" });
  });

  it("can keep a credential-check 401 inside the current dialog", async () => {
    const expired = vi.fn();
    window.addEventListener("stackpilot:session-expired", expired);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "REAUTHENTICATION_FAILED", error: "重新认证失败" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));
    await expect(requestJson("/auth/reauthenticate", { suppressSessionExpiredCodes: ["REAUTHENTICATION_FAILED"] })).rejects.toThrow("重新认证失败");
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener("stackpilot:session-expired", expired);
  });

  it("still expires the session when reauthentication reports a missing login", async () => {
    const expired = vi.fn();
    window.addEventListener("stackpilot:session-expired", expired);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "UNAUTHORIZED", error: "需要登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));
    await expect(requestJson("/auth/reauthenticate", { suppressSessionExpiredCodes: ["REAUTHENTICATION_FAILED"] })).rejects.toThrow("需要登录");
    expect(expired).toHaveBeenCalledOnce();
    window.removeEventListener("stackpilot:session-expired", expired);
  });

  it("does not force a JSON content type for binary request bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["content"], "index.html", { type: "text/html" });
    await requestJson("/files/upload", { method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/files/upload", expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/octet-stream" }) }));
  });
});
