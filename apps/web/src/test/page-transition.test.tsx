import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commitPageUpdate } from "../app/pageTransition";
import { PageTransition } from "../components/layout/PageTransition";

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "startViewTransition");
  document.documentElement.classList.remove("supports-view-transitions");
});

describe("PageTransition", () => {
  it("animates only after the active page changes and can restart", () => {
    const view = render(<PageTransition page="overview">总览</PageTransition>);
    const surface = view.container.querySelector(".desktop-page-transition");

    expect(surface).not.toHaveClass("is-page-entering");

    view.rerender(<PageTransition page="overview">更新后的总览</PageTransition>);
    expect(surface).not.toHaveClass("is-page-entering");

    view.rerender(<PageTransition page="hosts">主机</PageTransition>);
    expect(surface).toHaveClass("is-page-entering");

    view.rerender(<PageTransition page="sites">站点</PageTransition>);
    expect(surface).toHaveClass("is-page-entering");
  });
});

describe("commitPageUpdate", () => {
  it("uses a native view transition when the browser supports it", () => {
    const update = vi.fn();
    const startViewTransition = vi.fn((callback: () => void) => {
      callback();
      return {} as ViewTransition;
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: startViewTransition });

    commitPageUpdate(update);

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.documentElement).toHaveClass("supports-view-transitions");
  });

  it("updates directly when native view transitions are unavailable", () => {
    const update = vi.fn();

    commitPageUpdate(update);

    expect(update).toHaveBeenCalledTimes(1);
  });
});
