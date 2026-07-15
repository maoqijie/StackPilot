import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuditEvents } from "../api/auditApi";
import { AuditPage } from "../pages/AuditPage";

vi.mock("../api/auditApi", () => ({ fetchAuditEvents: vi.fn() }));

const collectedAt = "2026-07-15T02:03:04.000Z";
const failed = auditEvent({ eventId: "failed-event", action: "database.backup.scheduled", outcome: "failed", traceId: "trace-failed" });
const successful = auditEvent({ eventId: "success-event", action: "auth.login", outcome: "success", traceId: "trace-success" });

describe("failed audit page", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#audit-failed");
    vi.mocked(fetchAuditEvents).mockReset().mockResolvedValue({ collectedAt, events: [failed, successful] });
  });

  it("renders only failed records from the real audit response", async () => {
    render(<AuditPage page="audit-failed" notify={vi.fn()} />);

    await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalledTimes(1));
    expect(fetchAuditEvents).toHaveBeenCalledWith(expect.objectContaining({ result: "failed", actionPrefix: undefined }));
    expect((await screen.findAllByText("database.backup.scheduled")).length).toBeGreaterThan(0);
    expect(screen.queryByText("auth.login")).not.toBeInTheDocument();
    expect(screen.getByText(/后端采集于/)).toHaveTextContent("2026");
    expect(screen.getAllByText("失败").length).toBeGreaterThan(0);
  });

  it("closes stale details after the next real polling response removes the event", async () => {
    vi.mocked(fetchAuditEvents)
      .mockResolvedValueOnce({ collectedAt, events: [failed] })
      .mockResolvedValueOnce({ collectedAt: "2026-07-15T02:03:14.000Z", events: [] });
    render(<AuditPage page="audit-failed" notify={vi.fn()} />);
    fireEvent.click((await screen.findAllByRole("button", { name: "详情" }))[0]);
    expect(screen.getByRole("dialog", { name: "审计详情" })).toBeInTheDocument();

    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "审计详情" })).not.toBeInTheDocument());
  });

});

function auditEvent(overrides: Record<string, unknown>) {
  return {
    sequence: 1,
    eventId: "event",
    occurredAt: "2026-07-15T02:00:00.000Z",
    actorType: "user",
    actorId: "operator",
    source: "database-controller",
    targetType: "database-operation",
    targetId: "operation-1",
    action: "test.action",
    parameters: "{}",
    outcome: "success",
    authorization: "session+rbac",
    requestId: "request",
    traceId: "trace",
    eventHash: "hash",
    ...overrides,
  };
}
