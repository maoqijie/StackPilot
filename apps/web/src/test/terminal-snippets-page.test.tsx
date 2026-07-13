import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTerminalTask } from "../api/terminalApi";
import { TerminalPage } from "../pages/TerminalPage";
import type { Notify } from "../types/app";
import { resetTerminalApiMocks, terminalNode } from "./terminalTestFixtures";

vi.mock("../api/identityApi", () => ({ reauthenticate: vi.fn() }));
vi.mock("../api/terminalApi", () => ({ createTerminalTask: vi.fn(), fetchTerminalHosts: vi.fn(), fetchTerminalNodes: vi.fn(), fetchTerminalTasks: vi.fn() }));

describe("terminal snippets page", () => {
  beforeEach(resetTerminalApiMocks);

  it("opens controlled command details in a body-level modal drawer", async () => {
    const user = userEvent.setup();
    render(<TerminalPage page="terminal-snippets" notify={vi.fn()} />);

    await screen.findByRole("button", { name: "执行 磁盘占用" });
    await user.click(screen.getByRole("button", { name: "查看 磁盘占用 详情" }));

    const drawer = screen.getByRole("dialog", { name: "磁盘占用" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("terminal-snippet-drawer");
    expect(within(drawer).getByText("df -h")).toBeInTheDocument();
    expect(within(drawer).getByText("Agent 受控只读任务，不提供任意 Shell")).toBeInTheDocument();
  });

  it("reauthenticates before running a service status snippet", async () => {
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    render(<TerminalPage page="terminal-snippets" notify={notify} />);

    const run = await screen.findByRole("button", { name: "执行 Nginx 状态" });
    await vi.waitFor(() => expect(run).toBeEnabled());
    await user.click(run);
    const dialog = screen.getByRole("alertdialog", { name: "确认执行受控命令" });
    expect(within(dialog).getByText("systemctl status nginx --no-pager")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("当前密码"), "current-password");
    await user.click(within(dialog).getByRole("button", { name: "确认执行" }));

    await vi.waitFor(() => expect(createTerminalTask).toHaveBeenCalledWith(
      terminalNode.nodeId,
      expect.objectContaining({ type: "service.status.read", parameters: { serviceName: "nginx" } }),
      expect.any(String),
    ));
    expect(notify).toHaveBeenCalledWith("真实任务已提交，等待 Agent 返回结果", "success");
  });

  it("disables execution for accounts without task creation permission", async () => {
    render(<TerminalPage page="terminal-snippets" notify={vi.fn()} permissions={["nodes:read", "tasks:read"]} />);

    expect(await screen.findByRole("button", { name: "执行 系统负载" })).toBeDisabled();
    expect(screen.getByLabelText("命令输入")).toBeDisabled();
    expect(createTerminalTask).not.toHaveBeenCalled();
  });
});
