import assert from "node:assert/strict";
import test from "node:test";
import { assertAgentPrivilegeBoundary } from "../../apps/agent/dist/security/privilege.js";

test("Agent refuses root and remains a dedicated unprivileged process", () => {
  assert.throws(() => assertAgentPrivilegeBoundary(false, () => 0), /refuses to run as root/);
  assert.doesNotThrow(() => assertAgentPrivilegeBoundary(false, () => 1000));
  assert.doesNotThrow(() => assertAgentPrivilegeBoundary(true, () => 0));
});
