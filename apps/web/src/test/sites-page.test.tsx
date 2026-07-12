import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SitesPage } from "../pages/SitesPage";

describe("sites page", () => {
  it("uses semantic status labels and does not expose a fake refresh action", () => {
    render(<SitesPage page="sites" notify={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
    expect(screen.getAllByText("运行中").length).toBeGreaterThan(0);
    expect(screen.getAllByText("告警").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("api.stackpilot.local")[0]).toHaveTextContent("api.stackpilot.local");
  });

  it("includes warning sites in the default running view", () => {
    render(<SitesPage page="sites-running" notify={vi.fn()} />);

    expect(screen.getAllByText("告警").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("admin.example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("等待接入采集")).toBeInTheDocument();
    expect(screen.getByText("活跃站点")).toBeInTheDocument();
    expect(screen.queryByTitle("docs.example.com")).not.toBeInTheDocument();
  });

  it("opens logs in a body-level detail surface and preserves the active search", async () => {
    const user = userEvent.setup();
    render(<SitesPage page="sites" notify={vi.fn()} />);
    const search = screen.getByPlaceholderText("搜索域名、上游或负责人");

    await user.type(search, "api.stackpilot.local");
    await user.click(screen.getAllByRole("button", { name: "查看网站 api.stackpilot.local 日志" })[0]);

    const drawer = screen.getByRole("region", { name: "访问日志" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("site-log-drawer");
    expect(within(drawer).getByText("api.stackpilot.local")).toBeInTheDocument();
    expect(search).toHaveValue("api.stackpilot.local");
  });

  it("presents the certificate queue as a focused risk workflow", async () => {
    const user = userEvent.setup();
    render(<SitesPage page="sites-cert" notify={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加网站" })).not.toBeInTheDocument();
    expect(screen.getByText("等待接入采集")).toBeInTheDocument();
    expect(screen.getAllByText("紧急").length).toBeGreaterThan(0);
    expect(screen.getAllByText("临近到期").length).toBeGreaterThan(0);
    const desktopRows = screen.getByRole("table").querySelectorAll("tbody tr");
    expect(desktopRows[0]).toHaveTextContent("admin.example.com");
    expect(desktopRows[1]).toHaveTextContent("shop.example.com");

    await user.click(screen.getAllByRole("button", { name: "查看 admin.example.com 的证书详情" })[0]);
    const drawer = screen.getByRole("region", { name: "证书详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText("证书剩余 4 天")).toBeInTheDocument();
    expect(within(drawer).getByText("手动确认")).toBeInTheDocument();
  });

  it("presents runtime health with text and opens complete group details", async () => {
    const user = userEvent.setup();
    render(<SitesPage page="sites-runtime" notify={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
    expect(screen.getByText("数据来源：当前站点清单")).toBeInTheDocument();
    expect(screen.getByText("实时采集尚未接入，页面不会显示虚假的刷新时间。")).toBeInTheDocument();
    expect(screen.getAllByText("健康").length).toBeGreaterThan(0);
    expect(screen.getAllByText("告警").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "查看 Node 20 运行时详情" }));
    const drawer = screen.getByRole("region", { name: "Node 20" });
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText("容量与风险")).toBeInTheDocument();
    expect(within(drawer).getByText("站点实例")).toBeInTheDocument();
    expect(within(drawer).getByText("api.stackpilot.local")).toBeInTheDocument();
  });
});
