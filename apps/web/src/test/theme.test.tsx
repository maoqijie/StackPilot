import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "../theme/ThemeProvider";
import { THEME_STORAGE_KEY, useTheme } from "../theme/theme";

function ThemeHarness() {
  const { theme, toggleTheme } = useTheme();
  return <button type="button" onClick={toggleTheme}>{theme}</button>;
}

describe("theme provider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("defaults invalid or missing storage to light", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    render(<ThemeProvider><ThemeHarness /></ThemeProvider>);
    expect(screen.getByRole("button")).toHaveTextContent("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("restores, toggles, and persists a valid theme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeProvider><ThemeHarness /></ThemeProvider>);
    expect(screen.getByRole("button")).toHaveTextContent("dark");
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
