import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SystemdPage } from "../pages/SystemdPage";

describe("systemd service page", () => {
  it("opens a complete portaled service drawer", async () => {
    const user = userEvent.setup();
    render(<SystemdPage page="systemd" notify={vi.fn()} />);
    const table = screen.getByRole("table");

    await user.click(within(table).getByRole("button", { name: "查看服务 nginx.service 日志" }));

    const drawer = screen.getByRole("dialog", { name: "nginx.service" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("systemd-service-drawer");
    expect(within(drawer).getByText("panel-se-01", { selector: "dd" })).toBeInTheDocument();
    expect(within(drawer).getByText("内存")).toBeInTheDocument();
    expect(within(drawer).getByText("重启次数")).toBeInTheDocument();
    expect(within(drawer).getByRole("log", { name: "nginx.service journal 摘要" })).toBeInTheDocument();
  });

  it("confirms service mutations before updating the selected service", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    render(<SystemdPage page="systemd" notify={notify} />);
    const table = screen.getByRole("table");

    await user.click(within(table).getByRole("button", { name: "停止服务 nginx.service" }));

    const dialog = screen.getByRole("alertdialog", { name: "确认停止服务" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("systemd-action-confirm");
    expect(screen.getAllByText("运行中").length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole("button", { name: "确认停止" }));

    expect(screen.queryByRole("alertdialog", { name: "确认停止服务" })).not.toBeInTheDocument();
    expect(screen.getAllByText("未运行").length).toBeGreaterThan(0);
    expect(notify).toHaveBeenCalledWith("nginx.service 已停止", "warning");
  });

  it("marks a failed alert handled without hiding the failed service", async () => {
    const user = userEvent.setup();
    render(<SystemdPage page="systemd-failed" notify={vi.fn()} />);
    const table = screen.getByRole("table");

    expect(screen.queryByRole("button", { name: /刷新|重新采集|重新扫描/ })).not.toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "标记服务 mysql.service 已处理" }));
    await user.click(within(screen.getByRole("alertdialog", { name: "确认标记已处理" })).getByRole("button", { name: "确认标记" }));

    expect(screen.getAllByText("故障 · 已处理").length).toBeGreaterThan(0);
    expect(screen.getAllByText("mysql.service").length).toBeGreaterThan(0);
  });
});
