import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchHosts, type HostMonitoringRecord } from "../api/hostsApi";
import { HostsPage } from "../pages/HostsPage";

vi.mock("../api/hostsApi", () => ({ fetchHosts: vi.fn() }));

const longHostname = "edge-production-observability-node-with-a-very-long-hostname-01.internal.example";
const gib = 1024 ** 3;

function host(overrides: Partial<HostMonitoringRecord> = {}): HostMonitoringRecord {
  return {
    id: "node-1", source: "agent", name: longHostname, platform: "linux", address: "198.18.0.1",
    environment: "生产", owner: "平台团队", connectionStatus: "online", healthStatus: "healthy",
    telemetryFreshness: "current",
    telemetryCollectedAt: "2026-07-12T04:30:00.000Z", lastSeenAt: "2026-07-12T04:30:01.000Z", cpuPercent: 24,
    memory: { totalBytes: 100 * gib, usedBytes: 48 * gib, percent: 48 },
    disk: { totalBytes: 500 * gib, usedBytes: 400 * gib, percent: 80, volumes: [
      { label: "root", mountPath: "/", totalBytes: 200 * gib, usedBytes: 120 * gib, percent: 60 },
      { label: "data", mountPath: "/data", totalBytes: 300 * gib, usedBytes: 280 * gib, percent: 93 },
    ] },
    uptimeSeconds: 8 * 86_400, backup: { status: "healthy", latestAt: "2026-07-12T02:30:00.000Z", detail: "备份正常" },
    services: [{ name: "Controller", status: "running" }], version: "v1.0.0", latency: null, updateStatus: null,
    ...overrides,
  };
}

describe("hosts live monitoring page", () => {
  const notify = vi.fn();
  beforeEach(() => { notify.mockClear(); vi.mocked(fetchHosts).mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("shows a retryable initial error without fixture hosts", async () => {
    vi.mocked(fetchHosts).mockRejectedValue(new Error("Controller 暂不可用"));
    render(<HostsPage page="hosts" notify={notify} />);
    expect(await screen.findByText("Controller 暂不可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.getAllByText("实时采集失败，未显示示例主机")).toHaveLength(2);
    expect(notify).toHaveBeenCalledWith("Controller 暂不可用", "danger");
  });

  it("polls silently, preserves selected ID, and retains data on a background failure", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchHosts)
      .mockResolvedValueOnce({ collectedAt: "2026-07-12T04:30:00.000Z", hosts: [host()] })
      .mockResolvedValueOnce({ collectedAt: "2026-07-12T04:30:10.000Z", hosts: [host({ cpuPercent: 31 })] })
      .mockRejectedValueOnce(new Error("瞬时失败"))
      .mockResolvedValueOnce({ collectedAt: "2026-07-12T04:30:30.000Z", hosts: [] });
    render(<HostsPage page="hosts" notify={notify} />);
    await act(async () => undefined);
    fireEvent.click(screen.getAllByRole("button", { name: `查看主机 ${longHostname}` })[0]);
    await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve(); });
    expect(fetchHosts).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole("dialog", { name: longHostname })).getByText("31%")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve(); });
    expect(screen.getByRole("dialog", { name: longHostname })).toBeInTheDocument();
    expect(notify).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve(); });
    expect(screen.queryByRole("dialog", { name: longHostname })).not.toBeInTheDocument();
  });

  it("shows every disk volume and per-host collection time", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchHosts).mockResolvedValue({ collectedAt: "2026-07-12T04:30:02.000Z", hosts: [host()] });
    render(<HostsPage page="hosts" notify={notify} />);
    await screen.findAllByTitle(longHostname);
    const tooltip = screen.getAllByRole("tooltip")[0];
    expect(tooltip).toHaveTextContent("root (/)");
    expect(tooltip).toHaveTextContent("60% · 已用 120.0 GB / 200.0 GB");
    expect(tooltip).toHaveTextContent("data (/data)");
    expect(tooltip).toHaveTextContent("93% · 已用 280.0 GB / 300.0 GB");
    await user.click(screen.getAllByRole("button", { name: `查看主机 ${longHostname}` })[0]);
    const drawer = screen.getByRole("dialog", { name: longHostname });
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText("最近在线")).toBeInTheDocument();
    expect(within(drawer).getByText("Controller")).toBeInTheDocument();
    expect(within(drawer).getByText("/data")).toBeInTheDocument();
    expect(within(drawer).getByText(/采集于/)).toBeInTheDocument();
  });

  it("labels old agents as awaiting telemetry without rendering fake zero bars", async () => {
    vi.mocked(fetchHosts).mockResolvedValue({ collectedAt: "2026-07-12T04:30:02.000Z", hosts: [host({
      connectionStatus: "online", healthStatus: "unknown", telemetryCollectedAt: null,
      telemetryFreshness: "awaiting",
      cpuPercent: null, memory: null, disk: null, uptimeSeconds: null, backup: null, services: [],
    })] });
    render(<HostsPage page="hosts" notify={notify} />);
    expect((await screen.findAllByText("未知")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("等待采集").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("keeps production filtering scoped to the production environment", async () => {
    vi.mocked(fetchHosts).mockResolvedValue({ collectedAt: "2026-07-12T04:30:02.000Z", hosts: [host(), host({ id: "node-dev", name: "dev-node", environment: "开发", address: "198.18.0.2" })] });
    render(<HostsPage page="hosts-prod" notify={notify} />);
    await screen.findByText(/聚合于/);
    expect(screen.queryByText("dev-node")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /环境/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("CPU 24%，内存 48%，磁盘 80%")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /刷新|重新采集|重新扫描/ })).not.toBeInTheDocument();
  });
});
