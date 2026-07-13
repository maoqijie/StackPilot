import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileUploadQueuePage } from "../pages/FilesPages";

const empty = { uploads: [], collectedAt: "2026-07-14T00:00:00.000Z", maxUploadBytes: 1024 };
describe("files upload page", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uploads the selected bytes to the real endpoint", async () => {
    const upload = { id: "11111111-1111-4111-8111-111111111111", name: "release.zip", targetPath: "/", sizeBytes: 7, status: "completed", owner: "Admin", startedAt: "2026-07-14T00:00:00.000Z", completedAt: "2026-07-14T00:00:01.000Z", error: null };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(empty), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ message: "release.zip 上传完成", upload, entry: { id: "0123456789abcdef", name: "release.zip", path: "/release.zip", kind: "file", sizeBytes: 7, modifiedAt: "2026-07-14T00:00:01.000Z", owner: "uid:1000" } }), { status: 201 })).mockResolvedValueOnce(new Response(JSON.stringify({ ...empty, uploads: [upload] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock); const user = userEvent.setup(); render(<FileUploadQueuePage page="files-upload" notify={vi.fn()} canWrite />); expect((await screen.findAllByText("还没有真实上传记录")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "添加上传" })); const dialog = screen.getByRole("dialog", { name: "添加上传" }); const input = within(dialog).getByText("本地文件").closest("label")?.querySelector("input"); expect(input).toBeInstanceOf(HTMLInputElement); await user.upload(input as HTMLInputElement, new File(["release"], "release.zip")); await user.click(within(dialog).getByRole("button", { name: "开始上传" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/file-uploads", expect.objectContaining({ method: "POST", body: expect.any(File) })));
  });
});
