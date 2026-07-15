import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuditEvents } from "../api/auditApi";
import { AuditPage } from "../pages/AuditPage";

vi.mock("../api/auditApi", () => ({ fetchAuditEvents: vi.fn(), fetchAuditExports: vi.fn() }));

describe("database audit context", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?auditSource=database#audit");
    vi.mocked(fetchAuditEvents).mockReset().mockResolvedValue([
      { sequence: 2, eventId: "database-event", occurredAt: "2026-07-14T00:00:00.000Z", actorType: "user", actorId: "operator", source: "database-controller", targetType: "database-operation", targetId: "operation-1", action: "database.operation.queued", parameters: "{}", outcome: "queued", requestId: "request-1", traceId: "trace-1" },
      { sequence: 1, eventId: "other-event", occurredAt: "2026-07-14T00:00:00.000Z", actorType: "user", actorId: "operator", source: "controller", targetType: "file", targetId: "/tmp/a", action: "file.trash", parameters: "{}", outcome: "success", requestId: "request-2", traceId: "trace-2" },
    ]);
  });

  it("renders only real database audit events", async () => {
    render(<AuditPage page="audit" notify={vi.fn()} permissions={["audit:read"]} />);
    await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText("database.operation.queued")).length).toBeGreaterThan(0);
    expect(screen.queryByText("file.trash")).not.toBeInTheDocument();
    expect(screen.queryByText("创建只读用户")).not.toBeInTheDocument();
  });
});
