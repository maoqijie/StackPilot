import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseBackupsPayload } from "@stackpilot/contracts";
import { DatabaseBackupsPage } from "../pages/DatabaseBackupsPage";
import { createDatabaseBackup, fetchDatabaseBackups, verifyDatabaseBackup } from "../api/databaseBackupsApi";
import { reauthenticate } from "../api/identityApi";

vi.mock("../api/databaseBackupsApi", () => ({
  fetchDatabaseBackups: vi.fn(),
  createDatabaseBackup: vi.fn(),
  verifyDatabaseBackup: vi.fn(),
  drillDatabaseBackup: vi.fn(),
}));
vi.mock("../api/identityApi", () => ({ reauthenticate: vi.fn() }));

const payload: DatabaseBackupsPayload = {
  collectedAt: "2026-07-14T06:00:00.000Z",
  source: { id: "controller-sqlite", name: "StackPilot Controller", engine: "SQLite", schemaVersion: 5, sizeBytes: 8_388_608, target: "backups" },
  backups: [{
    id: "a".repeat(64), fileName: "stackpilot-20260714T055500Z.sqlite3", storage: "本地 / backups",
    createdAt: "2026-07-14T05:55:00.000Z", sizeBytes: 7_340_032, checksumStatus: "pending", drillStatus: "not_started", drilledAt: null,
  }],
  warnings: [],
};

describe("database backups workbench", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchDatabaseBackups).mockResolvedValue(payload);
  });

  it("renders backend timestamps and real backup files without a manual refresh", async () => {
    render(<DatabaseBackupsPage page="databases-backups" notify={vi.fn()} />);
    expect((await screen.findAllByText("stackpilot-20260714T055500Z.sqlite3")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("7.0 MB").length).toBeGreaterThan(0);
    expect(screen.getAllByText("待校验").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
  });

  it("shows a retryable error without falling back to fixtures", async () => {
    vi.mocked(fetchDatabaseBackups).mockRejectedValueOnce(new Error("backup api offline")).mockResolvedValue(payload);
    const user = userEvent.setup();
    render(<DatabaseBackupsPage page="databases-backups" notify={vi.fn()} />);
    expect(await screen.findByText("backup api offline")).toBeInTheDocument();
    expect(screen.queryByText(/生产 PostgreSQL/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect((await screen.findAllByText("stackpilot-20260714T055500Z.sqlite3")).length).toBeGreaterThan(0);
  });

  it("creates an online backup only after reauthentication", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    vi.mocked(reauthenticate).mockResolvedValue({ proof: "proof-value-with-more-than-thirty-two-characters", expiresAt: "2026-07-14T06:05:00.000Z" });
    vi.mocked(createDatabaseBackup).mockResolvedValue({ backup: payload.backups[0], message: "在线备份完成", tone: "success" });
    render(<DatabaseBackupsPage page="databases-backups" notify={notify} />);
    await user.click(await screen.findByRole("button", { name: /创建在线备份/ }));
    const dialog = screen.getByRole("alertdialog", { name: "创建在线备份" });
    fireEvent.change(within(dialog).getByLabelText("当前密码"), { target: { value: "correct password" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认备份" }));
    await waitFor(() => expect(reauthenticate).toHaveBeenCalledWith("correct password"));
    await waitFor(() => expect(createDatabaseBackup).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: expect.any(String) }), "proof-value-with-more-than-thirty-two-characters"));
    expect(notify).toHaveBeenCalledWith("在线备份完成", "success");
  });

  it("opens a body-level detail drawer and verifies the selected stable id", async () => {
    const user = userEvent.setup();
    vi.mocked(reauthenticate).mockResolvedValue({ proof: "proof-value-with-more-than-thirty-two-characters", expiresAt: "2026-07-14T06:05:00.000Z" });
    vi.mocked(verifyDatabaseBackup).mockResolvedValue({ backup: { ...payload.backups[0], checksumStatus: "verified" }, message: "校验完成", tone: "success" });
    render(<DatabaseBackupsPage page="databases-backups" notify={vi.fn()} />);
    await user.click((await screen.findAllByRole("button", { name: `查看备份 ${payload.backups[0].fileName}` }))[0]);
    const drawer = screen.getByRole("region", { name: "备份文件详情" });
    expect(drawer.parentElement).toBe(document.body);
    await user.click(within(drawer).getByRole("button", { name: "校验" }));
    const dialog = screen.getByRole("alertdialog", { name: "校验备份" });
    fireEvent.change(within(dialog).getByLabelText("当前密码"), { target: { value: "correct password" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认校验" }));
    await waitFor(() => expect(reauthenticate).toHaveBeenCalledWith("correct password"));
    await waitFor(() => expect(verifyDatabaseBackup).toHaveBeenCalledWith(payload.backups[0].id, "proof-value-with-more-than-thirty-two-characters"));
  });
});
