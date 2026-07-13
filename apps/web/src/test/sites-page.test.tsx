import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSites } from "../api/sitesApi";
import type { SiteRuntimePayload, SiteRuntimeRecord } from "../api/sitesApi";
import { SitesPage } from "../pages/SitesPage";

vi.mock("../api/sitesApi", () => ({ fetchSites: vi.fn() }));

const collectedAt = "2026-07-13T12:30:00.000Z";

function site(overrides: Partial<SiteRuntimeRecord> = {}): SiteRuntimeRecord {
  return {
    id: "site-api",
    domain: "api.example.com",
    status: "running",
    runtime: "反向代理",
    host: "controller-01",
    upstream: "http://127.0.0.1:3000",
    source: "Nginx · api.conf",
    latencyMs: 38,
    certificateExpiresAt: "2026-09-10T00:00:00.000Z",
    certificateIssuer: "Let's Encrypt",
    trafficBytes: null,
    ...overrides,
  };
}

function payload(sites: SiteRuntimeRecord[], overrides: Partial<SiteRuntimePayload> = {}): SiteRuntimePayload {
  return { collectedAt, collectionStatus: "complete", warnings: [], sites, ...overrides };
}

describe("sites live monitoring page", () => {
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockClear();
    vi.mocked(fetchSites).mockReset();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  it("shows an initial error and retries without falling back to demo sites", async () => {
    vi.mocked(fetchSites)
      .mockRejectedValueOnce(new Error("站点采集不可用"))
      .mockResolvedValueOnce(payload([site()]));

    render(<SitesPage page="sites" notify={notify} />);
    expect(await screen.findByText("站点采集不可用")).toBeInTheDocument();
    expect(screen.getAllByText("实时采集失败，未显示示例站点")).toHaveLength(2);
    expect(screen.queryByText("api.stackpilot.local")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect((await screen.findAllByTitle("api.example.com")).length).toBeGreaterThan(0);
    expect(notify).toHaveBeenCalledWith("站点采集不可用", "danger");
  });

  it("polls every ten seconds, keeps filters, and retains data after a background failure", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchSites)
      .mockResolvedValueOnce(payload([site(), site({ id: "site-admin", domain: "admin.example.com" })]))
      .mockResolvedValueOnce(payload([site({ latencyMs: 64 }), site({ id: "site-admin", domain: "admin.example.com" })], { collectedAt: "2026-07-13T12:30:10.000Z" }))
      .mockRejectedValueOnce(new Error("瞬时失败"));

    render(<SitesPage page="sites-running" notify={notify} />);
    await act(async () => undefined);
    const search = screen.getByPlaceholderText("搜索域名、上游、主机或数据源");
    fireEvent.change(search, { target: { value: "api.example.com" } });
    expect(screen.queryByTitle("admin.example.com")).not.toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve(); });
    expect(fetchSites).toHaveBeenCalledTimes(2);
    expect(search).toHaveValue("api.example.com");
    expect(screen.getAllByText("64ms").length).toBeGreaterThan(0);

    await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve(); });
    expect(fetchSites).toHaveBeenCalledTimes(3);
    expect(screen.getAllByText("64ms").length).toBeGreaterThan(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("shows backend freshness and labels unknown or missing measurements as unavailable", async () => {
    vi.mocked(fetchSites).mockResolvedValue(payload([site({
      status: "unknown",
      upstream: null,
      latencyMs: null,
      certificateExpiresAt: null,
      certificateIssuer: null,
      trafficBytes: null,
    })], { collectionStatus: "partial", warnings: ["证书探测不完整"] }));

    render(<SitesPage page="sites" notify={notify} />);
    expect((await screen.findAllByText("待采集")).length).toBeGreaterThan(0);
    expect(screen.getByText(/部分采集 · 后端采集于/)).toBeInTheDocument();
    expect(screen.getByText(/证书探测不完整/)).toBeInTheDocument();
    expect(screen.getAllByText("暂不可用").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /刷新|添加|启动|停止|续期/ })).not.toBeInTheDocument();
  });

  it("derives an open runtime detail from the latest polling snapshot", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchSites)
      .mockResolvedValueOnce(payload([site()]))
      .mockResolvedValueOnce(payload([site({ latencyMs: 91, source: "Nginx · refreshed.conf" })], { collectedAt: "2026-07-13T12:30:10.000Z" }))
      .mockResolvedValueOnce(payload([], { collectedAt: "2026-07-13T12:30:20.000Z" }));

    render(<SitesPage page="sites-runtime" notify={notify} />);
    await act(async () => undefined);
    expect(document.querySelector(".page-head")).not.toBeInTheDocument();
    expect(document.querySelector(".module-view-context")).not.toBeInTheDocument();
    expect(screen.queryByText("服务容量视图")).not.toBeInTheDocument();
    expect(screen.queryByText(/数据来源：/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看 反向代理 服务详情" }));
    const drawer = screen.getByRole("region", { name: "反向代理" });
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getAllByText(/38ms/).length).toBeGreaterThan(0);

    await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve(); });
    expect(within(drawer).getAllByText(/91ms/).length).toBeGreaterThan(0);
    expect(within(drawer).getByText(/refreshed\.conf/)).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve(); });
    expect(screen.queryByRole("region", { name: "反向代理" })).not.toBeInTheDocument();
  });

  it("pauses polling while hidden and refreshes immediately when visible again", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchSites).mockResolvedValue(payload([site()]));
    render(<SitesPage page="sites" notify={notify} />);
    await act(async () => undefined);

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(fetchSites).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
    expect(fetchSites).toHaveBeenCalledTimes(2);
  });
});
