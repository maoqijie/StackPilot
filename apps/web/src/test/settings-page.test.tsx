import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsPage } from "../pages/SettingsPage";

function renderSettings(page: string, options: { readOnly?: boolean; permissions?: string[] } = {}) {
  const setPage = vi.fn();
  const notify = vi.fn();
  const setReadOnly = vi.fn();
  const result = render(
    <SettingsPage
      page={page}
      setPage={setPage}
      notify={notify}
      readOnlyState={{ readOnly: options.readOnly ?? false, setReadOnly }}
      permissions={options.permissions as never[] ?? []}
    />,
  );
  return { ...result, setPage, notify, setReadOnly };
}

describe("settings workbench", () => {
  it("uses the shared settings frame and keeps settings as the general route", () => {
    const { container, setPage } = renderSettings("settings");

    expect(screen.getByRole("heading", { name: "面板设置" })).toBeInTheDocument();
    expect(container.querySelector(".settings-page-content.settings-layout-general")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "设置分区" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "基础" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "安全" }));
    expect(setPage).toHaveBeenCalledWith("settings-security", { message: "已切换到安全设置", tone: "info" });
  });

  it("presents security settings in a stable two-section layout", () => {
    const { container } = renderSettings("settings-security");

    expect(screen.getByRole("heading", { name: "安全策略" })).toBeInTheDocument();
    expect(container.querySelector(".settings-layout-security")).toBeInTheDocument();
    expect(screen.getByText("安全设置")).toBeInTheDocument();
    expect(screen.getByText("安全验证")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "强制启用两步验证（2FA）" })).toHaveAttribute("aria-checked", "true");
  });

  it("communicates read-only state and disables destructive token actions", () => {
    const { container } = renderSettings("settings-general", { readOnly: true });

    expect(container.querySelector(".settings-mode-indicator")).toHaveTextContent("只读模式");
    expect(screen.getByRole("button", { name: "生成令牌" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "停用全部" })).toBeDisabled();
  });

  it("renders notification delivery status with text in addition to status lights", () => {
    const { container } = renderSettings("settings-notice");

    const delivery = screen.getByText("最近投递").closest(".notice-delivery-list");
    expect(container.querySelector(".settings-layout-notice > .notice-config-panel")).toBeInTheDocument();
    expect(container.querySelector(".settings-layout-notice > .notice-delivery-panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测试" })).toHaveClass("form-line-hint-button");
    expect(screen.getByRole("button", { name: "测试" }).closest(".form-line")).toHaveClass("has-hint-action");
    expect(delivery).not.toBeNull();
    expect(within(delivery as HTMLElement).getAllByText(/成功/).length).toBeGreaterThan(0);
    expect(within(delivery as HTMLElement).getByText(/重试中/)).toBeInTheDocument();
  });

  it("shows a clear backup permission state without fixture rows", () => {
    renderSettings("settings-backup", { permissions: [] });

    expect(screen.getByRole("status")).toHaveTextContent("系统备份不可用");
    expect(screen.getByText(/没有 system:backup 权限/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "创建系统备份" })).not.toBeInTheDocument();
  });

  it("keeps settings audit read-only and responsive-card ready", () => {
    const { container } = renderSettings("settings-audit");

    expect(screen.getByRole("heading", { name: "设置审计" })).toBeInTheDocument();
    expect(container.querySelector(".settings-audit-section .panel-card > header")).toHaveTextContent("最近配置变更");
    expect(container.querySelector(".settings-change-card-list")).toBeInTheDocument();
    expect(container.querySelector(".settings-layout-audit")).toBeInTheDocument();
  });
});
