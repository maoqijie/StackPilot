import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirewallPayload } from "@stackpilot/contracts";
import { FirewallPage } from "../pages/FirewallPage";
import { createFirewallRule, deleteFirewallRule, fetchFirewall } from "../api/firewallApi";
import { reauthenticate } from "../api/identityApi";

vi.mock("../api/firewallApi", () => ({ fetchFirewall: vi.fn(), createFirewallRule: vi.fn(), deleteFirewallRule: vi.fn() }));
vi.mock("../api/identityApi", () => ({ reauthenticate: vi.fn() }));

const collectedAt = "2026-07-15T14:00:00.000Z";
const managedId = `fw_${"a".repeat(64)}`, nativeId = `fw_${"b".repeat(64)}`;
const payload: FirewallPayload = {
  collectedAt, collectionStatus: "complete", backend: "ufw", backendStatus: "active", host: "host-a", warnings: [],
  rules: [
    { id: managedId, name: "HTTPS 入口", port: "443", protocol: "TCP", source: "0.0.0.0/0", action: "ALLOW", direction: "IN", target: "host-a", ipv6: false, managed: true },
    { id: nativeId, name: "SSH 系统规则", port: "2222", protocol: "TCP", source: "0.0.0.0/0", action: "ALLOW", direction: "IN", target: "host-a", ipv6: false, managed: false },
  ],
};

