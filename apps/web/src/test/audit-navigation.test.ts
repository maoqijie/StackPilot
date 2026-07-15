import { describe, expect, it } from "vitest";
import { navItemsForPermissions, topbarSearchResults } from "../app/navigation";

describe("audit export navigation permissions", () => {
  it("hides export navigation and quick actions from audit readers", () => {
    const audit = navItemsForPermissions(["audit:read"]).find((item) => item.key === "audit");
    expect(audit?.children.some((child) => child.id === "audit-export")).toBe(false);
    expect(topbarSearchResults("导出审计", ["audit:read"])).toEqual([]);
  });

  it("shows export navigation and quick actions with audit:export", () => {
    const audit = navItemsForPermissions(["audit:read", "audit:export"]).find((item) => item.key === "audit");
    expect(audit?.children.some((child) => child.id === "audit-export")).toBe(true);
    expect(topbarSearchResults("导出审计", ["audit:read", "audit:export"]).some((item) => item.id === "quick-audit-export")).toBe(true);
    expect(topbarSearchResults("导出审计", ["audit:export"])).toEqual([]);
  });
});
