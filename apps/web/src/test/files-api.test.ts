import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFiles } from "../api/filesApi";

describe("files API", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("encodes virtual paths and validates the contract", async () => {
    const payload = { root: "/tmp/root", path: "/nested dir", entries: [], collectedAt: "2026-07-14T00:00:00.000Z" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    await expect(fetchFiles("/nested dir")).resolves.toEqual(payload); expect(fetchMock).toHaveBeenCalledWith("/api/files?path=%2Fnested%20dir", expect.any(Object));
  });
});
