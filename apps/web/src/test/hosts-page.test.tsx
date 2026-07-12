import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOverviewHealth } from "../api/overviewApi";
import type { OverviewNode } from "../api/overviewApi";
import { HostsPage } from "../pages/HostsPage";

vi.mock("../api/overviewApi", () => ({
  fetchOverviewHealth: vi.fn(),
}));

const longHostname = "edge-production-observability-node-with-a-very-long-hostname-01.internal.example";

function host(overrides: Partial<OverviewNode> = {}): OverviewNode {
  return {
    id: "node-1",
    name: longHostname,
    ip: "198.18.0.1",
    env: "生产",
    status: "健康",
    latency: "12ms",
    latencyStatus: "健康",
    cpu: "24%",
    memory: "48%",
    disk: "80%",
    version: "v1.0.0",
    uptime: "8 天",
    backup: "2 小时前",
    backupStatus: "健康",
    update: "已同步",
    owner: "平台团队",
    services: [{ id: "service-1", name: "Controller", target: "local", status: "健康", detail: "运行中" }],
    diskVolumes: [
      { label: "C:", mount: "C:\\", totalBytes: 200 * 1024 ** 3, usedBytes: 120 * 1024 ** 3, percent: 60 },
      { label: "D:", mount: "D:\\", totalBytes: 300 * 1024 ** 3, usedBytes: 280 * 1024 ** 3, percent: 93 },
    ],
    ...overrides,
  };
}

describe("hosts live monitoring page", () => {
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockClear();
    vi.mocked(fetchOverviewHealth).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a retryable initial error without fixture hosts", async () => {
    vi.mocked(fetchOverviewHealth).mockRejectedValue(new Error("Controller 暂不可用"));
    render(<HostsPage page="hosts" notify={notify} />);

    expect(await screen.findByText("Controller 暂不可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.getAllByText("实时采集失败，未显示示例主机")).toHaveLength(2);
    expect(screen.queryByText("panel-se-01")).not.toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("Controller 暂不可用", "danger");
  });

  it("polls silently every ten seconds and preserves the selected host by id", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchOverviewHealth)
      .mockResolvedValueOnce({ lastRefresh: "12:30:00", nodes: [host()] })
      .mockResolvedValueOnce({ lastRefresh: "12:30:10", nodes: [host({ cpu: "31%" })] })
      .mockResolvedValueOnce({ lastRefresh: "12:30:20", nodes: [] });

    render(<HostsPage page="hosts" notify={notify} />);
    await act(async () => undefined);
    fireEvent.click(screen.getAllByRole("button", { name: `查看主机 ${longHostname}` })[0]);
    expect(screen.getByRole("dialog", { name: longHostname })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(fetchOverviewHealth).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole("dialog", { name: longHostname })).getByText("31%")).toBeInTheDocument();
    expect(screen.getByText(/更新于 12:30:10/)).toBeInTheDocument();
    expect(notify).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog", { name: longHostname })).not.toBeInTheDocument();
  });

  it("contains long hostnames and exposes every disk volume in the table tooltip and drawer", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchOverviewHealth).mockResolvedValue({ lastRefresh: "12:30:00", nodes: [host()] });
    render(<HostsPage page="hosts" notify={notify} />);

    await screen.findAllByTitle(longHostname);
    const diskTooltips = screen.getAllByRole("tooltip");
    expect(diskTooltips[0]).toHaveTextContent("C: (C:\\)");
    expect(diskTooltips[0]).toHaveTextContent("60% · 已用 120.0 GB / 200.0 GB");
    expect(diskTooltips[0]).toHaveTextContent("D: (D:\\)");
    expect(diskTooltips[0]).toHaveTextContent("93% · 已用 280.0 GB / 300.0 GB");

    await user.click(screen.getAllByRole("button", { name: `查看主机 ${longHostname}` })[0]);
    const drawer = screen.getByRole("dialog", { name: longHostname });
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText("网络延迟")).toBeInTheDocument();
    expect(within(drawer).getByText("负责人")).toBeInTheDocument();
    expect(within(drawer).getByText("Controller")).toBeInTheDocument();
    expect(within(drawer).getByText("D:\\")).toBeInTheDocument();
  });

  it("keeps the production view scoped and shows all three resource measurements", async () => {
    vi.mocked(fetchOverviewHealth).mockResolvedValue({
      lastRefresh: "12:30:00",
      nodes: [host(), host({ id: "node-dev", name: "dev-node", env: "开发", ip: "198.18.0.2" })],
    });

    render(<HostsPage page="hosts-prod" notify={notify} />);

    await screen.findByText(/更新于 12:30:00/);
    expect(screen.queryByText("dev-node")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /环境/ })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /资源使用/ })).toBeInTheDocument();
    const resourceSummary = screen.getByLabelText("CPU 24%，内存 48%，磁盘 80%");
    expect(within(resourceSummary).getByText("CPU")).toBeInTheDocument();
    expect(within(resourceSummary).getByText("内存")).toBeInTheDocument();
    expect(within(resourceSummary).getByText("磁盘")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /刷新|重新采集|重新扫描/ })).not.toBeInTheDocument();
  });
});
