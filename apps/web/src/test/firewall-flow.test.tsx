import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FirewallPage } from "../pages/FirewallPage";

describe("firewall rule flow", () => {
  it("keeps an invalid rule in the drawer and explains both errors", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    render(<FirewallPage page="firewall" notify={notify} />);

    await user.click(screen.getByRole("button", { name: "新增规则" }));
    const drawer = screen.getByRole("region", { name: "新增规则" });
    await user.type(within(drawer).getByLabelText("端口"), "70000");
    await user.clear(within(drawer).getByLabelText("来源"));
    await user.type(within(drawer).getByLabelText("来源"), "999.1.1.1");
    await user.click(within(drawer).getByRole("button", { name: "保存规则" }));

    expect(screen.getByText("端口必须是 1-65535 的整数")).toBeInTheDocument();
    expect(screen.getByText("来源需填写 IPv4、CIDR 或 0.0.0.0/0")).toBeInTheDocument();
    expect(drawer).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("请修正防火墙规则表单", "danger");
  });
});
