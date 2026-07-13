import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilesBrowserPage } from "../features/files/FilesBrowserPage";
import type { Notify } from "../types/app";

const listPayload={rootPath:"/var/www",path:"/var/www",parentPath:null,entries:[{id:"entry-index",name:"index.html",kind:"file",path:"/var/www/index.html",parentPath:"/var/www",sizeBytes:12,modifiedAt:"2026-07-13T12:00:00.000Z",owner:"www-data"}],collectedAt:"2026-07-13T12:00:00.000Z",writable:true};
function FilesPageHarness({notify=vi.fn()}:{notify?:Notify}){return <FilesBrowserPage page="files-www" notify={notify} permissions={["files:read","files:manage"]}/>;}
afterEach(()=>vi.unstubAllGlobals());

describe("files browser page", () => {
  it("opens the create drawer in a body portal without reserving a side column", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify(listPayload),{status:200,headers:{"Content-Type":"application/json"}})));
    const user = userEvent.setup();
    const { container } = render(<FilesPageHarness />);

    await user.click(screen.getByRole("button", { name: "创建文件夹" }));

    const drawer = screen.getByRole("dialog", { name: "创建文件夹" });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer).toHaveClass("file-editor-drawer");
    expect(container.querySelector(".module-layout")).not.toHaveClass("has-side");
    await waitFor(() => expect(drawer).toHaveFocus());
  });

  it("renders a canonical backend path for an aliased requested root", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...listPayload,
      path:"/private/var/www",
      entries:[{...listPayload.entries[0],path:"/private/var/www/index.html",parentPath:"/private/var/www"}],
    }),{status:200,headers:{"Content-Type":"application/json"}})));

    render(<FilesPageHarness />);

    expect((await screen.findAllByText("index.html")).length).toBeGreaterThan(0);
    expect(screen.getByText("/private/var/www/index.html")).toBeInTheDocument();
    expect(screen.getByText("/var/www",{selector:"strong"})).toBeInTheDocument();
    expect(screen.queryByText("正在读取目录")).not.toBeInTheDocument();
  });

  it("confirms moving a file to the recoverable trash", async () => {
    const fetchMock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(listPayload),{status:200,headers:{"Content-Type":"application/json"}})).mockResolvedValueOnce(new Response(JSON.stringify({message:"index.html 已移入回收站",entry:null}),{status:200,headers:{"Content-Type":"application/json"}})).mockResolvedValueOnce(new Response(JSON.stringify({...listPayload,entries:[]}),{status:200,headers:{"Content-Type":"application/json"}}));vi.stubGlobal("fetch",fetchMock);
    const user = userEvent.setup();
    const notify = vi.fn<Notify>();
    render(<FilesPageHarness notify={notify} />);

    await user.click(await screen.findByRole("button", { name: "删除 index.html 到回收站" }));
    const dialog = screen.getByRole("dialog", { name: "移入回收站" });
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByText("项目将从当前目录移入服务器隔离回收区。")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "确认将 index.html 移入回收站" }));

    expect(screen.queryByText("index.html")).not.toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("index.html 已移入回收站", "warning");
  });

  it("does not offer mutations for symbolic links rejected by the backend", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...listPayload,
      entries:[{...listPayload.entries[0],id:"entry-link",name:"current",kind:"symlink",path:"/var/www/current",sizeBytes:null}],
    }),{status:200,headers:{"Content-Type":"application/json"}})));

    render(<FilesPageHarness />);

    expect(await screen.findByRole("button",{name:"重命名 current"})).toBeDisabled();
    expect(screen.getByRole("button",{name:"删除 current 到回收站"})).toBeDisabled();
  });
});
