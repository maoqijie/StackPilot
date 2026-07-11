import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "../api/client";

describe("requestJson", () => {
  afterEach(() => vi.unstubAllGlobals());

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
});
