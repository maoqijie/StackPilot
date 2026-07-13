import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TerminalPage } from "../pages/TerminalPage";
import type { Notify } from "../types/app";

describe("terminal history page", () => {
  it("opens complete execution details in a body-level modal drawer", async () => {
    const user = userEvent.setup();
    render(<TerminalPage page="terminal-history" notify={vi.fn()} />);

    await user.click(screen.getAllByRole("button", { name: "查看执行详情 systemctl restart nginx" })[0]);

    const drawer = screen.getByRole("dialog", { name: "执行详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("terminal-history-drawer");
    expect(document.querySelector(".module-layout")).not.toHaveClass("has-side");
    expect(within(drawer).getByText("systemctl restart nginx")).toBeInTheDocument();
    expect(within(drawer).getByText("nginx.service restarted")).toBeInTheDocument();
    expect(within(drawer).getByText("root")).toBeInTheDocument();
  });

  it("requires a warning confirmation before rerunning a history command", async () => {
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    render(<TerminalPage page="terminal-history" notify={notify} />);

    await user.click(screen.getByRole("button", { name: "重新执行 systemctl restart nginx panel-se-01 今天 10:42" }));

    const dialog = screen.getByRole("alertdialog", { name: "确认重新执行" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("terminal-rerun-dialog");
    expect(within(dialog).getByText("systemctl restart nginx")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "确认执行" }));

    expect(screen.queryByRole("alertdialog", { name: "确认重新执行" })).not.toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("panel-se-01 输出已记录", "success");
  });
});
