import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SystemdPage } from "../pages/SystemdPage";

describe("systemd logs page", () => {
  it("shows a borderless log workbench without duplicate service table or manual refresh", () => {
    render(<SystemdPage page="systemd-logs" notify={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "服务日志流" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /最新采集/ })).toHaveTextContent("3 分钟前");
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByText("运行中").length).toBeGreaterThan(0);
    expect(screen.getAllByText("故障").length).toBeGreaterThan(0);
  });

  it("opens complete service information in a body-level modal drawer and restores focus", async () => {
    const user = userEvent.setup();
    render(<SystemdPage page="systemd-logs" notify={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "打开服务 mysql.service 日志详情" });

    await user.click(trigger);

    const drawer = screen.getByRole("dialog", { name: "服务日志详情" });
    expect(drawer).toHaveClass("systemd-log-drawer");
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getAllByText("故障").length).toBeGreaterThan(0);
    expect(within(drawer).getByText("panel-hk-03", { selector: "dd" })).toHaveAttribute("title", "panel-hk-03");
    expect(within(drawer).getByText("1.2 GB")).toBeInTheDocument();
    expect(within(drawer).getByText("6")).toBeInTheDocument();
    expect(within(drawer).getByRole("log")).toHaveTextContent("entered failed state");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "服务日志详情" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
