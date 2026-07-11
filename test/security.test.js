import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createStackPilotServer } from "../server/index.js";

const validToken = "test-token-that-is-not-used-outside-tests";
const allowedOrigin = "http://127.0.0.1:5173";

async function withServer(env, callback) {
  const server = createStackPilotServer({ env });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await callback(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function jsonResponse(response) {
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test("read-only endpoints remain available without authentication", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  });
});

test("POST, PATCH and DELETE reject missing or invalid bearer tokens", async () => {
  await withServer({ STACKPILOT_API_TOKEN: validToken }, async (baseUrl) => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const missing = await jsonResponse(await fetch(`${baseUrl}/api/overview/not-a-route`, { method }));
      assert.equal(missing.status, 401);
      assert.equal(missing.headers.get("www-authenticate"), "Bearer");

      const forgedProxyHeaders = await jsonResponse(await fetch(`${baseUrl}/api/overview/not-a-route`, {
        method,
        headers: {
          Authorization: "Bearer wrong-token",
          "X-Forwarded-For": "127.0.0.1",
          "X-Forwarded-Host": "localhost",
          "X-Forwarded-Proto": "https",
        },
      }));
      assert.equal(forgedProxyHeaders.status, 401);
      assert.doesNotMatch(JSON.stringify(forgedProxyHeaders.body), /wrong-token|test-token/);
    }
  });
});

test("writes fail closed when the API token is not configured", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await jsonResponse(await fetch(`${baseUrl}/api/overview/not-a-route`, { method: "POST" }));
    assert.equal(response.status, 503);
    assert.equal(response.body.error, "写操作认证未配置");
  });
});

test("CORS permits exact allowlisted origins and rejects other origins", async () => {
  await withServer({ STACKPILOT_ALLOWED_ORIGINS: allowedOrigin }, async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/healthz`, { headers: { Origin: allowedOrigin } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.equal(allowed.headers.get("vary"), "Origin");

    const denied = await jsonResponse(await fetch(`${baseUrl}/healthz`, {
      headers: { Origin: "https://attacker.example" },
    }));
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    assert.equal(denied.body.error, "请求来源不在允许列表中");
  });
});

test("CORS preflight advertises Authorization only for allowlisted origins", async () => {
  await withServer({ STACKPILOT_ALLOWED_ORIGINS: allowedOrigin }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/overview`, {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
    assert.match(response.headers.get("access-control-allow-headers"), /Authorization/);
  });
});

test("all crontab mutations and immediate execution stay disabled by default", async () => {
  await withServer({ STACKPILOT_API_TOKEN: validToken }, async (baseUrl) => {
    const cases = [
      { method: "POST", path: "", body: { name: "blocked", cron: "0 4 * * *", command: "true" } },
      { method: "PATCH", path: "/example", body: { enabled: false } },
      { method: "DELETE", path: "/example" },
      { method: "PATCH", path: "/example", body: { action: "run" } },
    ];

    for (const requestCase of cases) {
      const response = await jsonResponse(await fetch(`${baseUrl}/api/overview/current-user-crontab${requestCase.path}`, {
        method: requestCase.method,
        headers: {
          Authorization: `Bearer ${validToken}`,
          ...(requestCase.body ? { "Content-Type": "application/json" } : {}),
        },
        body: requestCase.body ? JSON.stringify(requestCase.body) : undefined,
      }));
      assert.equal(response.status, 403);
      assert.equal(response.body.error, "crontab 写入与立即执行能力未开启");
    }
  });
});

test("oversized JSON bodies return 413 without echoing request content", async () => {
  await withServer({
    STACKPILOT_API_TOKEN: validToken,
    STACKPILOT_JSON_BODY_LIMIT_BYTES: "32",
  }, async (baseUrl) => {
    const secretMarker = "must-not-appear-in-the-response";
    const response = await jsonResponse(await fetch(`${baseUrl}/api/overview/risks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${validToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value: secretMarker.repeat(4) }),
    }));
    assert.equal(response.status, 413);
    assert.equal(response.body.error, "JSON 请求体过大");
    assert.doesNotMatch(JSON.stringify(response.body), new RegExp(secretMarker));
  });
});

test("wildcard CORS configuration is rejected at startup", () => {
  assert.throws(
    () => createStackPilotServer({ env: { STACKPILOT_ALLOWED_ORIGINS: "*" } }),
    /不允许使用通配符/,
  );
});
