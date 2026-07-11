

type TerminalSessionRecord = {
  id: string;
  host: string;
  ip: string;
  user: string;
  cwd: string;
  status: "connected" | "disconnected";
  latency: string;
  startedAt: string;
  lastCommand: string;
  privilege: "sudo" | "user";
};

type TerminalSnippetRecord = {
  id: string;
  title: string;
  command: string;
  category: string;
  risk: "只读" | "变更" | "危险";
  description: string;
  lastUsed: string;
  favorite: boolean;
};

type TerminalHistoryRecord = {
  id: string;
  command: string;
  host: string;
  user: string;
  status: "成功" | "失败";
  duration: string;
  time: string;
  output: string;
  pinned?: boolean;
};

export type { TerminalSessionRecord, TerminalSnippetRecord, TerminalHistoryRecord };
