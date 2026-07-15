import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FirewallDenyRecordsPayload } from "@stackpilot/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFirewallDenyRecords } from "../api/firewallApi";
import { FirewallPage } from "../pages/FirewallPage";

vi.mock("../api/firewallApi", () => ({ fetchFirewallDenyRecords: vi.fn() }));
const collectedAt = "2026-07-15T01:02:03.000Z";
const denyPayload: FirewallDenyRecordsPayload = {
  collectedAt,
  collectionStatus: "complete",
  warnings: [],
  records: [{
    id: "11111111-1111-4111-8111-111111111111:fw_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    nodeId: "11111111-1111-4111-8111-111111111111",
    nodeName: "production-firewall-node-with-a-long-hostname-01",
    sourceCollectedAt: collectedAt,
    occurredAt: "2026-07-15T01:01:58.000Z",
    sourceAddress: "198.51.100.24",
    destinationAddress: "192.0.2.10",
    destinationPort: 22,
    protocol: "TCP",
    interfaceName: "eth0",
    rule: "UFW BLOCK",
    reason: "Host firewall rejected this packet",
  }],
};

describe("firewall Agent deny page", () => {
  beforeEach(() => vi.mocked(fetchFirewallDenyRecords).mockReset().mockResolvedValue(denyPayload));

  it("opens a complete body-level detail drawer", async () => {
    const user = userEvent.setup();
    render(<FirewallPage page="firewall-deny" notify={vi.fn()} permissions={["firewall:read"]} />);
    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: "查看拦截记录 198.51.100.24 详情" }));
    const drawer = screen.getByRole("dialog", { name: "拦截详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("firewall-deny-drawer");
    expect(within(drawer).getByText("Host firewall rejected this packet")).toBeInTheDocument();
    expect(within(drawer).getByText("production-firewall-node-with-a-long-hostname-01")).toBeInTheDocument();
  });

  it("shows backend freshness and never exposes fake mutation actions", async () => {
    render(<FirewallPage page="firewall-deny" notify={vi.fn()} permissions={["firewall:read"]} />);
    expect(await screen.findByText(/数据来自 Agent 的只读内核防火墙日志/)).toBeInTheDocument();
    expect(screen.getByText(/采集时间 2026\/07\/15/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /放行|加入规则|导出/ })).not.toBeInTheDocument();
    expect(fetchFirewallDenyRecords).toHaveBeenCalledTimes(1);
  });

  it("paginates large real result sets", async () => {
    const user = userEvent.setup();
    const records = Array.from({ length: 51 }, (_, index) => ({
      ...denyPayload.records[0]!,
      id: `11111111-1111-4111-8111-111111111111:fw_${index.toString(16).padStart(64, "0")}`,
      sourceAddress: `198.51.100.${index + 1}`,
    }));
    vi.mocked(fetchFirewallDenyRecords).mockResolvedValueOnce({ ...denyPayload, records });
    render(<FirewallPage page="firewall-deny" notify={vi.fn()} permissions={["firewall:read"]} />);
    expect(await screen.findByText("第 1 / 2 页 · 共 51 条")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(within(screen.getByRole("table")).getByText("198.51.100.51")).toBeInTheDocument();
  });

  it("isolates initial errors from successful empty-state content", async () => {
    vi.mocked(fetchFirewallDenyRecords).mockRejectedValueOnce(new Error("权限不足"));
    render(<FirewallPage page="firewall-deny" notify={vi.fn()} permissions={["firewall:read"]} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取真实防火墙拦截记录");
    expect(await screen.findByText("权限不足")).toBeInTheDocument();
    expect(screen.queryByText("没有匹配的真实拦截记录，系统将继续自动采集")).not.toBeInTheDocument();
    expect(screen.queryByText(/采集时间/)).not.toBeInTheDocument();
  });
});
