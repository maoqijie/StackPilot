import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FileRecord, TrashFileRecord } from "../features/files/types";
import { initialFileRecords, initialTrashFiles } from "../mocks/demoData";
import { FilesPage } from "../pages/FilesPages";
import type { Notify } from "../types/app";

function FilesPageHarness({ notify = vi.fn() }: { notify?: Notify }) {
  const [rows, setRows] = useState<FileRecord[]>(initialFileRecords);
  const [, setTrashRows] = useState<TrashFileRecord[]>(initialTrashFiles);
  return <FilesPage page="files" notify={notify} rows={rows} setRows={setRows} setTrashRows={setTrashRows} />;
}

describe("files browser page", () => {
  it("opens the create drawer in a body portal without reserving a side column", async () => {
    const user = userEvent.setup();
    const { container } = render(<FilesPageHarness />);

    await user.click(screen.getByRole("button", { name: "创建文件夹" }));

    const drawer = screen.getByRole("dialog", { name: "创建文件夹" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("file-editor-drawer");
    expect(container.querySelector(".module-layout")).not.toHaveClass("has-side");
    await waitFor(() => expect(drawer).toHaveFocus());
  });

  it("confirms moving a file to the recoverable trash", async () => {
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    render(<FilesPageHarness notify={notify} />);

    await user.click(screen.getAllByRole("button", { name: "删除 index.html 到回收站" })[0]);
    const dialog = screen.getByRole("dialog", { name: "移入回收站" });
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByText("项目将保留在回收站 7 天，期间仍可恢复。")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "确认将 index.html 移入回收站" }));

    expect(screen.queryByText("index.html")).not.toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("index.html 已移入回收站", "warning");
  });
});
