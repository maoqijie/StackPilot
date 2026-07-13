import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileUploadQueuePage } from "../features/files/FileUploadQueuePage";

const now = "2026-07-14T00:00:00.000Z";
const record = (status: "waiting" | "uploading" | "completed", receivedBytes: number) => ({
  id: "11111111-1111-4111-8111-111111111111", fileName: "release.zip", targetDirectory: "releases",
  targetPath: "releases/release.zip", sizeBytes: 7, receivedBytes, status, owner: "Administrator",
  contentType: "application/zip", sha256: status === "completed" ? "a".repeat(64) : null,
  errorMessage: null, createdAt: now, updatedAt: now, completedAt: status === "completed" ? now : null,
});

describe("files upload page", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("loads the real queue and completes a chunked upload through the backend API", async () => {
    const notify = vi.fn();
    const responses = [
      new Response(JSON.stringify({ uploads: [], collectedAt: now, maxFileBytes: 100, chunkBytes: 8 }), { status: 200 }),
      new Response(JSON.stringify({ upload: record("waiting", 0) }), { status: 201 }),
      new Response(JSON.stringify({ upload: record("waiting", 7), nextOffset: 7 }), { status: 200 }),
      new Response(JSON.stringify({ upload: record("completed", 7) }), { status: 200 }),
    ];
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FileUploadQueuePage page="files-upload" notify={notify} />);

    await screen.findByRole("button", { name: "添加上传" });
    expect(screen.getAllByText("没有真实上传任务")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "添加上传" }));
    const modal = screen.getByRole("dialog", { name: "添加上传" });
    expect(modal.parentElement).toBe(document.body);
    await user.click(within(modal).getByRole("button", { name: "开始上传" }));
    expect(within(modal).getByRole("alert")).toHaveTextContent("请选择需要上传的文件");

    const file = new File(["release"], "release.zip", { type: "application/zip" });
    await user.upload(within(modal).getByLabelText("本地文件"), file);
    await user.click(within(modal).getByRole("button", { name: "开始上传" }));

    const drawer = await screen.findByRole("dialog", { name: "上传详情" });
    await waitFor(() => expect(within(drawer).getByText("已完成")).toBeInTheDocument());
    expect(within(drawer).getByText("releases/release.zip")).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("release.zip 已上传并校验完成");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/file-uploads", "/api/file-uploads", "/api/file-uploads/11111111-1111-4111-8111-111111111111/chunks",
      "/api/file-uploads/11111111-1111-4111-8111-111111111111/complete",
    ]);
    const chunkRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(chunkRequest.headers).toMatchObject({ "Content-Type": "application/octet-stream", "Upload-Offset": "0" });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "上传详情" })).not.toBeInTheDocument();
  });

  it("does not start a second transfer for the same upload", async () => {
    let resolveChunk: ((response: Response) => void) | undefined;
    const chunkResponse = new Promise<Response>((resolve) => { resolveChunk = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ uploads: [], collectedAt: now, maxFileBytes: 100, chunkBytes: 8 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ upload: record("waiting", 0) }), { status: 201 }))
      .mockReturnValueOnce(chunkResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify({ upload: record("completed", 7) }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<FileUploadQueuePage page="files-upload" notify={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "添加上传" }));
    const createDialog = screen.getByRole("dialog", { name: "添加上传" });
    await user.upload(within(createDialog).getByLabelText("本地文件"), new File(["release"], "release.zip", { type: "application/zip" }));
    await user.click(within(createDialog).getByRole("button", { name: "开始上传" }));
    const detail = await screen.findByRole("dialog", { name: "上传详情" });
    const resume = within(detail).getByRole("button", { name: "继续上传" });
    await user.click(resume);
    await user.click(resume);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    resolveChunk?.(new Response(JSON.stringify({ upload: record("waiting", 7), nextOffset: 7 }), { status: 200 }));
    await waitFor(() => expect(within(detail).getByText("已完成")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
