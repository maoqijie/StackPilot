import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreSession } from "../api/authApi";

const user = { id: "11111111-1111-4111-8111-111111111111", username: "operator", displayName: "Operator", permissions: [], nodeScope: "all" as const };

describe("session restoration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shares concurrent CSRF-rotating session requests", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    vi.stubGlobal("fetch", fetch);

    const first = restoreSession();
    const second = restoreSession();
    expect(fetch).toHaveBeenCalledTimes(1);
    resolveResponse?.(new Response(JSON.stringify({ authenticated: true, user, csrfToken: "csrf-token-with-more-than-thirty-two-characters" }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(Promise.all([first, second])).resolves.toEqual([user, user]);
  });
});
