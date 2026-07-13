import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTerminalTask } from "../api/terminalApi";
import { TerminalPage } from "../pages/TerminalPage";
import type { Notify } from "../types/app";
import { resetTerminalApiMocks, terminalNode } from "./terminalTestFixtures";

vi.mock("../api/identityApi", () => ({ reauthenticate: vi.fn() }));
vi.mock("../api/terminalApi", () => ({ createTerminalTask: vi.fn(), fetchTerminalHosts: vi.fn(), fetchTerminalNodes: vi.fn(), fetchTerminalTasks: vi.fn() }));

describe("terminal history page", () => {
  beforeEach(resetTerminalApiMocks);

  it("opens complete real task details in a body-level modal drawer", async () => {
    const user = userEvent.setup();
    render(<TerminalPage page="terminal-history" notify={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "查看任务详情 df -h" }));

    const drawer = screen.getByRole("dialog", { name: "真实任务详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("terminal-history-drawer");
    expect(document.querySelector(".module-layout")).not.toHaveClass("has-side");
    expect(within(drawer).getByText("df -h")).toBeInTheDocument();
    expect(within(drawer).getByText("hostname: real-agent-01", { exact: false })).toBeInTheDocument();
  });

  it("reauthenticates before rerunning a real task", async () => {
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    render(<TerminalPage page="terminal-history" notify={notify} />);

    await user.click(await screen.findByRole("button", { name: "重跑" }));

    const dialog = screen.getByRole("alertdialog", { name: "确认执行受控命令" });
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByText("df -h")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("当前密码"), "current-password");
    await user.click(within(dialog).getByRole("button", { name: "确认执行" }));

    await vi.waitFor(() => expect(createTerminalTask).toHaveBeenCalledWith(
      terminalNode.nodeId,
      expect.objectContaining({ type: "system.summary.read", parameters: { includeLoad: false } }),
      expect.any(String),
    ));
    expect(notify).toHaveBeenCalledWith("真实任务已提交，等待 Agent 返回结果", "success");
  });
});
