import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuditEvents } from "../api/auditApi";
import { AuditPage } from "../pages/AuditPage";

vi.mock("../api/auditApi", () => ({ fetchAuditEvents: vi.fn() }));

describe("audit failed page", () => {
  beforeEach(() => {
    vi.mocked(fetchAuditEvents).mockReset().mockResolvedValue({
      collectedAt: "2026-07-15T02:03:04.000Z",
      events: [auditEvent({ targetId: "/tmp/old.log", action: "执行 删除文件", outcome: "failed" })],
    });
  });

  it("keeps the failed filter and opens the detail as a modal drawer", async () => {
    const user = userEvent.setup();
    render(<AuditPage page="audit-failed" notify={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "失败操作" })).toBeInTheDocument();
    expect((await screen.findAllByText("/tmp/old.log")).length).toBeGreaterThan(0);
    expect(screen.queryByText("/api (sg-web-02)")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "详情" })[0]);

    const drawer = screen.getByRole("dialog", { name: "审计详情" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText(/执行 删除文件/)).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "关闭审计详情" })).toBeInTheDocument();
  });
});

describe("audit export page", () => {
  it("confirms a new export before adding the task", async () => {
    const user = userEvent.setup();
    render(<AuditPage page="audit-export" notify={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "新建导出" }));

    const dialog = screen.getByRole("dialog", { name: "新建审计导出" });
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByText("当前筛选范围")).toBeInTheDocument();
    expect(screen.getAllByText("今日操作审计 CSV").length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole("button", { name: "创建导出" }));

    expect(screen.getAllByText("审计导出 5").length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog", { name: "新建审计导出" })).not.toBeInTheDocument();
  });
});

function auditEvent(overrides: Record<string, unknown>) {
  return {
    sequence: 1,
    eventId: "failed-event",
    occurredAt: "2026-07-15T02:00:00.000Z",
    actorType: "user",
    actorId: "operator",
    source: "controller",
    targetType: "file",
    targetId: "/tmp/old.log",
    action: "test.action",
    parameters: "{}",
    outcome: "failed",
    authorization: "session+rbac",
    requestId: "request",
    traceId: "trace",
    eventHash: "hash",
    ...overrides,
  };
}
