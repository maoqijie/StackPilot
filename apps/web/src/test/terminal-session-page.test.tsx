import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TerminalPage } from "../pages/TerminalPage";
import type { Notify } from "../types/app";

describe("terminal session page", () => {
  it("opens complete session details in a body-level modal drawer", async () => {
    const user = userEvent.setup();
    render(<TerminalPage page="terminal" notify={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "查看 panel-se-01 会话详情" }));

    const drawer = screen.getByRole("dialog", { name: "root@panel-se-01" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("terminal-session-drawer");
    expect(within(drawer).getAllByText("10.0.0.11")).toHaveLength(2);
    expect(within(drawer).getByText("sudo 管理权限")).toBeInTheDocument();
    expect(within(drawer).getByText("systemctl status nginx")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "root@panel-se-01" })).not.toBeInTheDocument();
  });

  it("requires confirmation before running a privileged command", async () => {
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    render(<TerminalPage page="terminal" notify={notify} />);

    const input = screen.getByLabelText("命令输入");
    await user.type(input, "systemctl restart nginx");
    await user.click(screen.getByRole("button", { name: "运行" }));

    const dialog = screen.getByRole("alertdialog", { name: "确认执行变更命令" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("terminal-command-confirm");
    expect(within(dialog).getByText(/root@panel-se-01/)).toBeInTheDocument();
    expect(input).toHaveValue("systemctl restart nginx");

    await user.click(within(dialog).getByRole("button", { name: "确认执行" }));

    expect(screen.queryByRole("alertdialog", { name: "确认执行变更命令" })).not.toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(notify).toHaveBeenCalledWith("panel-se-01 输出已记录", "success");
  });

  it("keeps a cancelled privileged command ready for review", async () => {
    const user = userEvent.setup();
    render(<TerminalPage page="terminal" notify={vi.fn()} />);

    const input = screen.getByLabelText("命令输入");
    await user.type(input, "systemctl restart worker.service");
    await user.click(screen.getByRole("button", { name: "运行" }));
    await user.click(within(screen.getByRole("alertdialog", { name: "确认执行变更命令" })).getByRole("button", { name: "取消" }));

    expect(input).toHaveValue("systemctl restart worker.service");
  });
});
