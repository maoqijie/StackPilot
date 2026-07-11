import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_API_PROXY_TARGET,
  DEFAULT_CONTROLLER_HOST,
  DEFAULT_CONTROLLER_PORT,
  DEFAULT_WEB_HOST,
  DEFAULT_WEB_PORT,
} from "@stackpilot/config";

test("shared development defaults remain loopback-only", () => {
  assert.equal(DEFAULT_CONTROLLER_HOST, "127.0.0.1");
  assert.equal(DEFAULT_CONTROLLER_PORT, 8787);
  assert.equal(DEFAULT_WEB_HOST, "127.0.0.1");
  assert.equal(DEFAULT_WEB_PORT, 5173);
  assert.equal(DEFAULT_API_PROXY_TARGET, "http://127.0.0.1:8787");
  assert.ok(DEFAULT_ALLOWED_ORIGINS.every((origin) => !origin.includes("*")));
});
