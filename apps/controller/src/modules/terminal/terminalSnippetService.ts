import { CreateRemoteTaskRequestSchema, type ExecuteTerminalSnippetRequest, type TerminalSnippetRecord } from "@stackpilot/contracts";
import type { RemoteTaskService } from "../remote-tasks/remoteTaskService.js";
import { ServiceError } from "../serviceError.js";
import { terminalSnippetCatalog, type CatalogSnippet } from "./terminalSnippetCatalog.js";
import type { TerminalSnippetRepository } from "./terminalSnippetRepository.js";

export class TerminalSnippetService {
  constructor(private readonly repository: TerminalSnippetRepository, private readonly tasks: RemoteTaskService) {}

  private catalogSnippet(id: string) {
    const snippet = terminalSnippetCatalog.find((candidate) => candidate.id === id);
    if (!snippet) throw new ServiceError(404, "NOT_FOUND", "命令片段不存在");
    return snippet;
  }

  private record(userId: string, snippet: CatalogSnippet): TerminalSnippetRecord {
    const preference = this.repository.list(userId).get(snippet.id);
    return {
      id: snippet.id, version: snippet.version, title: snippet.title, command: snippet.command,
      category: snippet.category, risk: snippet.risk, description: snippet.description,
      executable: snippet.executable, requiredCapability: snippet.requiredCapability,
      favorite: preference?.favorite ?? false, lastUsedAt: preference?.lastUsedAt ?? null,
    };
  }

  list(userId: string) {
    return { snippets: terminalSnippetCatalog.map((snippet) => this.record(userId, snippet)), collectedAt: new Date().toISOString() };
  }

  setFavorite(userId: string, snippetId: string, favorite: boolean) {
    const snippet = this.catalogSnippet(snippetId);
    this.repository.setFavorite(userId, snippetId, favorite, new Date().toISOString());
    return this.record(userId, snippet);
  }

  async execute(userId: string, snippetId: string, input: ExecuteTerminalSnippetRequest, traceId: string) {
    const snippet = this.catalogSnippet(snippetId);
    if (!snippet.executable || !snippet.task) throw new ServiceError(409, "BAD_REQUEST", "该命令片段没有可执行的受控 Agent 能力");
    if (snippet.version !== input.snippetVersion) throw new ServiceError(409, "BAD_REQUEST", "命令片段版本已变化，请刷新后重试");
    const taskRequest = CreateRemoteTaskRequestSchema.parse({ ...snippet.task, idempotencyKey: input.idempotencyKey });
    const task = await this.tasks.create(input.nodeId, taskRequest, `user:${userId}`, traceId);
    const now = new Date().toISOString();
    this.repository.markUsed(userId, snippetId, now);
    return { snippet: this.record(userId, snippet), task };
  }
}
