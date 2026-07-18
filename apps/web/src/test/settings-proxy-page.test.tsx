import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsProxyPage } from "../features/settings/SettingsProxyPage";

describe("settings proxy layout", () => {
  it("renders a complete route-scoped workbench without shared panel wrappers", () => {
    const { container } = render(
      <SettingsProxyPage
        page="settings-proxy"
        setPage={vi.fn()}
        notify={vi.fn()}
        readOnlyState={{ readOnly: false, setReadOnly: vi.fn() }}
      />,
    );

    expect(container.querySelector(".module-page-settings-proxy.settings-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "代理设置" })).toHaveClass("sr-only");
    expect(container.querySelector(".module-view-context")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "代理节点与路由" })).toBeInTheDocument();
    expect(screen.getByLabelText("代理状态概览")).toHaveTextContent("可用节点");
    expect(screen.getByLabelText("代理节点筛选")).toBeInTheDocument();
    expect(container.querySelector(".proxy-node-workbench .panel-card")).not.toBeInTheDocument();

    const lowerGrid = container.querySelector(".proxy-lower-grid");
    expect(lowerGrid).not.toBeNull();
    expect(within(lowerGrid as HTMLElement).getByText("代理路由规则")).toBeInTheDocument();
    expect(within(lowerGrid as HTMLElement).getByText("运行时策略")).toBeInTheDocument();
    expect(within(lowerGrid as HTMLElement).queryByText("代理路由规则")?.closest(".panel-card")).toBeNull();

    const rules = container.querySelectorAll(".proxy-rule-list article");
    expect(rules).toHaveLength(4);
    rules.forEach((rule) => {
      expect(rule.querySelector(".proxy-rule-target")).not.toBeNull();
      expect(rule.querySelector(".proxy-rule-note")).not.toBeNull();
      expect(rule.querySelector(".proxy-rule-route")).not.toBeNull();
      expect(rule.querySelector(".proxy-rule-action")).not.toBeNull();
    });

    expect(container.querySelectorAll(".proxy-policy-panel [role='switch']")).toHaveLength(3);
    expect(container.querySelector(".proxy-env-preview")).toHaveTextContent("HTTP_PROXY=");
    expect(container.querySelector(".proxy-env-preview")).toHaveTextContent("NO_PROXY=");
  });
});
