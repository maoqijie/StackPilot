import { beforeEach, describe, expect, it } from "vitest";
import { cleanCurrentRouteForPage, collectUrlParams, readPageFromHash } from "../app/routing";
import { navItemsForPermissions, topbarSearchResults } from "../app/navigation";

describe("application routing", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("restores supported pages directly from the URL hash", () => {
    window.history.replaceState(null, "", "/#databases-slow");
    expect(readPageFromHash()).toBe("databases-slow");
    expect(window.location.hash).toBe("#databases-slow");
  });

  it("canonicalizes aliases and unknown pages", () => {
    window.history.replaceState(null, "", "/#hosts-all");
    expect(readPageFromHash()).toBe("hosts");
    expect(window.location.hash).toBe("#hosts");

    window.history.replaceState(null, "", "/#mobile");
    expect(readPageFromHash()).toBe("overview");
    expect(window.location.hash).toBe("#overview");

    window.history.replaceState(null, "", "/#not-a-page");
    expect(readPageFromHash()).toBe("overview");
    expect(window.location.hash).toBe("#overview");
  });

  it("merges legacy hash query state and cleans transient parameters", () => {
    window.history.replaceState(null, "", "/?dbFocus=orders#databases?quick=create-database");
    expect(collectUrlParams().get("quick")).toBe("create-database");
    expect(cleanCurrentRouteForPage("databases")).toBe("/?dbFocus=orders#databases");
  });

  it("hides schedule navigation without read permission", () => {
    expect(navItemsForPermissions([]).some((item) => item.key === "schedule")).toBe(false);
    expect(navItemsForPermissions(["schedules:read"]).some((item) => item.key === "schedule")).toBe(true);
  });

  it("shows the firewall mutation shortcut only with read and operate permissions", () => {
    expect(topbarSearchResults("新增防火墙规则", ["firewall:operate"])).toHaveLength(0);
    expect(topbarSearchResults("新增防火墙规则", ["firewall:read"])).toHaveLength(0);
    expect(topbarSearchResults("新增防火墙规则", ["firewall:read", "firewall:operate"])).toHaveLength(1);
  });
});
