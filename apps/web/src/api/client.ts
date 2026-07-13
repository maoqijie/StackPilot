import { API_CLIENT_PREFIX } from "@stackpilot/contracts";
import type { ApiErrorCode, ApiErrorResponse, ApiNotice } from "@stackpilot/contracts";

let csrfToken = "";
export const setCsrfToken = (value: string) => { csrfToken = value; };
export const getCsrfToken = () => csrfToken;

export async function responseError(response: Response, suppressedSessionExpiredCodes: readonly ApiErrorCode[] = []): Promise<Error> {
  let message = `请求失败 (${response.status})`;
  let code: ApiErrorCode | undefined;
  try {
    const payload = await response.json() as Partial<ApiErrorResponse & ApiNotice>;
    message = payload.error ?? payload.message ?? message;
    code = payload.code;
  } catch {
    // Keep the HTTP status fallback when the response is not JSON.
  }
  if (response.status === 401 && !suppressedSessionExpiredCodes.includes(code!) && typeof window !== "undefined") window.dispatchEvent(new Event("stackpilot:session-expired"));
  return new Error(message);
}

type RequestJsonInit = RequestInit & { suppressSessionExpiredCodes?: readonly ApiErrorCode[] };

export async function requestJson<T>(path: string, options: RequestJsonInit = {}): Promise<T> {
  const { suppressSessionExpiredCodes = [], ...init } = options;
  const hasJsonBody = typeof init.body === "string";
  const response = await fetch(`${API_CLIENT_PREFIX}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
      ...((init.method && init.method !== "GET" && csrfToken) ? { "X-CSRF-Token": csrfToken } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await responseError(response, suppressSessionExpiredCodes);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
