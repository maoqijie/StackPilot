import { describe, expect, it } from "vitest";
import { isValidFirewallSource, isValidIpv4Address } from "../features/firewall/validation";
import { isLikelyCronExpression } from "../features/schedule/model";

describe("critical form validation", () => {
  it("accepts IPv4/CIDR input and rejects invalid firewall sources", () => {
    expect(isValidFirewallSource("10.0.0.0/24")).toBe(true);
    expect(isValidFirewallSource("10.0.0.999/24")).toBe(false);
    expect(isValidFirewallSource("10.0.0.1/33")).toBe(false);
    expect(isValidIpv4Address("127.0.0.1")).toBe(true);
    expect(isValidIpv4Address("127.0.0")).toBe(false);
  });

  it("validates schedule expressions before submission", () => {
    expect(isLikelyCronExpression("0 2 * * *")).toBe(true);
    expect(isLikelyCronExpression("0 2 * *")).toBe(false);
  });
});
