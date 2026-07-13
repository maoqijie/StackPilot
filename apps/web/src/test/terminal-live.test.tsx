import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTerminalTask, fetchTerminalHosts, fetchTerminalTasks } from "../api/terminalApi";
import { TerminalPage } from "../pages/TerminalPage";
import { resetTerminalApiMocks, terminalNode as node, terminalTask as task } from "./terminalTestFixtures";

vi.mock("../api/identityApi", () => ({ reauthenticate: vi.fn() }));
vi.mock("../api/terminalApi", () => ({ createTerminalTask: vi.fn(), fetchTerminalHosts: vi.fn(), fetchTerminalNodes: vi.fn(), fetchTerminalTasks: vi.fn() }));

describe("terminal real backend integration", () => {
  beforeEach(resetTerminalApiMocks);
  it("renders real Agent identity, address and output", async () => { render(<TerminalPage page="terminal" notify={vi.fn()} />); expect(await screen.findByText("real-agent-01")).toBeInTheDocument(); expect(screen.getByText("198.18.0.10")).toBeInTheDocument(); expect(screen.getByText("hostname: real-agent-01")).toBeInTheDocument(); expect(screen.queryByText("panel-se-01")).not.toBeInTheDocument(); });
  it("reauthenticates before submitting a structured task", async () => { render(<TerminalPage page="terminal" notify={vi.fn()} />); const input = await screen.findByLabelText("命令输入"); fireEvent.change(input, { target: { value: "systemctl status nginx --no-pager" } }); fireEvent.click(screen.getByRole("button", { name: "运行" })); const dialog = screen.getByRole("alertdialog", { name: "确认执行受控命令" }); fireEvent.change(within(dialog).getByLabelText("当前密码"), { target: { value: "current-password" } }); fireEvent.click(within(dialog).getByRole("button", { name: "确认执行" })); await vi.waitFor(() => expect(createTerminalTask).toHaveBeenCalledWith(node.nodeId, expect.objectContaining({ type: "service.status.read", parameters: { serviceName: "nginx" } }), "proof-value-with-more-than-thirty-two-characters")); });
  it("rejects arbitrary shell input", async () => { const notify = vi.fn(); render(<TerminalPage page="terminal" notify={notify} />); const input = await screen.findByLabelText("命令输入"); fireEvent.change(input, { target: { value: "rm -rf /" } }); fireEvent.click(screen.getByRole("button", { name: "运行" })); expect(createTerminalTask).not.toHaveBeenCalled(); expect(notify).toHaveBeenCalledWith(expect.stringContaining("仅支持"), "danger"); });
  it("marks an unavailable service probe as failed", async () => {
    vi.mocked(fetchTerminalTasks).mockResolvedValue({ tasks: [{ ...task, type: "service.status.read", parameters: { serviceName: "nginx" }, idempotencyKey: "terminal-service-unavailable", result: { message: "Service status unavailable", truncated: false, data: { serviceName: "nginx", state: "unavailable", available: false } } }] });
    render(<TerminalPage page="terminal-history" notify={vi.fn()} />);
    expect(await screen.findByText("失败")).toBeInTheDocument();
    expect(screen.getAllByText("nginx: unavailable (unavailable)")).toHaveLength(2);
  });
  it("retains the top command identity in task history", async () => {
    vi.mocked(fetchTerminalTasks).mockResolvedValue({ tasks: [{ ...task, parameters: { includeLoad: true }, idempotencyKey: "terminal-top-real", result: { ...task.result!, data: { ...task.result!.data, loadAverage: [0.2, 0.3, 0.4] } } }] });
    render(<TerminalPage page="terminal-history" notify={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "查看任务详情 top" })).toBeInTheDocument();
  });
  it("keeps authorized node data when host monitoring permission is absent", async () => {
    render(<TerminalPage page="terminal-sessions" notify={vi.fn()} permissions={["nodes:read", "tasks:read"]} />);
    expect(await screen.findByText("real-agent-01")).toBeInTheDocument();
    expect(screen.getByText("等待 Agent 上报")).toBeInTheDocument();
    expect(fetchTerminalHosts).not.toHaveBeenCalled();
  });
});
