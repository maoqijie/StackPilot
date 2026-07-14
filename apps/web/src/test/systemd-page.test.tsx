import type { SystemdUnit } from "@stackpilot/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSystemdJournal, fetchSystemdUnits, mutateSystemdUnit } from "../api/systemdApi";
import { reauthenticate } from "../api/identityApi";
import { SystemdPage } from "../pages/SystemdPage";

vi.mock("../api/systemdApi", () => ({ fetchSystemdUnits: vi.fn(), fetchSystemdJournal: vi.fn(), mutateSystemdUnit: vi.fn() }));
vi.mock("../api/identityApi", () => ({ reauthenticate: vi.fn() }));

const collectedAt = "2026-07-15T00:00:00.000Z";
const units: SystemdUnit[] = [
  { id: "nginx.service", name: "nginx.service", description: "Nginx web server", host: "prod-host", state: "active", activeState: "active", subState: "running", restarts: 0, memoryBytes: 88_080_384, stateChangedAt: collectedAt, availableActions: ["start", "stop", "restart"] },
  { id: "mysql.service", name: "mysql.service", description: "MySQL", host: "prod-host", state: "failed", activeState: "failed", subState: "failed", restarts: 6, memoryBytes: 1_288_490_188, stateChangedAt: collectedAt, availableActions: [] },
];

describe("systemd service page", () => {
  beforeEach(() => {
    vi.mocked(fetchSystemdUnits).mockReset().mockResolvedValue({ units: [...units], host: "prod-host", collectedAt, warnings: [] });
    vi.mocked(fetchSystemdJournal).mockReset().mockResolvedValue({ unit: "nginx.service", entries: [{ timestamp: collectedAt, message: "Started Nginx" }], collectedAt, truncated: false });
    vi.mocked(reauthenticate).mockReset().mockResolvedValue({ proof: "proof-value-with-more-than-thirty-two-characters", expiresAt: collectedAt });
    vi.mocked(mutateSystemdUnit).mockReset().mockResolvedValue({ unit: units[0], collectedAt, message: "nginx.service 已停止", tone: "warning" });
  });

  it("loads real services and opens a portaled journal drawer", async () => {
    render(<SystemdPage page="systemd" notify={vi.fn()} />);
    const table = await screen.findByRole("table");
    await userEvent.click(within(table).getByRole("button", { name: "查看服务 nginx.service 日志" }));
    const drawer = await screen.findByRole("dialog", { name: "nginx.service" });
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText("prod-host", { selector: "dd" })).toBeInTheDocument();
    expect(await within(drawer).findByText("Started Nginx")).toBeInTheDocument();
    expect(fetchSystemdJournal).toHaveBeenCalledWith("nginx.service", expect.any(AbortSignal));
  });

  it("reauthenticates before a real service mutation", async () => {
    const notify = vi.fn(); render(<SystemdPage page="systemd" notify={notify} />);
    const table = await screen.findByRole("table");
    await userEvent.click(within(table).getByRole("button", { name: "停止服务 nginx.service" }));
    const dialog = screen.getByRole("alertdialog", { name: "确认停止服务" });
    await userEvent.type(within(dialog).getByLabelText("当前密码"), "current password");
    await userEvent.click(within(dialog).getByRole("button", { name: "确认停止" }));
    await waitFor(() => expect(mutateSystemdUnit).toHaveBeenCalledWith("nginx.service", "stop", "proof-value-with-more-than-thirty-two-characters", expect.stringMatching(/^[0-9a-f-]{36}$/)));
    expect(reauthenticate).toHaveBeenCalledWith("current password"); expect(notify).toHaveBeenCalledWith("nginx.service 已停止", "warning");
  });

  it("shows an initial backend error without demo services", async () => {
    vi.mocked(fetchSystemdUnits).mockRejectedValueOnce(new Error("systemd 运维后端暂不可用"));
    render(<SystemdPage page="systemd-active" notify={vi.fn()} />);
    expect(await screen.findByText("systemd 运维后端暂不可用")).toBeInTheDocument();
    expect(screen.queryByText("nginx.service")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
