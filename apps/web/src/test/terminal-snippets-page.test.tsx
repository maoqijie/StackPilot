import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TerminalPage } from "../pages/TerminalPage";
import type { Notify } from "../types/app";

describe("terminal snippets page", () => {
  it("opens snippet details in a body-level modal drawer", async () => {
    const user = userEvent.setup();
    render(<TerminalPage page="terminal-snippets" notify={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "查看 磁盘占用 详情" }));

    const drawer = screen.getByRole("dialog", { name: "磁盘占用" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("terminal-snippet-drawer");
    expect(within(drawer).getByText("df -h")).toBeInTheDocument();
    expect(within(drawer).getByText("目标会话")).toBeInTheDocument();
  });

  it("requires a warning confirmation before running a change snippet", async () => {
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    render(<TerminalPage page="terminal-snippets" notify={notify} />);

    await user.click(screen.getByRole("button", { name: "执行 重启 Worker" }));
    const dialog = screen.getByRole("alertdialog", { name: "确认执行变更命令" });
    expect(dialog).toHaveClass("terminal-snippet-confirm");
    expect(within(dialog).getByText("systemctl restart worker.service")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "确认执行" }));

    expect(screen.queryByRole("alertdialog", { name: "确认执行变更命令" })).not.toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("panel-se-01 输出已记录", "success");
  });

  it("keeps dangerous snippets inspectable but blocks direct execution", async () => {
    const user = userEvent.setup();
    render(<TerminalPage page="terminal-snippets" notify={vi.fn()} />);

    expect(screen.getByRole("button", { name: "执行 清理临时缓存" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "查看 清理临时缓存 详情" }));

    const drawer = screen.getByRole("dialog", { name: "清理临时缓存" });
    expect(within(drawer).getByText("危险命令，已禁止直接执行")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: /已阻止执行/ })).toBeDisabled();
  });
});
