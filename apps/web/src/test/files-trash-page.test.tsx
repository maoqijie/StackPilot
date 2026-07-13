import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrashPayload } from "../api/filesApi";
import { FileTrashPage } from "../pages/FilesPages";
import type { Notify } from "../types/app";

const filesApi = vi.hoisted(() => ({ fetchFileTrash: vi.fn(), restoreTrashEntry: vi.fn(), purgeTrashEntry: vi.fn(), purgeFileTrash: vi.fn() }));
vi.mock("../api/filesApi", () => filesApi);

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const payload: TrashPayload = {
  entries: [
    { id: firstId, name: "old-error.log", kind: "file", originalPath: "/tmp/old-error.log", sizeBytes: 32768, deletedAt: "2026-07-14T01:42:00.000Z", expiresAt: "2026-07-21T01:42:00.000Z", owner: "root", reason: "日志轮转清理" },
    { id: secondId, name: "old-cache", kind: "directory", originalPath: "/tmp/old-cache", sizeBytes: null, deletedAt: "2026-07-13T01:42:00.000Z", expiresAt: "2026-07-20T01:42:00.000Z", owner: "www-data", reason: "缓存过期" },
  ],
  recentlyRestored: [], retentionDays: 7, collectedAt: "2026-07-14T02:00:00.000Z",
};

describe("files trash page", () => {
  beforeEach(() => { vi.clearAllMocks(); filesApi.fetchFileTrash.mockResolvedValue(payload); });

  it("loads backend rows and opens details in a body-level drawer", async () => {
    const user = userEvent.setup();
    render(<FileTrashPage page="files-trash" notify={vi.fn()} />);
    expect(await screen.findByText("后端采集时间 2026/7/14 10:00:00")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "old-error.log" })[0]);
    const drawer = screen.getByRole("dialog", { name: "删除详情" });
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText("/tmp/old-error.log")).toBeInTheDocument();
  });

  it("restores only after the backend succeeds", async () => {
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    const restored = { ...payload, entries: payload.entries.slice(1), recentlyRestored: [{ id: firstId, name: "old-error.log", originalPath: "/tmp/old-error.log", restoredAt: "2026-07-14T02:10:00.000Z", restoredBy: "admin" }] };
    filesApi.restoreTrashEntry.mockResolvedValue({ message: "old-error.log 已恢复", trash: restored });
    render(<FileTrashPage page="files-trash" notify={notify} />);
    await screen.findByText("后端采集时间 2026/7/14 10:00:00");
    await user.click(screen.getAllByRole("button", { name: "恢复 old-error.log" })[0]);
    await waitFor(() => expect(filesApi.restoreTrashEntry).toHaveBeenCalledWith(firstId));
    expect(screen.queryByRole("button", { name: "old-error.log" })).not.toBeInTheDocument();
    expect(screen.getByText("old-error.log")).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("old-error.log 已恢复");
  });

  it("keeps rows when permanent deletion fails", async () => {
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    filesApi.purgeTrashEntry.mockRejectedValue(new Error("后端拒绝删除"));
    render(<FileTrashPage page="files-trash" notify={notify} />);
    await screen.findByText("后端采集时间 2026/7/14 10:00:00");
    await user.click(screen.getAllByRole("button", { name: "永久删除 old-error.log" })[0]);
    await user.click(within(screen.getByRole("alertdialog", { name: "永久删除文件" })).getByRole("button", { name: "永久删除" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("后端拒绝删除", "danger"));
    await user.click(within(screen.getByRole("alertdialog", { name: "永久删除文件" })).getByRole("button", { name: "取消" }));
    expect(screen.getAllByRole("button", { name: "old-error.log" })).toHaveLength(2);
  });

  it("shows initial-load errors and retries", async () => {
    const user = userEvent.setup();
    filesApi.fetchFileTrash.mockRejectedValueOnce(new Error("后端不可用")).mockResolvedValueOnce(payload);
    render(<FileTrashPage page="files-trash" notify={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("后端不可用");
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("后端采集时间 2026/7/14 10:00:00")).toBeInTheDocument();
  });
});
