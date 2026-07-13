import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileUploadQueuePage } from "../pages/FilesPages";

describe("files upload page", () => {
  it("creates an upload through a modal and opens its detail in a body-level drawer", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    render(<FileUploadQueuePage page="files-upload" notify={notify} />);

    await user.click(screen.getByRole("button", { name: "添加上传" }));
    const modal = screen.getByRole("dialog", { name: "添加上传" });
    expect(modal.parentElement).toBe(document.body);
    await waitFor(() => expect(modal).toHaveFocus());

    await user.click(within(modal).getByRole("button", { name: "加入队列" }));
    expect(within(modal).getByRole("alert")).toHaveTextContent("请选择需要上传的文件");

    const file = new File(["release"], "release-with-a-long-descriptive-name.zip", { type: "application/zip" });
    await user.upload(within(modal).getByLabelText("本地文件"), file);
    const target = within(modal).getByLabelText("目标路径");
    await user.clear(target);
    await user.type(target, "/srv/releases");
    await user.click(within(modal).getByRole("button", { name: "加入队列" }));

    const drawer = screen.getByRole("dialog", { name: "上传详情" });
    expect(drawer).toHaveClass("upload-detail-drawer");
    expect(drawer.parentElement).toBe(document.body);
    expect(within(drawer).getByText(file.name)).toBeInTheDocument();
    expect(within(drawer).getByText("/srv/releases")).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith(`${file.name} 已加入上传队列`, "info");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "上传详情" })).not.toBeInTheDocument();
  });
});