describe("firewall real backend flow", () => {
  beforeEach(() => {
    vi.mocked(fetchFirewall).mockReset().mockResolvedValue(payload);
    vi.mocked(reauthenticate).mockReset().mockResolvedValue({ proof: "proof-value-with-more-than-thirty-two-characters", expiresAt: collectedAt });
    vi.mocked(createFirewallRule).mockReset().mockResolvedValue({ ...payload, message: "规则已新增", tone: "success" });
    vi.mocked(deleteFirewallRule).mockReset().mockResolvedValue({ ...payload, rules: payload.rules.slice(1), message: "规则已删除", tone: "warning" });
  });

  it("loads real UFW rules and distinguishes managed from native rules", async () => {
    render(<FirewallPage page="firewall" notify={vi.fn()} permissions={["firewall:read", "firewall:operate"]} />);
    expect((await screen.findAllByText("HTTPS 入口")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("SSH 系统规则").length).toBeGreaterThan(0);
    expect(screen.getByText(/host-a · 后端采集于/)).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByRole("button", { name: "删除防火墙规则 HTTPS 入口" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除防火墙规则 SSH 系统规则" })).not.toBeInTheDocument();
    expect(fetchFirewall).toHaveBeenCalledTimes(1);
  });

  it("does not show fixtures when UFW is inactive", async () => {
    vi.mocked(fetchFirewall).mockResolvedValue({ ...payload, backendStatus: "inactive", warnings: ["UFW 当前未启用，规则变更已锁定"], rules: [] });
    render(<FirewallPage page="firewall" notify={vi.fn()} permissions={["firewall:read", "firewall:operate"]} />);
    expect((await screen.findAllByText("UFW 当前未启用，没有生效规则")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "新增规则" })).toBeDisabled();
    expect(screen.queryByText("HTTPS 公网访问")).not.toBeInTheDocument();
  });

  it("reauthenticates before creating a real rule", async () => {
    const user = userEvent.setup(), notify = vi.fn();
    render(<FirewallPage page="firewall" notify={notify} permissions={["firewall:read", "firewall:operate"]} />);
    await screen.findAllByText("HTTPS 入口"); await user.click(screen.getByRole("button", { name: "新增规则" }));
    const dialog = screen.getByRole("dialog", { name: "新增规则" });
    await user.clear(within(dialog).getByLabelText("端口")); await user.type(within(dialog).getByLabelText("端口"), "8443");
    await user.type(within(dialog).getByLabelText("当前密码"), "current-password"); await user.click(within(dialog).getByRole("button", { name: "保存规则" }));
    await waitFor(() => expect(reauthenticate).toHaveBeenCalledWith("current-password"));
    expect(createFirewallRule).toHaveBeenCalledWith(expect.objectContaining({ name: "临时调试端口", port: 8443, protocol: "TCP", source: "10.0.0.0/8" }), "proof-value-with-more-than-thirty-two-characters");
    expect(notify).toHaveBeenCalledWith("规则已新增", "success");
  });

  it("reuses the operation key after an ambiguous create failure and applies the mutation payload immediately", async () => {
    const user = userEvent.setup();
    const createdPayload = { ...payload, rules: [{ ...payload.rules[0], name: "新端口", port: "8443" }], message: "规则已新增", tone: "success" as const };
    vi.mocked(createFirewallRule).mockRejectedValueOnce(new Error("响应中断，结果未知")).mockResolvedValueOnce(createdPayload);
    render(<FirewallPage page="firewall" notify={vi.fn()} permissions={["firewall:read", "firewall:operate"]} />);
    await screen.findAllByText("HTTPS 入口"); await user.click(screen.getByRole("button", { name: "新增规则" }));
    const dialog = screen.getByRole("dialog", { name: "新增规则" });
    await user.type(within(dialog).getByLabelText("端口"), "8443"); await user.type(within(dialog).getByLabelText("当前密码"), "current-password");
    await user.click(within(dialog).getByRole("button", { name: "保存规则" })); expect(await within(dialog).findByRole("alert")).toHaveTextContent("结果未知");
    expect(within(dialog).getByLabelText("规则名")).toBeDisabled(); expect(within(dialog).getByLabelText("端口")).toBeDisabled(); expect(within(dialog).getByLabelText("协议")).toBeDisabled(); expect(within(dialog).getByLabelText("来源")).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "保存规则" }));
    await waitFor(() => expect(createFirewallRule).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createFirewallRule).mock.calls[1]?.[0]).toEqual(vi.mocked(createFirewallRule).mock.calls[0]?.[0]);
    expect((await screen.findAllByText("新端口")).length).toBeGreaterThan(0);
    expect(fetchFirewall).toHaveBeenCalledTimes(1);
  });

  it("reauthenticates before deleting a managed rule", async () => {
    const user = userEvent.setup();
    render(<FirewallPage page="firewall" notify={vi.fn()} permissions={["firewall:read", "firewall:operate"]} />);
    await screen.findAllByText("HTTPS 入口"); await user.click(within(screen.getByRole("table")).getByRole("button", { name: "删除防火墙规则 HTTPS 入口" }));
    const dialog = screen.getByRole("alertdialog", { name: "删除规则" });
    await user.type(within(dialog).getByLabelText("当前密码"), "current-password"); await user.click(within(dialog).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(deleteFirewallRule).toHaveBeenCalledWith(managedId, expect.any(String), "proof-value-with-more-than-thirty-two-characters"));
  });

  it("reuses the delete operation key after an ambiguous response", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteFirewallRule).mockRejectedValueOnce(new Error("响应中断，结果未知")).mockResolvedValueOnce({ ...payload, rules: payload.rules.slice(1), message: "规则已删除", tone: "warning" });
    render(<FirewallPage page="firewall" notify={vi.fn()} permissions={["firewall:read", "firewall:operate"]} />);
    await screen.findAllByText("HTTPS 入口"); await user.click(within(screen.getByRole("table")).getByRole("button", { name: "删除防火墙规则 HTTPS 入口" }));
    const dialog = screen.getByRole("alertdialog", { name: "删除规则" });
    await user.type(within(dialog).getByLabelText("当前密码"), "current-password"); await user.click(within(dialog).getByRole("button", { name: "确认删除" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("结果未知");
    await user.click(within(dialog).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(deleteFirewallRule).toHaveBeenCalledTimes(2));
    expect(vi.mocked(deleteFirewallRule).mock.calls[1]?.[1]).toBe(vi.mocked(deleteFirewallRule).mock.calls[0]?.[1]);
  });

  it("shows an initial backend error and offers retry", async () => {
    vi.mocked(fetchFirewall).mockRejectedValueOnce(new Error("防火墙后端暂不可用")).mockResolvedValue(payload);
    const user = userEvent.setup(); render(<FirewallPage page="firewall" notify={vi.fn()} permissions={["firewall:read"]} />);
    expect(await screen.findByText("防火墙后端暂不可用")).toBeInTheDocument(); expect(screen.getAllByText("暂不可用").length).toBeGreaterThanOrEqual(2); expect(screen.queryByText("没有匹配的防火墙规则")).not.toBeInTheDocument(); await user.click(screen.getByRole("button", { name: "重试" }));
    expect((await screen.findAllByText("HTTPS 入口")).length).toBeGreaterThan(0);
  });

  it("does not fetch when a direct route lacks firewall read permission", () => {
    render(<FirewallPage page="firewall" notify={vi.fn()} permissions={[]} />);
    expect(screen.getByText("无权读取主机防火墙数据")).toBeInTheDocument();
    expect(fetchFirewall).not.toHaveBeenCalled();
  });

  it("shows at most three warning rows and groups overflow", async () => {
    vi.mocked(fetchFirewall).mockResolvedValue({ ...payload, warnings: ["提示一", "提示二", "提示三", "提示四"] });
    render(<FirewallPage page="firewall" notify={vi.fn()} permissions={["firewall:read"]} />);
    expect(await screen.findByText("提示一")).toBeInTheDocument(); expect(screen.getByText("提示二")).toBeInTheDocument();
    expect(screen.getByText("另有 2 条防火墙提示")).toBeInTheDocument(); expect(screen.queryByText("提示三")).not.toBeInTheDocument();
  });
});
