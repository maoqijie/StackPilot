import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuditPage } from "../pages/AuditPage";

describe("audit failed page", () => {
  it("keeps the failed filter and opens the detail as a modal drawer", async () => {
    const user = userEvent.setup();
    render(<AuditPage page="audit-failed" notify={vi.fn()} permissions={["audit:read"]} />);

    expect(screen.getByRole("heading", { name: "失败操作" })).toBeInTheDocument();
    expect(screen.getAllByText("/tmp/old.log").length).toBeGreaterThan(0);
    expect(screen.queryByText("/api (sg-web-02)")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "详情" })[0]);

    const drawer = screen.getByRole("dialog", { name: "审计详情" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText(/执行 删除文件/)).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "关闭审计详情" })).toBeInTheDocument();
  });
});
