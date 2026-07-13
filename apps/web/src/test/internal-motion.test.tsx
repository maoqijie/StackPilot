import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataTable } from "../components/ui/DataTable";
import { FieldSelect } from "../components/ui/FormControls";

const columns = [
  { key: "name", label: "名称", render: (row: { id: string; name: string }) => row.name, sortValue: (row: { id: string; name: string }) => row.name },
];

describe("internal motion", () => {
  it("animates table results only after an explicit sort interaction", async () => {
    const rows = [{ id: "2", name: "Beta" }, { id: "1", name: "Alpha" }];
    const view = render(<DataTable columns={columns} rows={rows} emptyText="无数据" getRowKey={(row) => row.id} />);
    const table = view.container.querySelector(".module-table-wrap");
    const initialBody = view.container.querySelector(".module-table-results");
    expect(table).toHaveAttribute("data-motion-revision", "0");

    view.rerender(<DataTable columns={columns} rows={[...rows].reverse()} emptyText="无数据" getRowKey={(row) => row.id} />);
    expect(view.container.querySelector(".module-table-results")).toBe(initialBody);
    expect(table).toHaveAttribute("data-motion-revision", "0");

    await userEvent.click(screen.getByRole("button", { name: "名称，未排序，点击切换排序" }));
    expect(table).toHaveAttribute("data-motion-revision", "1");
    expect(view.container.querySelector(".module-table-results")).toBe(initialBody);
    expect(initialBody).toHaveClass("is-interaction-entering");
  });

  it("opens selects with a named popover animation surface", () => {
    render(<FieldSelect label="状态" value="全部" options={["全部", "在线"]} onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("combobox", { name: /状态/ }));
    expect(screen.getByRole("listbox", { name: "状态" })).toHaveClass("popover-panel");
    expect(screen.getByRole("combobox", { name: /状态/ }).querySelector(".select-chevron")).toBeInTheDocument();
  });
});
