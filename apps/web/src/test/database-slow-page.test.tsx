import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DatabaseSlowQueriesPage } from "../pages/DatabaseSlowQueriesPage";

const initialPayload = {
  collectedAt: "2026-07-14T00:00:00.000Z", collectionStatus: "complete" as const, warnings: [], thresholdMs: 1_000,
  instances: [{ id: "postgres-orders", name: "orders", engine: "PostgreSQL 16.9", host: "Controller 本机", port: 5432, activeConnections: 4, slowQueryCount: 1, collectedAt: "2026-07-14T00:00:00.000Z" }],
  queries: [{ id: "query-1", instanceId: "postgres-orders", database: "orders", fingerprint: "pg-123", sql: "SELECT * FROM users WHERE id = ?", durationMs: 31_250, calls: null, p95Ms: null, rowsExamined: null, risk: "high" as const, state: "active" as const, owner: "reporter", startedAt: "2026-07-13T23:59:28.750Z", lastSeenAt: "2026-07-14T00:00:00.000Z", sessionId: "91", waitEvent: null }],
};

describe("database slow queries page", () => {
  it("renders real collection freshness and no fake mutation actions", () => {
    render(<DatabaseSlowQueriesPage page="databases-slow" notify={vi.fn()} initialPayload={initialPayload} />);
    expect(screen.getByText(/数据来源：Controller 本机 PostgreSQL pg_stat_activity/)).toBeInTheDocument();
    expect(screen.getAllByText("31.25 秒").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Explain|索引|终止|处理/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刷新采样" })).not.toBeInTheDocument();
  });

  it("opens stable portal details and labels unavailable historical statistics", async () => {
    const user = userEvent.setup();
    render(<DatabaseSlowQueriesPage page="databases-slow" notify={vi.fn()} initialPayload={initialPayload} />);
    await user.click(screen.getAllByRole("button", { name: "查看慢查询 pg-123" })[0]);
    const drawer = screen.getByRole("dialog", { name: "慢查询详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText("reporter")).toBeInTheDocument();
    expect(within(drawer).getByText("暂不可用 / 暂不可用")).toBeInTheDocument();
    expect(within(drawer).getByText(/pg_stat_statements/)).toBeInTheDocument();
  });

  it("does not present an unavailable collector as a successful zero result", () => {
    render(<DatabaseSlowQueriesPage page="databases-slow" notify={vi.fn()} initialPayload={{ ...initialPayload, collectionStatus: "unavailable", warnings: ["PostgreSQL 慢查询统计暂不可用"], instances: [], queries: [] }} />);
    expect(screen.getAllByText("暂不可用").length).toBeGreaterThan(0);
    expect(screen.getAllByText("慢查询统计暂不可用").length).toBeGreaterThan(0);
    expect(screen.queryByText("当前慢查询 0")).not.toBeInTheDocument();
  });
});
