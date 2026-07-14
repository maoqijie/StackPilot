import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSystemdJournal, fetchSystemdUnits } from "../api/systemdApi";
import { SystemdPage } from "../pages/SystemdPage";

vi.mock("../api/systemdApi", () => ({ fetchSystemdUnits: vi.fn(), fetchSystemdJournal: vi.fn(), mutateSystemdUnit: vi.fn() }));
vi.mock("../api/identityApi", () => ({ reauthenticate: vi.fn() }));

const collectedAt = "2026-07-15T00:00:00.000Z";
const unit = { id: "nginx.service", name: "nginx.service", description: "Nginx", host: "prod-host", state: "active" as const, activeState: "active", subState: "running", restarts: 0, memoryBytes: 1024, stateChangedAt: collectedAt, availableActions: [] };

describe("systemd logs page", () => {
  beforeEach(() => {
    vi.mocked(fetchSystemdUnits).mockReset().mockResolvedValue({ units: [unit], host: "prod-host", collectedAt, warnings: [] });
    vi.mocked(fetchSystemdJournal).mockReset().mockResolvedValue({ unit: unit.name, entries: [{ timestamp: collectedAt, message: "real journal line" }], collectedAt, truncated: false });
  });

  it("shows a real log index without duplicate table or manual refresh", async () => {
    render(<SystemdPage page="systemd-logs" notify={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "服务日志索引" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Nginx · active/running")).toBeInTheDocument();
  });

  it("loads journal only when the operator opens a service", async () => {
    render(<SystemdPage page="systemd-logs" notify={vi.fn()} />);
    const trigger = await screen.findByRole("button", { name: "打开服务 nginx.service 日志详情" });
    expect(fetchSystemdJournal).not.toHaveBeenCalled(); await userEvent.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "服务日志详情" });
    expect(await within(drawer).findByText("real journal line")).toBeInTheDocument();
  });
});
