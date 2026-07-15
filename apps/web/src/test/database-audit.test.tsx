import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuditEvents } from "../api/auditApi";
import { AuditPage } from "../pages/AuditPage";

vi.mock("../api/auditApi", () => ({ fetchAuditEvents: vi.fn(), fetchAllAuditEvents: vi.fn() }));

describe("database audit context", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?auditSource=database#audit");
    vi.mocked(fetchAuditEvents).mockReset().mockResolvedValue({
      collectedAt: "2026-07-14T00:01:00.000Z",
      total: 2,
      limit: 200,
      nextCursor: null,
      events: [
        { sequence: 2, eventId: "11111111-1111-4111-8111-111111111111", occurredAt: "2026-07-14T00:00:00.000Z", actorType: "user", actorId: "operator", source: "database-controller", targetType: "database-operation", targetId: "operation-1", action: "database.operation.queued", parameters: "{}", outcome: "queued", authorization: "allowed", requestId: "request-1", traceId: "trace-1", eventHash: "a".repeat(64) },
      ],
    });
  });

  it("renders only real database audit events", async () => {
    render(<AuditPage page="audit" notify={vi.fn()} permissions={["audit:read"]} />);
    await waitFor(() => expect(fetchAuditEvents).toHaveBeenCalledTimes(1));
    expect(fetchAuditEvents).toHaveBeenCalledWith({ actionPrefix: "database." }, expect.any(AbortSignal));
    expect((await screen.findAllByText("database.operation.queued")).length).toBeGreaterThan(0);
    expect(screen.queryByText("file.trash")).not.toBeInTheDocument();
    expect(screen.queryByText("创建只读用户")).not.toBeInTheDocument();
  });
});
