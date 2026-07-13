import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilesPage } from "../pages/FilesPages";

const listPayload = { root: "/tmp/files", path: "/", collectedAt: "2026-07-14T00:00:00.000Z", entries: [{ id: "0123456789abcdef", name: "index.html", path: "/index.html", kind: "file", sizeBytes: 18, modifiedAt: "2026-07-14T00:00:00.000Z", owner: "uid:1000" }] };
function response(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }

describe("files browser page", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("loads backend files and sends a recoverable delete mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(listPayload)).mockResolvedValueOnce(response({ message: "文件项已移入回收站", trashEntry: { id: "11111111-1111-4111-8111-111111111111", name: "index.html", originalPath: "/index.html", kind: "file", sizeBytes: 18, deletedAt: "2026-07-14T00:00:00.000Z", expiresAt: "2026-07-21T00:00:00.000Z", owner: "uid:1000" } })).mockResolvedValueOnce(response({ ...listPayload, entries: [] }));
    vi.stubGlobal("fetch", fetchMock); const user = userEvent.setup(); const notify = vi.fn(); render(<FilesPage page="files" notify={notify} canWrite />);
    expect((await screen.findAllByText("index.html")).length).toBeGreaterThan(0); await user.click(screen.getAllByRole("button", { name: "删除 index.html 到回收站" })[0]);
    const dialog = screen.getByRole("dialog", { name: "移入回收站" }); await user.click(within(dialog).getByRole("button", { name: "确认移入" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/files/trash", expect.objectContaining({ method: "POST", body: JSON.stringify({ path: "/index.html" }) })));
    expect(notify).toHaveBeenCalledWith("文件项已移入回收站");
  });
  it("renders initial failures as errors without fixture fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: "目录不可读" }, 403))); render(<FilesPage page="files" notify={vi.fn()} canWrite={false} />);
    expect(await screen.findByRole("button", { name: "重试" })).toBeInTheDocument(); expect(screen.queryByText("index.html")).not.toBeInTheDocument();
  });
  it("hides stale parent entries while a child directory loads", async () => {
    let resolveChild!: (value: Response) => void; const child = new Promise<Response>((resolve) => { resolveChild = resolve; }); const folderPayload = { ...listPayload, entries: [{ id: "folder-id-012345", name: "logs", path: "/logs", kind: "directory", sizeBytes: null, modifiedAt: "2026-07-14T00:00:00.000Z", owner: "uid:1000" }, ...listPayload.entries] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(folderPayload)).mockReturnValueOnce(child)); const user = userEvent.setup(); render(<FilesPage page="files" notify={vi.fn()} canWrite />); await user.click((await screen.findAllByRole("button", { name: "logs" }))[0]); await waitFor(() => expect(screen.queryByText("index.html")).not.toBeInTheDocument()); expect(screen.queryByRole("button", { name: "删除 index.html 到回收站" })).not.toBeInTheDocument(); resolveChild(response({ ...listPayload, path: "/logs", entries: [] }));
  });
});
