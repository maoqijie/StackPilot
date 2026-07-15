import type { AuditEvent, AuditEventsResponse } from "@stackpilot/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuditEvents } from "../api/auditApi";
import { auditRecord } from "../features/audit/model";
import { AuditPage } from "../pages/AuditPage";

vi.mock("../api/auditApi", () => ({ fetchAuditEvents: vi.fn() }));

const hash = "a".repeat(64);
function event(overrides: Partial<AuditEvent> = {}): AuditEvent { return { sequence: 1, eventId: "11111111-1111-4111-8111-111111111111", occurredAt: "2026-07-14T00:00:00.000Z", actorType: "user", actorId: "operator", source: "controller", targetType: "file", targetId: "/tmp/a", action: "file.trash", parameters: "{}", outcome: "success", authorization: "allowed", requestId: "request-1", traceId: "trace-1", eventHash: hash, ...overrides }; }
function response(events: AuditEvent[]): AuditEventsResponse { return { events, collectedAt: "2026-07-14T00:00:10.000Z" }; }

describe("real audit page", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/#audit"); vi.mocked(fetchAuditEvents).mockReset().mockResolvedValue(response([event()])); });
  it("loads real global events without demo fallback", async () => { render(<AuditPage page="audit" notify={vi.fn()} />); await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalledWith(undefined, expect.any(AbortSignal))); expect((await screen.findAllByText("file.trash")).length).toBeGreaterThan(0); expect(screen.queryByText("李敏")).not.toBeInTheDocument(); expect(screen.getByText(/后端查询时间/)).toBeInTheDocument(); });
  it("queries database events at the backend before limiting", async () => { window.history.replaceState(null, "", "/?auditSource=database#audit"); vi.mocked(fetchAuditEvents).mockResolvedValue(response([event({ action: "database.operation.queued", targetType: "database-operation" })])); render(<AuditPage page="audit" notify={vi.fn()} />); await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalledWith("database.", expect.any(AbortSignal))); expect((await screen.findAllByText("database.operation.queued")).length).toBeGreaterThan(0); });
  it("keeps non-terminal outcomes distinct from success and exposes real details", async () => { vi.mocked(fetchAuditEvents).mockResolvedValue(response([event({ action: "database.operation.queued", outcome: "queued", parameters: '{"kind":"backup"}' })])); render(<AuditPage page="audit" notify={vi.fn()} />); expect((await screen.findAllByText("已记录")).length).toBeGreaterThan(0); fireEvent.click(screen.getAllByRole("button", { name: "详情" })[0]!); const dialog = screen.getByRole("dialog", { name: "审计详情" }); expect(dialog.parentElement).toBe(document.body); expect(within(dialog).getByText("request-1")).toBeInTheDocument(); expect(within(dialog).getByText(/backup/)).toBeInTheDocument(); });
  it("shows an initial retry error without fake records", async () => { vi.mocked(fetchAuditEvents).mockRejectedValueOnce(new Error("Controller 暂不可用")).mockResolvedValueOnce(response([])); render(<AuditPage page="audit" notify={vi.fn()} />); expect(await screen.findByText("Controller 暂不可用")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "重试" })); await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalledTimes(2)); expect((await screen.findAllByText("没有匹配的真实审计日志，系统将继续自动查询")).length).toBeGreaterThan(0); });
  it("confirms a real CSV export without creating a fake task", async () => { const user = userEvent.setup(); const createObjectURL = vi.fn(() => "blob:audit"); Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() }); render(<AuditPage page="audit-export" notify={vi.fn()} />); await screen.findAllByText("file.trash"); await user.click(screen.getByRole("button", { name: "导出 CSV" })); const dialog = screen.getByRole("dialog", { name: "导出真实审计" }); expect(within(dialog).getByText("当前筛选范围")).toBeInTheDocument(); await user.click(within(dialog).getByRole("button", { name: "下载 CSV" })); expect(createObjectURL).toHaveBeenCalledTimes(1); expect(screen.queryByText(/审计导出 \d/)).not.toBeInTheDocument(); });
});

describe("audit semantics", () => { it.each([["failure", "失败"], ["rejected", "失败"], ["success", "成功"], ["queued", "已记录"]] as const)("maps %s to %s", (outcome, result) => { expect(auditRecord(event({ outcome })).result).toBe(result); }); });
