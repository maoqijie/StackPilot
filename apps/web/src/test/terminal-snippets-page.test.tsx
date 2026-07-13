import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeTerminalSnippet, fetchTerminalNodes, fetchTerminalSnippets, fetchTerminalTasks, updateTerminalSnippetFavorite } from "../api/terminalApi";
import { reauthenticate } from "../api/identityApi";
import { TerminalSnippetsPage } from "../pages/TerminalSnippetsPage";

vi.mock("../api/terminalApi", () => ({ fetchTerminalSnippets: vi.fn(), fetchTerminalNodes: vi.fn(), fetchTerminalTasks: vi.fn(), updateTerminalSnippetFavorite: vi.fn(), executeTerminalSnippet: vi.fn() }));
vi.mock("../api/identityApi", () => ({ reauthenticate: vi.fn() }));

const collectedAt = "2026-07-14T00:00:00.000Z";
const snippets = [
  { id: "system-resource-summary", version: 1, title: "系统资源概览", command: "df -h && uptime", category: "资源", risk: "read" as const, description: "通过 Agent 采集资源", favorite: false, lastUsedAt: null, executable: true, requiredCapability: "system.summary.read" as const },
  { id: "clear-temporary-cache", version: 1, title: "清理临时缓存", command: "rm -rf /tmp/cache/*", category: "文件", risk: "danger" as const, description: "危险命令禁止执行", favorite: false, lastUsedAt: null, executable: false, requiredCapability: null },
];
const node = { nodeId: "11111111-1111-4111-8111-111111111111", nodeName: "agent-sg-01", status: "online" as const, agentVersion: "0.2.0", protocolVersion: "1.0" as const, platform: "linux" as const, declaredCapabilities: ["system.summary.read" as const], allowedCapabilities: ["system.summary.read" as const], enrolledAt: collectedAt, lastSeenAt: collectedAt, revokedAt: null };
const task = { protocolVersion: "1.0" as const, taskId: "22222222-2222-4222-8222-222222222222", type: "system.summary.read" as const, targetNodeId: node.nodeId, parameters: { includeLoad: true }, createdAt: collectedAt, expiresAt: "2026-07-14T00:02:00.000Z", idempotencyKey: "terminal-system-resource-summary-test", requester: "user:test", traceId: "33333333-3333-4333-8333-333333333333", requiredCapability: "system.summary.read" as const, attempt: 0, maxAttempts: 3, status: "queued" as const, updatedAt: collectedAt, result: null, errorCode: null, retryable: true, nextAttemptAt: null };

describe("terminal snippets real backend page", () => {
  beforeEach(() => {
    vi.mocked(fetchTerminalSnippets).mockReset().mockResolvedValue({ snippets, collectedAt });
    vi.mocked(fetchTerminalNodes).mockReset().mockResolvedValue({ nodes: [node] });
    vi.mocked(fetchTerminalTasks).mockReset().mockResolvedValue({ tasks: [] });
    vi.mocked(updateTerminalSnippetFavorite).mockReset().mockResolvedValue({ ...snippets[0], favorite: true });
    vi.mocked(reauthenticate).mockReset().mockResolvedValue({ proof: "one-time-proof-with-more-than-thirty-two-characters", expiresAt: "2026-07-14T00:05:00.000Z" });
    vi.mocked(executeTerminalSnippet).mockReset().mockResolvedValue({ snippet: { ...snippets[0], lastUsedAt: collectedAt }, task });
  });

  it("loads Controller snippets and persists favorite state", async () => {
    const user = userEvent.setup(); render(<TerminalSnippetsPage notify={vi.fn()} />);
    expect(await screen.findByText("系统资源概览")).toBeInTheDocument();
    expect(screen.queryByText("重启 Worker")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "收藏 系统资源概览" }));
    await waitFor(() => expect(updateTerminalSnippetFavorite).toHaveBeenCalledWith("system-resource-summary", true));
    expect(screen.getByRole("button", { name: "取消收藏 系统资源概览" })).toBeInTheDocument();
  });

  it("requires current-password reauthentication and submits only snippet identity", async () => {
    const user = userEvent.setup(); const notify = vi.fn(); render(<TerminalSnippetsPage notify={notify} />);
    await user.click(await screen.findByRole("button", { name: "执行 系统资源概览" }));
    const dialog = screen.getByRole("alertdialog", { name: "确认执行受控命令" });
    const password = within(dialog).getByLabelText("当前账号密码");
    await user.type(password, "correct password"); await user.click(within(dialog).getByRole("button", { name: "确认执行" }));
    await waitFor(() => expect(executeTerminalSnippet).toHaveBeenCalled());
    expect(reauthenticate).toHaveBeenCalledWith("correct password");
    const [id, payload, proof] = vi.mocked(executeTerminalSnippet).mock.calls[0];
    expect(id).toBe("system-resource-summary"); expect(payload).toMatchObject({ nodeId: node.nodeId, snippetVersion: 1 });
    expect(payload).not.toHaveProperty("command"); expect(proof).toContain("one-time-proof");
    expect(await screen.findByText("等待 Agent")).toBeInTheDocument();
  });

  it("keeps dangerous snippets inspectable but never executable", async () => {
    const user = userEvent.setup(); render(<TerminalSnippetsPage notify={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "执行 清理临时缓存" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "查看 清理临时缓存 详情" }));
    const drawer = screen.getByRole("dialog", { name: "清理临时缓存" });
    expect(within(drawer).getByText("仅供检查，禁止执行")).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "尚未接入" })).toBeDisabled();
  });

  it("shows a retryable error without falling back to demo data", async () => {
    vi.mocked(fetchTerminalSnippets).mockRejectedValueOnce(new Error("后端暂不可用"));
    const user = userEvent.setup(); render(<TerminalSnippetsPage notify={vi.fn()} />);
    expect(await screen.findByText("后端暂不可用")).toBeInTheDocument();
    expect(screen.getByText("真实片段加载失败，未显示示例数据")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("系统资源概览")).toBeInTheDocument();
  });
});
