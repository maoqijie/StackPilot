import type { FirewallOpenPortsPayload } from "@stackpilot/contracts";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFirewallOpenPorts } from "../api/firewallApi";
import { FirewallPage } from "../pages/FirewallPage";

vi.mock("../api/firewallApi", () => ({ fetchFirewallOpenPorts: vi.fn() }));
const time = "2026-07-15T06:00:00.000Z";
const payload: FirewallOpenPortsPayload = { collectedAt: time, collectionStatus: "complete", backend: "ss", warnings: [], ports: [
  { id: "port_aaaaaaaaaaaaaaaaaaaaaaaa", protocol: "TCP", port: 443, address: "0.0.0.0", source: "0.0.0.0/0", exposure: "public", host: "prod-controller" },
  { id: "port_bbbbbbbbbbbbbbbbbbbbbbbb", protocol: "TCP", port: 18787, address: "127.0.0.1", source: "仅本机", exposure: "loopback", host: "prod-controller" },
] };

describe("firewall open-port page", () => {
  beforeEach(() => vi.mocked(fetchFirewallOpenPorts).mockReset().mockResolvedValue(payload));
  afterEach(() => vi.useRealTimers());

  it("renders only real backend listeners and collection freshness", async () => {
    render(<FirewallPage page="firewall-open" notify={vi.fn()} permissions={["firewall:read"]} />);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("0.0.0.0:443")).toBeInTheDocument();
    expect(within(table).getByText("127.0.0.1:18787")).toBeInTheDocument();
    expect(screen.getByText(/监听不等于上游网络已经放行/)).toBeInTheDocument();
    expect(screen.queryByText("HTTPS 公网访问")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /新增规则|刷新|重新采集/ })).not.toBeInTheDocument();
  });

  it("keeps filters while silently polling every ten seconds", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchFirewallOpenPorts).mockResolvedValueOnce({ ...payload, collectedAt: "2026-07-15T06:00:10.000Z", ports: [payload.ports[0]!] });
    render(<FirewallPage page="firewall-open" notify={vi.fn()} permissions={["firewall:read"]} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const search = screen.getByPlaceholderText("搜索端口、地址或主机");
    fireEvent.change(search, { target: { value: "443" } });
    await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchFirewallOpenPorts).toHaveBeenCalledTimes(2);
    expect(search).toHaveValue("443");
    expect(screen.getAllByText("0.0.0.0:443").length).toBeGreaterThan(0);
  });

  it("shows an explicit permission boundary", () => {
    render(<FirewallPage page="firewall-open" notify={vi.fn()} permissions={[]} />);
    expect(screen.getByText(/没有 firewall:read 权限/)).toBeInTheDocument();
    expect(fetchFirewallOpenPorts).not.toHaveBeenCalled();
  });
});
