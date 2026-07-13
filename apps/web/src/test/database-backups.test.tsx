import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DatabaseBackupsPage } from "../pages/DatabaseBackupsPage";

describe("database backups workbench", () => {
  it("shows semantic status, task freshness, and no manual refresh action", () => {
    render(<DatabaseBackupsPage page="databases-backups" notify={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("任务成功率 50%")).toBeInTheDocument();
    expect(screen.getByText("任务或恢复点记录")).toBeInTheDocument();
    expect(screen.getByText("今天 10:30", { selector: ".backup-freshness-value" })).toBeInTheDocument();

    const failedStatus = screen.getAllByText("失败").find((element) => element.closest(".backup-status"));
    expect(failedStatus?.closest(".backup-status")?.querySelector("svg")).toBeInTheDocument();
  });

  it("opens complete plan details in a body-level drawer", async () => {
    const user = userEvent.setup();
    render(<DatabaseBackupsPage page="databases-backups" notify={vi.fn()} />);

    await user.click(screen.getAllByRole("button", { name: "查看 生产 PostgreSQL 每日全量 详情" })[0]);

    const drawer = screen.getByRole("region", { name: "备份计划详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getAllByText("prod-postgres-01")).toHaveLength(2);
    expect(within(drawer).getByText("0 2 * * *")).toBeInTheDocument();
    expect(within(drawer).getByText("14 份")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "立即备份" })).toBeInTheDocument();
  });
});
