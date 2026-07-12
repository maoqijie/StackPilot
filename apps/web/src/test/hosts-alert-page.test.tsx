import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOverviewHealth, type OverviewNode } from "../api/overviewApi";
import { HostsPage } from "../pages/HostsPage";

vi.mock("../api/overviewApi", () => ({ fetchOverviewHealth: vi.fn() }));

const longHostname = "edge-production-observability-node-with-a-very-long-hostname-01.internal.example";
const alertNode: OverviewNode = {
  id: "node-alert-1",
  name: longHostname,
  ip: "198.18.0.23",
  env: "生产",
  status: "警告",
  latency: "82ms",
  latencyStatus: "警告",
  cpu: "74%",
  memory: "83%",
  disk: "68%",
  version: "v0.2.0",
  uptime: "18 天",
  backup: "昨天 02:18",
  backupStatus: "警告",
  update: "可更新 1",
  owner: "平台团队",
  diskVolumes: [{ label: "data", mount: "/data", totalBytes: 200_000_000_000, usedBytes: 136_000_000_000, percent: 68 }],
  services: [{ id: "service-1", name: "Controller", target: "local", status: "警告", detail: "延迟升高" }],
};

describe("hosts alert page", () => {
  beforeEach(() => {
    vi.mocked(fetchOverviewHealth).mockReset();
    vi.mocked(fetchOverviewHealth).mockResolvedValue({ nodes: [alertNode], lastRefresh: "12:30:00" });
  });

  afterEach(() => vi.useRealTimers());

  it("uses backend freshness and keeps manual collection actions out of the workbench", async () => {
    render(<HostsPage page="hosts-alert" notify={vi.fn()} />);

    expect(await screen.findByText("采集于 12:30:00")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "健康告警" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /新增主机|刷新|重新采集|重新扫描/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "主机告警队列" })).toBeInTheDocument();
  });

  it("opens complete long-hostname details and preserves the selected ID after polling", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<HostsPage page="hosts-alert" notify={vi.fn()} />);
    await act(async () => undefined);

    await user.click(screen.getAllByRole("button", { name: `查看主机 ${longHostname}` })[0]);
    const drawer = screen.getByRole("dialog", { name: longHostname });
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText("运行时间")).toBeInTheDocument();
    expect(within(drawer).getByText("负责人")).toBeInTheDocument();
    expect(within(drawer).getByText("磁盘卷")).toBeInTheDocument();
    expect(within(drawer).getByText("服务实例")).toBeInTheDocument();

    vi.mocked(fetchOverviewHealth).mockResolvedValue({ nodes: [{ ...alertNode, latency: "79ms" }], lastRefresh: "12:30:10" });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog", { name: longHostname })).toBeInTheDocument();
    expect(screen.getAllByText("采集于 12:30:10")).toHaveLength(2);
  });
});
