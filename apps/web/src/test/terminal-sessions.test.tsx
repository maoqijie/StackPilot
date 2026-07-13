import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TerminalPage } from "../pages/TerminalPage";
import type { Notify } from "../types/app";

describe("terminal sessions page", () => {
  it("opens complete session details in a body-level modal drawer", async () => {
    const user = userEvent.setup();
    const { container } = render(<TerminalPage page="terminal-sessions" notify={vi.fn<Notify>()} />);

    await user.click(screen.getByRole("button", { name: "查看 panel-se-01 会话详情" }));

    const drawer = screen.getByRole("dialog", { name: "root@panel-se-01" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("terminal-session-drawer");
    expect(container.querySelector(".module-layout")).not.toHaveClass("has-side");
    expect(within(drawer).getByText("会话已打开")).toBeInTheDocument();
    expect(within(drawer).getAllByText("10.0.0.11")).toHaveLength(2);
    expect(within(drawer).getByText("sudo 管理权限")).toBeInTheDocument();
    expect(within(drawer).getByText("/var/www/html")).toBeInTheDocument();
    expect(within(drawer).getByText("systemctl status nginx")).toBeInTheDocument();
  });

  it("requires confirmation before closing a connected session", async () => {
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    render(<TerminalPage page="terminal-sessions" notify={notify} />);

    await user.click(screen.getByRole("button", { name: "关闭 panel-se-01" }));

    const dialog = screen.getByRole("alertdialog", { name: "关闭终端会话" });
    expect(dialog.parentElement).toBe(document.body);
    expect(document.querySelector(".terminal-page-layer")).toHaveAttribute("inert");
    expect(screen.queryByRole("button", { name: "关闭 panel-se-01" })).not.toBeInTheDocument();
    expect(notify).not.toHaveBeenCalledWith("panel-se-01 会话已关闭", "warning");

    await user.click(within(dialog).getByRole("button", { name: "确认关闭" }));

    expect(screen.queryByRole("alertdialog", { name: "关闭终端会话" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 panel-se-01" })).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("panel-se-01 会话已关闭", "warning");
  });

  it("uses a portal confirmation dialog for sudo change commands", async () => {
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    render(<TerminalPage page="terminal-sessions" notify={notify} />);

    await user.type(screen.getByRole("textbox", { name: "命令输入" }), "systemctl restart nginx");
    await user.click(screen.getByRole("button", { name: "运行" }));

    const dialog = screen.getByRole("alertdialog", { name: "确认执行变更命令" });
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByText(/systemctl restart nginx/)).toBeInTheDocument();
    expect(screen.queryByText("service restart queued, status=0/SUCCESS")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "确认执行" }));

    await waitFor(() => expect(screen.getByText("service restart queued, status=0/SUCCESS")).toBeInTheDocument());
    expect(notify).toHaveBeenCalledWith("panel-se-01 输出已记录", "success");
  });
});
