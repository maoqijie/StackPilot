import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuditEvents } from "../api/auditApi";
import { AuditPage } from "../pages/AuditPage";

vi.mock("../api/auditApi", () => ({ fetchAuditEvents: vi.fn() }));

describe("database audit context", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?auditSource=database#audit");
    vi.mocked(fetchAuditEvents).mockReset().mockResolvedValue({
      collectedAt: "2026-07-14T00:00:01.000Z",
      events: [
        auditEvent({ eventId: "database-event", source: "database-controller", targetType: "database-operation", targetId: "operation-1", action: "database.operation.queued", outcome: "queued", requestId: "request-1", traceId: "trace-1" }),
      ],
    });
  });

  it("renders only real database audit events", async () => {
    render(<AuditPage page="audit" notify={vi.fn()} permissions={["audit:read"]} />);
    await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalledTimes(1));
    expect(fetchAuditEvents).toHaveBeenCalledWith(expect.objectContaining({ result: "all", actionPrefix: "database." }));
    expect((await screen.findAllByText("database.operation.queued")).length).toBeGreaterThan(0);
    expect(screen.queryByText("file.trash")).not.toBeInTheDocument();
    expect(screen.queryByText("创建只读用户")).not.toBeInTheDocument();
  });
});

function auditEvent(overrides: Record<string, unknown>) {
  return {
    sequence: 1,
    eventId: "event",
    occurredAt: "2026-07-14T00:00:00.000Z",
    actorType: "user",
    actorId: "operator",
    source: "controller",
    targetType: null,
    targetId: null,
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
