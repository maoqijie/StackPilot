import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewHealthPage } from "../pages/OverviewHealthPage";
import { fetchOverviewHealth } from "../api/overviewApi";

vi.mock("../api/overviewApi", () => ({
  fetchOverviewHealth: vi.fn(),
  refreshOverviewHealth: vi.fn(),
}));

describe("overview health API states", () => {
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockClear();
    vi.mocked(fetchOverviewHealth).mockReset();
  });

  it("announces loading while the API request is pending", () => {
    vi.mocked(fetchOverviewHealth).mockReturnValue(new Promise(() => undefined));
    render(<OverviewHealthPage notify={notify} />);
    expect(screen.getByText("正在从 /api/overview/health 实时采集节点状态")).toBeInTheDocument();
    expect(screen.getAllByText("正在采集节点状态")).toHaveLength(2);
  });

  it("shows a retryable error without injecting fixture rows", async () => {
    vi.mocked(fetchOverviewHealth).mockRejectedValue(new Error("Controller 暂不可用"));
    render(<OverviewHealthPage notify={notify} />);
    expect(await screen.findByText("Controller 暂不可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.getAllByText("实时采集失败，未显示示例节点")).toHaveLength(2);
    expect(notify).toHaveBeenCalledWith("Controller 暂不可用", "danger");
  });
});
