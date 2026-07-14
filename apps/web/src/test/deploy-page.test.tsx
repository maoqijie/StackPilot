import { fireEvent, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployPage } from "../pages/DeployPage";

describe("deploy staging page", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the create task modal through the body portal and inert the page", () => {
    vi.useFakeTimers();
    render(<DeployPage page="deploy-staging" notify={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "创建部署任务" }));

    const dialog = screen.getByRole("dialog", { name: "创建部署任务" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("deploy-create-drawer");
    expect(document.querySelector(".module-main")).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "创建并运行" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "关闭详情" }));
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByRole("dialog", { name: "创建部署任务" })).not.toBeInTheDocument();
  });
});
