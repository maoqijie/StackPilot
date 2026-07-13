import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DatabaseSlowQueriesPage } from "../pages/DatabaseSlowQueriesPage";
import { dbRows, initialDatabaseSlowQueries } from "../mocks/demoData";

const snapshot = { queries: initialDatabaseSlowQueries, instances: dbRows };

describe("database slow queries page", () => {
  it("shows honest freshness and no fake refresh action", () => {
    render(<DatabaseSlowQueriesPage page="databases-slow" setPage={vi.fn()} notify={vi.fn()} />);

    expect(screen.getByText("采集时间 暂不可用")).toBeInTheDocument();
    expect(screen.getAllByText("等待接入慢查询采集")).toHaveLength(2);
    expect(screen.getByText("慢查询采集尚未接入，未显示示例数据。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刷新采样" })).not.toBeInTheDocument();
    expect(screen.getAllByText("暂不可用").length).toBeGreaterThan(0);
  });

  it("opens a portal drawer without reserving a side layout column", async () => {
    const user = userEvent.setup();
    render(<DatabaseSlowQueriesPage page="databases-slow" setPage={vi.fn()} notify={vi.fn()} snapshot={snapshot} />);

    await user.click(screen.getAllByRole("button", { name: "查看慢查询 orders_status_created_at" })[0]);

    const drawer = screen.getByRole("dialog", { name: "慢查询详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(document.querySelector(".module-layout")).not.toHaveClass("has-side");
    expect(within(drawer).getByText("运维")).toBeInTheDocument();
    expect(within(drawer).getByText("今天 09:18")).toBeInTheDocument();
    expect(within(drawer).getByText("终止会话")).toBeInTheDocument();
  });
});
