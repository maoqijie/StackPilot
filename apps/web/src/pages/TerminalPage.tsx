import { Clock3, RefreshCw, Shield, TerminalSquare } from "lucide-react";
import { useCallback, useState } from "react";
import { terminalPagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { useQuickIntent } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { FieldSelect } from "../components/ui/FormControls";
import { StatusDot, StatusLight } from "../components/ui/StatusVisuals";
import type { TerminalHistoryRecord, TerminalSessionRecord, TerminalSnippetRecord } from "../features/terminal/types";
import { initialTerminalHistory, initialTerminalSessions, initialTerminalSnippets } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";
import { currentClock } from "../utils/time";

function TerminalPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const terminalPreset = terminalPagePreset(page);
  const terminalMode = terminalPreset.panel;
  const [sessions, setSessions] = useState(initialTerminalSessions);
  const [snippets, setSnippets] = useState(initialTerminalSnippets);
  const [historyRows, setHistoryRows] = useState(initialTerminalHistory);
  const [selectedSessionId, setSelectedSessionId] = useState(initialTerminalSessions[0].id);
  const [command, setCommand] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [snippetSearch, setSnippetSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [sessionStatusFilter, setSessionStatusFilter] = useState("全部");
  const [snippetCategoryFilter, setSnippetCategoryFilter] = useState("全部");
  const [snippetRiskFilter, setSnippetRiskFilter] = useState("全部");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("全部");
  const [pendingSensitiveCommand, setPendingSensitiveCommand] = useState<{ command: string; sessionId: string } | null>(null);
  const [consoleHighlighted, setConsoleHighlighted] = useState(false);
  const [logsBySession, setLogsBySession] = useState<Record<string, string[]>>(() => ({
    [initialTerminalSessions[0].id]: [`session opened: ${initialTerminalSessions[0].host}`, "Last login: Thu Jun 18 10:21:03"],
    [initialTerminalSessions[1].id]: [`session opened: ${initialTerminalSessions[1].host}`, "Last login: Thu Jun 18 10:04:19"],
    [initialTerminalSessions[2].id]: [`session closed: ${initialTerminalSessions[2].host}`],
  }));
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const connected = selectedSession.status === "connected";
  const logs = logsBySession[selectedSession.id] ?? [];
  const search = terminalMode === "snippets" ? snippetSearch : terminalMode === "history" ? historySearch : sessionSearch;
  const snippetCategories = ["全部", ...Array.from(new Set(snippets.map((snippet) => snippet.category)))];
  const appendLogs = useCallback((sessionId: string, lines: string[]) => {
    setLogsBySession((current) => ({
      ...current,
      [sessionId]: [...(current[sessionId] ?? []), ...lines],
    }));
  }, []);

  const focusTerminalFromQuick = useCallback(() => {
    const firstConnected = sessions.find((session) => session.status === "connected") ?? sessions[0];
    setSelectedSessionId(firstConnected.id);
    appendLogs(firstConnected.id, [`quick action focused: ${firstConnected.user}@${firstConnected.host}`]);
    setConsoleHighlighted(true);
    window.setTimeout(() => setConsoleHighlighted(false), 2200);
  }, [appendLogs, sessions]);

  useQuickIntent("terminal", "open-terminal", focusTerminalFromQuick);

  const filteredSessions = sessions.filter((session) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${session.host} ${session.ip} ${session.user} ${session.cwd} ${session.lastCommand}`.toLowerCase().includes(query);
    const matchStatus = sessionStatusFilter === "全部" || session.status === sessionStatusFilter;
    return matchSearch && matchStatus;
  });
  const filteredSnippets = snippets.filter((snippet) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${snippet.title} ${snippet.command} ${snippet.category} ${snippet.description}`.toLowerCase().includes(query);
    const matchCategory = snippetCategoryFilter === "全部" || snippet.category === snippetCategoryFilter;
    const matchRisk = snippetRiskFilter === "全部" || snippet.risk === snippetRiskFilter;
    return matchSearch && matchCategory && matchRisk;
  });
  const filteredHistory = historyRows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.command} ${row.host} ${row.user} ${row.output}`.toLowerCase().includes(query);
    const matchStatus = historyStatusFilter === "全部" || row.status === historyStatusFilter;
    return matchSearch && matchStatus;
  });
  const updateSession = (id: string, patch: Partial<TerminalSessionRecord>) => {
    setSessions((current) => current.map((session) => session.id === id ? { ...session, ...patch } : session));
  };
  const setSessionLogs = (sessionId: string, nextLogs: string[]) => {
    setLogsBySession((current) => ({
      ...current,
      [sessionId]: nextLogs,
    }));
  };
  const switchSession = (session: TerminalSessionRecord) => {
    setSelectedSessionId(session.id);
    appendLogs(session.id, [`session focused: ${session.user}@${session.host}`]);
    notify(`已切换到 ${session.host}`, "info");
  };
  const connectSession = (session = selectedSession) => {
    updateSession(session.id, { status: "connected", latency: session.latency === "-" ? "44ms" : session.latency });
    setSelectedSessionId(session.id);
    appendLogs(session.id, [`session opened: ${session.host}`]);
    notify(`已打开 ${session.host} 会话`);
  };
  const disconnectSession = (session = selectedSession) => {
    updateSession(session.id, { status: "disconnected", latency: "-" });
    appendLogs(session.id, [`session closed: ${session.host}`]);
    notify(`${session.host} 会话已关闭`, "warning");
  };
  const commandOutput = (next: string) => {
    if (next.includes("systemctl status")) return "nginx.service active (running)";
    if (next.includes("systemctl restart")) return "service restart queued, status=0/SUCCESS";
    if (next.includes("df")) return "/dev/vda1  62G  21G  41G  35% /";
    if (next.includes("top")) return "load average: 0.38, 0.42, 0.41";
    if (next.includes("tail")) return "no critical errors in last 100 lines";
    if (next.includes("mysqladmin")) return "ERROR 2002: connection timed out";
    if (next.includes("rm -rf")) return "高风险命令已拦截";
    return `command '${next}' executed`;
  };
  const isPrivilegedCommand = (next: string) => /(^|\s)(systemctl\s+restart|systemctl\s+stop|rm\s+-rf|ufw|iptables)\b/.test(next);
  const isDestructiveCommand = (next: string) => /(^|\s)rm\s+-rf\b/.test(next);
  const runCommand = (
    value = command,
    risk: TerminalSnippetRecord["risk"] | "自动" = "自动",
    targetSession = selectedSession,
  ) => {
    const next = value.trim();
    if (!next) return;
    setSelectedSessionId(targetSession.id);
    const targetConnected = targetSession.status === "connected";
    if (!targetConnected) {
      setPendingSensitiveCommand(null);
      notify(`${targetSession.host} 未连接，请先连接目标主机`, "danger");
      return;
    }
    if (risk === "危险" || isDestructiveCommand(next)) {
      const output = "高风险命令已拦截";
      appendLogs(targetSession.id, [`$ ${next}`, output]);
      setHistoryRows((current) => [{
        id: `term-history-${Date.now()}`,
        command: next,
        host: targetSession.host,
        user: targetSession.user,
        status: "失败",
        duration: "0.0s",
        time: currentClock(),
        output,
      }, ...current]);
      setPendingSensitiveCommand(null);
      setCommand("");
      notify("危险命令已强制阻止", "danger");
      return;
    }
    const requiresSudo = risk === "变更" || isPrivilegedCommand(next);
    if (requiresSudo && targetSession.privilege !== "sudo") {
      const output = "permission denied: sudo privilege required";
      appendLogs(targetSession.id, [`$ ${next}`, output]);
      setHistoryRows((current) => [{
        id: `term-history-${Date.now()}`,
        command: next,
        host: targetSession.host,
        user: targetSession.user,
        status: "失败",
        duration: "0.1s",
        time: currentClock(),
        output,
      }, ...current]);
      setPendingSensitiveCommand(null);
      setCommand("");
      notify("当前会话权限不足，已阻止变更命令", "danger");
      return;
    }
    if (requiresSudo && (pendingSensitiveCommand?.command !== next || pendingSensitiveCommand.sessionId !== targetSession.id)) {
      setPendingSensitiveCommand({ command: next, sessionId: targetSession.id });
      setCommand(next);
      notify("变更命令需要二次确认，再次运行将执行", "warning");
      return;
    }
    const output = commandOutput(next);
    const failed = next.includes("mysqladmin") || next.includes("rm -rf");
    appendLogs(targetSession.id, [`$ ${next}`, output]);
    setHistoryRows((current) => [{
      id: `term-history-${Date.now()}`,
      command: next,
      host: targetSession.host,
      user: targetSession.user,
      status: failed ? "失败" : "成功",
      duration: failed ? "5.0s" : "0.4s",
      time: currentClock(),
      output,
    }, ...current]);
    updateSession(targetSession.id, { lastCommand: next });
    setPendingSensitiveCommand(null);
    setCommand("");
    notify(failed ? `${targetSession.host} 输出记录为失败` : `${targetSession.host} 输出已记录`, failed ? "danger" : "success");
  };
  const fillSnippet = (snippet: TerminalSnippetRecord) => {
    setCommand(snippet.command);
    setSnippets((current) => current.map((item) => item.id === snippet.id ? { ...item, lastUsed: currentClock() } : item));
    notify(`已填充命令：${snippet.title}`, "info");
  };
  const runSnippet = (snippet: TerminalSnippetRecord) => {
    fillSnippet(snippet);
    runCommand(snippet.command, snippet.risk);
  };
  const rerunHistory = (row: TerminalHistoryRecord) => {
    const targetSession = sessions.find((session) => session.host === row.host && session.user === row.user);
    if (!targetSession) {
      setPendingSensitiveCommand(null);
      notify(`未找到 ${row.user}@${row.host} 的终端会话`, "danger");
      return;
    }
    runCommand(row.command, "自动", targetSession);
  };
  const copyText = (value: string, successMessage: string) => {
    if (!navigator.clipboard?.writeText) {
      notify("复制失败，请检查浏览器剪贴板权限", "danger");
      return;
    }
    void navigator.clipboard.writeText(value)
      .then(() => notify(successMessage, "info"))
      .catch(() => notify("复制失败，请检查浏览器剪贴板权限", "danger"));
  };
  const copyCommand = (value: string) => copyText(value, "命令已复制");
  const terminalFilters = terminalMode === "snippets"
    ? <><ModuleSearch value={snippetSearch} placeholder="搜索命令、分类或说明" onChange={setSnippetSearch} /><FieldSelect label="分类" value={snippetCategoryFilter} options={snippetCategories} onChange={setSnippetCategoryFilter} /><FieldSelect label="风险" value={snippetRiskFilter} options={["全部", "只读", "变更", "危险"]} onChange={setSnippetRiskFilter} /></>
    : terminalMode === "history"
      ? <><ModuleSearch value={historySearch} placeholder="搜索命令、主机或输出" onChange={setHistorySearch} /><FieldSelect label="结果" value={historyStatusFilter} options={["全部", "成功", "失败"]} onChange={setHistoryStatusFilter} /></>
      : <><ModuleSearch value={sessionSearch} placeholder="搜索主机、IP、用户或路径" onChange={setSessionSearch} /><FieldSelect label="会话" value={sessionStatusFilter} options={["全部", "connected", "disconnected"]} onChange={setSessionStatusFilter} /></>;

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={terminalPreset.subtitle}
      page={page}
      actions={<><button className="ghost" type="button" onClick={() => disconnectSession()} disabled={!connected}>关闭当前</button><button className="primary" type="button" onClick={() => connectSession()}><RefreshCw size={15} /> 打开会话</button></>}
      filters={terminalFilters}
      metrics={<><MetricTile icon={TerminalSquare} label="活动会话" value={`${sessions.filter((session) => session.status === "connected").length}`} tone="blue" /><MetricTile icon={Clock3} label="历史命令" value={`${historyRows.length}`} tone="green" /><MetricTile icon={Shield} label="高风险片段" value={`${snippets.filter((snippet) => snippet.risk !== "只读").length}`} tone="orange" /></>}
    >
      <div className={`terminal-workbench terminal-${terminalMode}-view`}>
        <section className="terminal-side-panel">
          {terminalMode === "sessions" && (
            <div className="terminal-session-list">
              {filteredSessions.map((session) => (
                <article key={session.id} className={session.id === selectedSession.id ? "active" : ""}>
                  <button className="terminal-session-main" type="button" aria-label={`切换终端会话 ${session.host}`} onClick={() => switchSession(session)}>
                    <span><StatusLight tone={session.status === "connected" ? "green" : "red"} /><b>{session.host}</b><em>{session.ip}</em></span>
                    <strong>{session.user}</strong>
                    <p>{session.cwd}</p>
                    <small>{session.lastCommand}</small>
                  </button>
                  <div className="terminal-card-actions">
                    <span>{session.latency}</span>
                    <button type="button" aria-label={`${session.status === "connected" ? "关闭" : "打开"} ${session.host}`} onClick={() => session.status === "connected" ? disconnectSession(session) : connectSession(session)}>{session.status === "connected" ? "关闭" : "打开"}</button>
                  </div>
                </article>
              ))}
              {filteredSessions.length === 0 && <p className="module-empty-card">没有匹配的终端会话</p>}
            </div>
          )}
          {terminalMode === "snippets" && (
            <div className="terminal-snippet-library">
              {filteredSnippets.map((snippet) => (
                <article key={snippet.id} className={snippet.favorite ? "favorite" : ""}>
                  <header><strong>{snippet.title}</strong><span className={`pill ${snippet.risk === "危险" ? "red" : snippet.risk === "变更" ? "orange" : "green"}`}>{snippet.risk}</span></header>
                  <code>{snippet.command}</code>
                  <p>{snippet.description}</p>
                  <footer><span>{snippet.category} · {snippet.lastUsed}</span><div><button type="button" aria-label={`收藏 ${snippet.title}`} onClick={() => { setSnippets((current) => current.map((item) => item.id === snippet.id ? { ...item, favorite: !item.favorite } : item)); notify(`${snippet.title} 已${snippet.favorite ? "取消收藏" : "收藏"}`, "info"); }}>{snippet.favorite ? "取消收藏" : "收藏"}</button><button type="button" aria-label={`填充 ${snippet.title}`} onClick={() => fillSnippet(snippet)}>填充</button><button type="button" aria-label={`执行 ${snippet.title}`} onClick={() => runSnippet(snippet)}>执行</button></div></footer>
                </article>
              ))}
              {filteredSnippets.length === 0 && <p className="module-empty-card">没有匹配的常用命令</p>}
            </div>
          )}
          {terminalMode === "history" && (
            <div className="terminal-history-list">
              {filteredHistory.map((row) => (
                <article key={row.id} className={row.pinned ? "pinned" : ""}>
                  <header><span className={`pill ${row.status === "成功" ? "green" : "red"}`}>{row.status}</span><strong>{row.command}</strong></header>
                  <p><b>{row.host}</b><span>{row.user} · {row.time} · {row.duration}</span></p>
                  <code>{row.output}</code>
                  <footer><button type="button" aria-label={`复制历史命令 ${row.command} ${row.host} ${row.time}`} onClick={() => copyCommand(row.command)}>复制</button><button type="button" aria-label={`重新执行 ${row.command} ${row.host} ${row.time}`} onClick={() => rerunHistory(row)}>重跑</button><button type="button" aria-label={`${row.pinned ? "取消固定" : "固定"} ${row.command} ${row.host} ${row.time}`} onClick={() => { setHistoryRows((current) => current.map((item) => item.id === row.id ? { ...item, pinned: !item.pinned } : item)); notify(`${row.command} 已${row.pinned ? "取消固定" : "固定"}`, "info"); }}>{row.pinned ? "取消固定" : "固定"}</button></footer>
                </article>
              ))}
              {filteredHistory.length === 0 && <p className="module-empty-card">没有匹配的执行历史</p>}
            </div>
          )}
        </section>
        <section className={`terminal-console-card ${consoleHighlighted ? "is-highlighted" : ""}`}>
          <div className="terminal-console-head">
            <div><span>{selectedSession.user}@{selectedSession.host}</span><strong>{selectedSession.cwd}</strong></div>
            <StatusDot text={connected ? "已打开" : "未打开"} tone={connected ? "green" : "red"} />
          </div>
          <div className="terminal-panel">
            <div className="terminal-toolbar">
              <span><StatusLight tone={connected ? "green" : "red"} /> {connected ? "connected" : "disconnected"}</span>
              <div>
                <button type="button" onClick={() => { setSessionLogs(selectedSession.id, []); notify("终端已清屏", "info"); }}>清屏</button>
                <button type="button" onClick={() => copyText(logs.join("\n"), "会话内容已复制")}>复制会话</button>
                <button type="button" onClick={() => connectSession()}>重连</button>
              </div>
            </div>
            <div className="terminal-log" role="log" aria-live="polite" aria-label={`${selectedSession.host} 终端输出`}>
              {logs.length === 0 ? <p>terminal cleared</p> : logs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
            </div>
            <label className="terminal-input">
              <span>{selectedSession.host}:~$</span>
              <input aria-label="命令输入" value={command} disabled={!connected} placeholder={connected ? "输入命令后按 Enter" : "请先连接主机"} onChange={(event) => { setCommand(event.target.value); setPendingSensitiveCommand(null); }} onKeyDown={(event) => { if (event.key === "Enter") runCommand(); }} />
              <button type="button" disabled={!connected || !command.trim()} onClick={() => runCommand()}>运行</button>
            </label>
          </div>
        </section>
      </div>
    </ModulePageShell>
  );
}

export { TerminalPage };
