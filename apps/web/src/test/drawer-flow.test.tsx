import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { DetailDrawer } from "../components/ui/DetailDrawer";

function DrawerFlow() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>查看详情</button>
      {open && <DetailDrawer title="主机详情" modal onClose={() => setOpen(false)}><button type="button">执行检查</button></DetailDrawer>}
    </div>
  );
}

describe("detail drawer flow", () => {
  it("opens as an accessible dialog and closes with Escape", async () => {
    vi.useFakeTimers();
    render(<DrawerFlow />);
    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));
    expect(screen.getByRole("dialog", { name: "主机详情" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "主机详情" })).toHaveAttribute("data-closing", "true");
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByRole("dialog", { name: "主机详情" })).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("closes immediately when reduced motion is requested", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    const user = userEvent.setup();
    render(<DrawerFlow />);
    await user.click(screen.getByRole("button", { name: "查看详情" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "主机详情" })).not.toBeInTheDocument();
    window.matchMedia = originalMatchMedia;
  });
});
