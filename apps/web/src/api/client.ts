import { API_CLIENT_PREFIX } from "@stackpilot/contracts";
import type { ApiErrorResponse, ApiNotice } from "@stackpilot/contracts";

let csrfToken = "";
export const setCsrfToken = (value: string) => { csrfToken = value; };
export const getCsrfToken = () => csrfToken;

export async function responseError(response: Response): Promise<Error> {
  let message = `请求失败 (${response.status})`;
  try {
    const payload = await response.json() as Partial<ApiErrorResponse & ApiNotice>;
    message = payload.error ?? payload.message ?? message;
  } catch {
    // Keep the HTTP status fallback when the response is not JSON.
  }
  if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("stackpilot:session-expired"));
  return new Error(message);
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_CLIENT_PREFIX}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...((init.method && init.method !== "GET" && csrfToken) ? { "X-CSRF-Token": csrfToken } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await responseError(response);
  }

  return response.json() as Promise<T>;
}
