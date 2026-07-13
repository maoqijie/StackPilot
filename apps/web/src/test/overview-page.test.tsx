import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOverview } from "../api/overviewApi";
import { OverviewPage } from "../pages/OverviewPage";

vi.mock("../api/overviewApi", () => ({
  checkOverviewUpdates: vi.fn(),
  fetchOverview: vi.fn(),
}));

describe("overview page layout", () => {
  beforeEach(() => {
    vi.mocked(fetchOverview).mockReset();
  });

  it("removes the standalone freshness header without removing the page heading", () => {
    vi.mocked(fetchOverview).mockReturnValue(new Promise(() => undefined));

    const { container } = render(<OverviewPage setPage={vi.fn()} notify={vi.fn()} />);
    const heading = screen.getByRole("heading", { name: "工作台" });
    const page = heading.closest(".overview-page");

    expect(heading).toHaveClass("sr-only");
    expect(container.querySelector(".overview-page-head")).not.toBeInTheDocument();
    expect(container.querySelector(".overview-freshness")).not.toBeInTheDocument();
    expect(page?.children[0]).toBe(heading);
    expect(page?.children[1]).toHaveClass("workbench-hero");
  });
});
