import { render, screen, waitFor, within } from "@testing-library/react";
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

describe("firewall rule flow", () => {
  beforeEach(() => vi.mocked(fetchFirewallDenyRecords).mockReset().mockResolvedValue(denyPayload));
  it("uses the rule modal and drawer surfaces on the open-port view", async () => {
    const user = userEvent.setup();
    render(<FirewallPage page="firewall-open" notify={vi.fn()} />);

    const page = screen.getByRole("heading", { name: "开放端口" }).closest(".module-page");
    expect(page).toHaveClass("module-page-firewall-open");
    expect(screen.getAllByText("HTTPS 公网访问")).toHaveLength(2);
    expect(screen.queryByText("SSH 运维入口")).not.toBeInTheDocument();

    const createButton = screen.getByRole("button", { name: "新增规则" });
    await user.click(createButton);
    const createDialog = screen.getByRole("dialog", { name: "新增规则" });
    expect(createDialog.parentElement).toBe(document.body);
    expect(createDialog).toHaveClass("firewall-rule-modal");
    await user.click(within(createDialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "新增规则" })).not.toBeInTheDocument());

    const table = screen.getByRole("table");
    await user.click(within(table).getByRole("button", { name: "查看防火墙规则 HTTPS 公网访问 详情" }));
    const detailDrawer = screen.getByRole("dialog", { name: "规则详情" });
    expect(detailDrawer.parentElement).toBe(document.body);
    expect(detailDrawer).toHaveClass("firewall-rule-drawer");
    await user.click(within(detailDrawer).getByRole("button", { name: "关闭规则详情" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "规则详情" })).not.toBeInTheDocument());

    await user.click(within(table).getByRole("button", { name: "删除防火墙规则 HTTPS 公网访问" }));
    const deleteDialog = screen.getByRole("alertdialog", { name: "删除规则" });
    expect(deleteDialog.parentElement).toBe(document.body);
    expect(deleteDialog).toHaveClass("firewall-rule-delete-confirm");
  });

  it("keeps an invalid rule in the body-level modal and explains both errors", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    render(<FirewallPage page="firewall" notify={notify} />);

    const createButton = screen.getByRole("button", { name: "新增规则" });
    await user.click(createButton);
    const dialog = screen.getByRole("dialog", { name: "新增规则" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    await user.type(within(dialog).getByLabelText("端口"), "70000");
    await user.clear(within(dialog).getByLabelText("来源"));
    await user.type(within(dialog).getByLabelText("来源"), "999.1.1.1");
    await user.click(within(dialog).getByRole("button", { name: "保存规则" }));

    expect(await screen.findByText("端口必须是 1-65535 的整数")).toBeInTheDocument();
    expect(await screen.findByText("来源需填写 IPv4、CIDR 或 0.0.0.0/0")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("请修正防火墙规则表单", "danger");

    await user.click(within(dialog).getByRole("button", { name: "关闭新增规则" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "新增规则" })).not.toBeInTheDocument());
    await waitFor(() => expect(createButton).toHaveFocus());
  });

  it("opens rule details in a body-level modal drawer and restores focus", async () => {
    const user = userEvent.setup();
    render(<FirewallPage page="firewall" notify={vi.fn()} />);
    const table = screen.getByRole("table");
    const detailsButton = within(table).getByRole("button", { name: "查看防火墙规则 HTTPS 公网访问 详情" });

    await user.click(detailsButton);
    const drawer = screen.getByRole("dialog", { name: "规则详情" });

    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveAttribute("aria-modal", "true");
    await user.click(within(drawer).getByRole("button", { name: "关闭规则详情" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "规则详情" })).not.toBeInTheDocument());
    await waitFor(() => expect(detailsButton).toHaveFocus());
  });

  it("uses a body-level alert dialog for destructive confirmation", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    render(<FirewallPage page="firewall" notify={notify} />);
    const table = screen.getByRole("table");

    await user.click(within(table).getByRole("button", { name: "删除防火墙规则 HTTPS 公网访问" }));
    const dialog = screen.getByRole("alertdialog", { name: "删除规则" });

    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText(/0\.0\.0\.0\/0 -> 全部主机/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "确认删除" }));

    expect(notify).toHaveBeenCalledWith("HTTPS 公网访问 已删除", "warning");
    expect(screen.queryByRole("alertdialog", { name: "删除规则" })).not.toBeInTheDocument();
  });

  it("restores focus to the delete action after cancelling", async () => {
    const user = userEvent.setup();
    render(<FirewallPage page="firewall-open" notify={vi.fn()} />);
    const table = screen.getByRole("table");
    const deleteButton = within(table).getByRole("button", { name: "删除防火墙规则 HTTPS 公网访问" });

    await user.click(deleteButton);
    const dialog = screen.getByRole("alertdialog", { name: "删除规则" });
    await user.click(within(dialog).getByRole("button", { name: "取消" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: "删除规则" })).not.toBeInTheDocument());
    await waitFor(() => expect(deleteButton).toHaveFocus());
  });

  it("opens deny details as a body-level modal drawer", async () => {
    const user = userEvent.setup();
    render(<FirewallPage page="firewall-deny" notify={vi.fn()} />);

    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: "查看拦截记录 198.51.100.24 详情" }));

    const drawer = screen.getByRole("dialog", { name: "拦截详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("firewall-deny-drawer");
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(within(drawer).getByText("访问已拦截")).toBeInTheDocument();
    expect(within(drawer).getByText("Host firewall rejected this packet")).toBeInTheDocument();
    expect(within(drawer).getByText("production-firewall-node-with-a-long-hostname-01")).toBeInTheDocument();
  });

  it("shows backend freshness and never exposes fake mutation actions", async () => {
    render(<FirewallPage page="firewall-deny" notify={vi.fn()} />);
    expect(await screen.findByText(/数据来自 Agent 的只读内核防火墙日志/)).toBeInTheDocument();
    expect(screen.getByText(/采集时间 2026\/07\/15/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /放行|加入规则|导出/ })).not.toBeInTheDocument();
    expect(fetchFirewallDenyRecords).toHaveBeenCalledTimes(1);
  });

  it("isolates initial loading and errors from successful empty-state content", async () => {
    vi.mocked(fetchFirewallDenyRecords).mockRejectedValueOnce(new Error("权限不足"));
    render(<FirewallPage page="firewall-deny" notify={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("正在读取真实防火墙拦截记录");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("拦截记录", { selector: "span" })).not.toBeInTheDocument();

    expect(await screen.findByText("权限不足")).toBeInTheDocument();
    expect(screen.queryByText("没有匹配的真实拦截记录，系统将继续自动采集")).not.toBeInTheDocument();
    expect(screen.queryByText(/采集时间/)).not.toBeInTheDocument();
  });
});
