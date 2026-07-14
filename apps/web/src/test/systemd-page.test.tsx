import type { SystemdServicesPayload } from "@stackpilot/contracts";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSystemdServices } from "../api/systemdApi";
import { SystemdPage } from "../pages/SystemdPage";

vi.mock("../api/systemdApi", () => ({ fetchSystemdServices: vi.fn() }));
const time = "2026-07-15T01:02:03.000Z";
const services: SystemdServicesPayload["services"] = [{ id: "11111111-1111-4111-8111-111111111111:nginx.service", nodeId: "11111111-1111-4111-8111-111111111111", host: "prod-real-01", platform: "linux", sourceCollectedAt: time, freshness: "current", unit: "nginx.service", description: "A real web server", loadState: "loaded", activeState: "active", subState: "running", memoryCurrentBytes: 1048576, restartCount: 2, stateChangedAt: time, journal: [] }, { id: "22222222-2222-4222-8222-222222222222:failed.service", nodeId: "22222222-2222-4222-8222-222222222222", host: "prod-real-02", platform: "linux", sourceCollectedAt: time, freshness: "current", unit: "failed.service", description: "Failed worker", loadState: "loaded", activeState: "failed", subState: "failed", memoryCurrentBytes: null, restartCount: 4, stateChangedAt: time, journal: [] }];
const payload: SystemdServicesPayload = { collectedAt: time, collectionStatus: "complete", warnings: [], services };

describe("systemd service page", () => {
  beforeEach(() => vi.mocked(fetchSystemdServices).mockResolvedValue(payload));
  it("renders real read-only rows and opens a complete portaled drawer", async () => {
    const user = userEvent.setup(); render(<SystemdPage page="systemd" notify={vi.fn()} />); const table = await screen.findByRole("table");
    expect(within(table).getByText("A real web server")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /启动服务|停止服务|重启服务|标记服务/ })).not.toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "查看服务 nginx.service 日志" }));
    const drawer = screen.getByRole("dialog", { name: "nginx.service" }); expect(drawer.parentElement).toBe(document.body); expect(within(drawer).getByText("prod-real-01", { selector: "dd" })).toBeInTheDocument();
  });
  it("keeps failed page filtering on backend records", async () => {
    render(<SystemdPage page="systemd-failed" notify={vi.fn()} />); const table = await screen.findByRole("table");
    expect(within(table).getByText("failed.service")).toBeInTheDocument(); expect(within(table).queryByText("nginx.service")).not.toBeInTheDocument();
  });
});
