import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { initialTrashFiles } from "../mocks/demoData";
import { FileTrashPage } from "../pages/FilesPages";
import type { FileRecord, TrashFileRecord } from "../features/files/types";
import type { Notify } from "../types/app";

function TrashPageHarness({ notify }: { notify: Notify }) {
  const [trashRows, setTrashRows] = useState<TrashFileRecord[]>(initialTrashFiles);
  const [restoredRows, setRestoredRows] = useState<FileRecord[]>([]);
  const [, setFiles] = useState<FileRecord[]>([]);
  return (
    <FileTrashPage
      page="files-trash"
      notify={notify}
      trashRows={trashRows}
      setTrashRows={setTrashRows}
      restoredRows={restoredRows}
      setRestoredRows={setRestoredRows}
      setFiles={setFiles}
    />
  );
}

describe("files trash page", () => {
  it("opens details in a body-level modal drawer", async () => {
    const user = userEvent.setup();
    render(<TrashPageHarness notify={vi.fn()} />);

    await user.click(screen.getAllByRole("button", { name: "old-error.log" })[0]);

    const drawer = screen.getByRole("dialog", { name: "删除详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("trash-detail-drawer");
    expect(within(drawer).getByText("/tmp/old-error.log")).toBeInTheDocument();
  });

  it("requires confirmation before permanently deleting a file", async () => {
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    render(<TrashPageHarness notify={notify} />);

    await user.click(screen.getAllByRole("button", { name: "永久删除 old-error.log" })[0]);
    const dialog = screen.getByRole("alertdialog", { name: "永久删除文件" });
    expect(screen.getAllByText("old-error.log").length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole("button", { name: "永久删除" }));

    expect(screen.queryByText("old-error.log")).not.toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("old-error.log 已永久删除", "danger");
  });

  it("cancels clearing the trash without removing files", async () => {
    const user = userEvent.setup();
    render(<TrashPageHarness notify={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "清空回收站" }));
    const dialog = screen.getByRole("alertdialog", { name: "清空回收站" });
    expect(within(dialog).getByText(/3 个文件/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "取消" }));

    expect(screen.getAllByRole("button", { name: "old-error.log" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "old-cache.tar" })).toHaveLength(2);
  });
});
