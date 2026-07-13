import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DatabasesPage } from "../pages/DatabasesPage";
import type { Notify, SetPage } from "../types/app";

describe("database instances page", () => {
  const setPage = vi.fn() as unknown as SetPage;
  const notify = vi.fn() as unknown as Notify;

  it("shows honest freshness and does not expose a manual refresh action", () => {
    const { container } = render(<DatabasesPage page="databases-instances" setPage={setPage} notify={notify} />);

    expect(container.firstElementChild).toHaveClass("module-page-databases-instances", "module-page-databases");
    expect(screen.getByText(/采集时间不可用，当前显示本地会话数据/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("备份成功率 75%")).toBeInTheDocument();
  });

  it("keeps status understandable without color and opens complete detail by stable id", async () => {
    const user = userEvent.setup();
    render(<DatabasesPage page="databases" setPage={setPage} notify={notify} />);

    expect(screen.getAllByText("延迟 560ms").length).toBeGreaterThan(0);
    expect(screen.getAllByText("失败").length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: "查看 analytics-mysql-01 详情" })[0]);

    const drawer = screen.getByRole("region", { name: "数据库详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText("analytics-mysql-01")).toBeInTheDocument();
    expect(within(drawer).getByText("10.0.13.15:3306")).toBeInTheDocument();
    expect(within(drawer).getByText("34.5 GB · 96 / 140")).toBeInTheDocument();
    expect(within(drawer).getByText("香港")).toBeInTheDocument();
    expect(within(drawer).getByText("不可用 · 本地会话数据")).toBeInTheDocument();
  });

  it("preserves the active search while opening and closing a detail drawer", async () => {
    const user = userEvent.setup();
    render(<DatabasesPage page="databases" setPage={setPage} notify={notify} />);

    const search = screen.getByPlaceholderText("搜索数据库、主机、负责人或权限");
    await user.type(search, "billing-mysql-02");
    await user.click(screen.getAllByRole("button", { name: "查看 billing-mysql-02 详情" })[0]);
    await user.click(within(screen.getByRole("region", { name: "数据库详情" })).getByRole("button", { name: "关闭详情" }));

    expect(search).toHaveValue("billing-mysql-02");
  });
});
