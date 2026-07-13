import { AlertTriangle, CheckCircle2, ClipboardPaste, Clock3, Copy, Eraser, Eye, Info, Pin, PinOff, Play, PlugZap, RefreshCw, RotateCcw, Shield, Star, TerminalSquare, Unplug, Wifi, WifiOff, XCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { terminalPagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { useQuickIntent } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { TerminalSessionDrawer } from "../features/terminal/TerminalSessionDrawer";
import type { TerminalHistoryRecord, TerminalSessionRecord, TerminalSnippetRecord } from "../features/terminal/types";
import { initialTerminalHistory, initialTerminalSessions, initialTerminalSnippets } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";
import { currentClock } from "../utils/time";

function SessionStatus({ connected, compact = false }: { connected: boolean; compact?: boolean }) {
  const Icon = connected ? Wifi : WifiOff;
  return (
    <span className={`terminal-semantic-status ${connected ? "green" : "gray"} ${compact ? "compact" : ""}`}>
      <Icon size={compact ? 13 : 15} />
      {connected ? "已连接" : "未连接"}
    </span>
  );
}

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
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [pendingDisconnectSessionId, setPendingDisconnectSessionId] = useState<string | null>(null);
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(null);
  const [pendingSnippetRunId, setPendingSnippetRunId] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [pendingHistoryRerunId, setPendingHistoryRerunId] = useState<string | null>(null);
  const [pendingSensitiveCommand, setPendingSensitiveCommand] = useState<{ command: string; sessionId: string } | null>(null);
  const [consoleHighlighted, setConsoleHighlighted] = useState(false);
  const [logsBySession, setLogsBySession] = useState<Record<string, string[]>>(() => ({
    [initialTerminalSessions[0].id]: [`session opened: ${initialTerminalSessions[0].host}`, "Last login: Thu Jun 18 10:21:03"],
    [initialTerminalSessions[1].id]: [`session opened: ${initialTerminalSessions[1].host}`, "Last login: Thu Jun 18 10:04:19"],
    [initialTerminalSessions[2].id]: [`session closed: ${initialTerminalSessions[2].host}`],
  }));
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const detailSession = detailSessionId ? sessions.find((session) => session.id === detailSessionId) ?? null : null;
  const pendingDisconnectSession = pendingDisconnectSessionId ? sessions.find((session) => session.id === pendingDisconnectSessionId) ?? null : null;
  const selectedSnippet = selectedSnippetId ? snippets.find((snippet) => snippet.id === selectedSnippetId) ?? null : null;
  const pendingSnippetRun = pendingSnippetRunId ? snippets.find((snippet) => snippet.id === pendingSnippetRunId) ?? null : null;
  const selectedHistory = selectedHistoryId ? historyRows.find((row) => row.id === selectedHistoryId) ?? null : null;
  const pendingHistoryRerun = pendingHistoryRerunId ? historyRows.find((row) => row.id === pendingHistoryRerunId) ?? null : null;
  const pendingSensitiveSession = pendingSensitiveCommand ? sessions.find((session) => session.id === pendingSensitiveCommand.sessionId) ?? null : null;
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
  const requestDisconnect = (session = selectedSession) => {
    if (session.status !== "connected") return;
    setDetailSessionId(null);
    setPendingDisconnectSessionId(session.id);
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
    confirmed = false,
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
    if (!confirmed && requiresSudo) {
      setPendingSensitiveCommand({ command: next, sessionId: targetSession.id });
      setCommand(next);
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
  const confirmSensitiveCommand = () => {
    if (!pendingSensitiveCommand || !pendingSensitiveSession) return;
    const pendingCommand = pendingSensitiveCommand.command;
    const targetSession = pendingSensitiveSession;
    setPendingSensitiveCommand(null);
    runCommand(pendingCommand, "自动", targetSession, true);
  };
  const fillSnippet = (snippet: TerminalSnippetRecord) => {
    setCommand(snippet.command);
    setSnippets((current) => current.map((item) => item.id === snippet.id ? { ...item, lastUsed: currentClock() } : item));
    notify(`已填充命令：${snippet.title}`, "info");
  };
  const runSnippet = (snippet: TerminalSnippetRecord) => {
    if (snippet.risk === "变更") {
      if (selectedSession.status !== "connected") {
        notify(`${selectedSession.host} 未连接，请先连接目标主机`, "danger");
        return;
      }
      if (selectedSession.privilege !== "sudo") {
        runCommand(snippet.command, snippet.risk);
        return;
      }
      setPendingSnippetRunId(snippet.id);
      return;
    }
    fillSnippet(snippet);
    runCommand(snippet.command, snippet.risk);
  };
  const confirmSnippetRun = () => {
    if (!pendingSnippetRun) return;
    const snippet = pendingSnippetRun;
    setPendingSnippetRunId(null);
    setCommand(snippet.command);
    setSnippets((current) => current.map((item) => item.id === snippet.id ? { ...item, lastUsed: currentClock() } : item));
    runCommand(snippet.command, snippet.risk, selectedSession, true);
  };
  const toggleSnippetFavorite = (snippet: TerminalSnippetRecord) => {
    setSnippets((current) => current.map((item) => item.id === snippet.id ? { ...item, favorite: !item.favorite } : item));
    notify(`${snippet.title} 已${snippet.favorite ? "取消收藏" : "收藏"}`, "info");
  };
  const rerunHistory = (row: TerminalHistoryRecord, confirmed = false) => {
    const targetSession = sessions.find((session) => session.host === row.host && session.user === row.user);
    if (!targetSession) {
      setPendingSensitiveCommand(null);
      notify(`未找到 ${row.user}@${row.host} 的终端会话`, "danger");
      return;
    }
    runCommand(row.command, "自动", targetSession, confirmed);
  };
  const confirmHistoryRerun = () => {
    if (!pendingHistoryRerun) return;
    const row = pendingHistoryRerun;
    setPendingHistoryRerunId(null);
    rerunHistory(row, true);
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
    <>
    <div
      className="terminal-page-layer"
      inert={Boolean(detailSession || pendingDisconnectSession || selectedSnippet || pendingSnippetRun || selectedHistory || pendingHistoryRerun || pendingSensitiveSession)}
      aria-hidden={detailSession || pendingDisconnectSession || selectedSnippet || pendingSnippetRun || selectedHistory || pendingHistoryRerun || pendingSensitiveSession ? "true" : undefined}
    >
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={terminalPreset.subtitle}
      page={page}
      className="terminal-page"
      actions={<><button className="ghost" type="button" onClick={() => requestDisconnect()} disabled={!connected}><Unplug size={15} />关闭当前</button><button className="primary" type="button" onClick={() => connectSession()}><PlugZap size={15} />打开会话</button></>}
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
                    <span><SessionStatus connected={session.status === "connected"} compact /><b title={session.host}>{session.host}</b><em>{session.ip}</em></span>
                    <strong>{session.user}</strong>
                    <p>{session.cwd}</p>
                    <small>{session.lastCommand}</small>
                  </button>
                  <div className="terminal-card-actions">
                    <span>{session.latency}</span>
                    <div>
                      <button type="button" aria-label={`查看 ${session.host} 会话详情`} onClick={() => setDetailSessionId(session.id)}><Info size={14} />详情</button>
                      <button type="button" aria-label={`${session.status === "connected" ? "关闭" : "打开"} ${session.host}`} onClick={() => session.status === "connected" ? requestDisconnect(session) : connectSession(session)}>{session.status === "connected" ? <Unplug size={14} /> : <PlugZap size={14} />}{session.status === "connected" ? "关闭" : "打开"}</button>
                    </div>
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
                  <header>
                    <button className="terminal-snippet-title" type="button" onClick={() => setSelectedSnippetId(snippet.id)}><strong>{snippet.title}</strong><Eye size={16} aria-hidden="true" /></button>
                    <span className={`pill terminal-snippet-risk ${snippet.risk === "危险" ? "red" : snippet.risk === "变更" ? "orange" : "green"}`}>{snippet.risk === "只读" ? <Shield size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}{snippet.risk}</span>
                  </header>
                  <button className="terminal-snippet-command" type="button" aria-label={`查看 ${snippet.title} 详情`} onClick={() => setSelectedSnippetId(snippet.id)}><code>{snippet.command}</code></button>
                  <p>{snippet.description}</p>
                  <footer>
                    <span><b>{snippet.category}</b><time>{snippet.lastUsed}</time></span>
                    <div>
                      <button className={`icon-action${snippet.favorite ? " active" : ""}`} type="button" aria-label={`${snippet.favorite ? "取消收藏" : "收藏"} ${snippet.title}`} title={snippet.favorite ? "取消收藏" : "收藏"} onClick={() => toggleSnippetFavorite(snippet)}><Star size={16} fill={snippet.favorite ? "currentColor" : "none"} /></button>
                      <button className="icon-action" type="button" aria-label={`填充 ${snippet.title}`} title="填充到终端" onClick={() => fillSnippet(snippet)}><ClipboardPaste size={16} /></button>
                      <button className="primary small" type="button" aria-label={`执行 ${snippet.title}`} onClick={() => runSnippet(snippet)} disabled={snippet.risk === "危险"}><Play size={15} />{snippet.risk === "危险" ? "已阻止" : "执行"}</button>
                    </div>
                  </footer>
                </article>
              ))}
              {filteredSnippets.length === 0 && <p className="module-empty-card">没有匹配的常用命令</p>}
            </div>
          )}
          {terminalMode === "history" && (
            <div className="terminal-history-list">
              {filteredHistory.map((row) => (
                <article key={row.id} className={row.pinned ? "pinned" : ""}>
                  <header>
                    <span className={`terminal-history-status ${row.status === "成功" ? "green" : "red"}`}>
                      {row.status === "成功" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                      {row.status}
                    </span>
                    {row.pinned && <span className="terminal-history-pinned"><Pin size={14} /> 已固定</span>}
                  </header>
                  <button className="terminal-history-command" type="button" aria-label={`查看执行详情 ${row.command}`} onClick={() => setSelectedHistoryId(row.id)}>
                    <code>{row.command}</code>
                  </button>
                  <p className="terminal-history-context">
                    <b title={row.host}>{row.host}</b>
                    <span>{row.user} · {row.time} · {row.duration}</span>
                  </p>
                  <p className="terminal-history-output">{row.output}</p>
                  <footer>
                    <button className="terminal-history-action" type="button" aria-label={`查看执行详情 ${row.command}`} onClick={() => setSelectedHistoryId(row.id)}><Eye size={15} />详情</button>
                    <button className="terminal-history-action" type="button" aria-label={`复制历史命令 ${row.command} ${row.host} ${row.time}`} onClick={() => copyCommand(row.command)}><Copy size={15} />复制</button>
                    <button className="terminal-history-action" type="button" aria-label={`重新执行 ${row.command} ${row.host} ${row.time}`} onClick={() => setPendingHistoryRerunId(row.id)}><RotateCcw size={15} />重跑</button>
                    <button className="terminal-history-action" type="button" aria-label={`${row.pinned ? "取消固定" : "固定"} ${row.command} ${row.host} ${row.time}`} onClick={() => { setHistoryRows((current) => current.map((item) => item.id === row.id ? { ...item, pinned: !item.pinned } : item)); notify(`${row.command} 已${row.pinned ? "取消固定" : "固定"}`, "info"); }}>{row.pinned ? <PinOff size={15} /> : <Pin size={15} />}{row.pinned ? "取消固定" : "固定"}</button>
                  </footer>
                </article>
              ))}
              {filteredHistory.length === 0 && <p className="module-empty-card">没有匹配的执行历史</p>}
            </div>
          )}
        </section>
        <section className={`terminal-console-card ${consoleHighlighted ? "is-highlighted" : ""}`}>
          <div className="terminal-console-head">
            <div><span>{selectedSession.user}@{selectedSession.host}</span><strong>{selectedSession.cwd}</strong></div>
            <div className="terminal-console-head-actions"><SessionStatus connected={connected} /><button type="button" aria-label="查看当前会话详情" onClick={() => setDetailSessionId(selectedSession.id)}><Eye size={14} />详情</button></div>
          </div>
          <div className="terminal-panel">
            <div className="terminal-toolbar">
              <SessionStatus connected={connected} compact />
              <div>
                <button type="button" onClick={() => { setSessionLogs(selectedSession.id, []); notify("终端已清屏", "info"); }}><Eraser size={14} />清屏</button>
                <button type="button" onClick={() => copyText(logs.join("\n"), "会话内容已复制")}><Copy size={14} />复制会话</button>
                <button type="button" onClick={() => connectSession()}><RefreshCw size={14} />重连</button>
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
      {selectedHistory && (
        <DetailDrawer
          title="执行详情"
          subtitle={`${selectedHistory.host} · ${selectedHistory.time}`}
          className="terminal-history-drawer"
          modal
          onClose={() => setSelectedHistoryId(null)}
          actions={<>
            <button className="ghost" type="button" onClick={() => copyCommand(selectedHistory.command)}><Copy size={15} />复制命令</button>
            <button className="primary" type="button" onClick={() => { setSelectedHistoryId(null); setPendingHistoryRerunId(selectedHistory.id); }}><RotateCcw size={15} />重新执行</button>
          </>}
        >
          <div className="terminal-history-detail">
            <div className={`terminal-history-detail-status ${selectedHistory.status === "成功" ? "green" : "red"}`}>
              {selectedHistory.status === "成功" ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
              <span><strong>{selectedHistory.status}</strong><em>{selectedHistory.duration}</em></span>
            </div>
            <dl>
              <div><dt>目标主机</dt><dd title={selectedHistory.host}>{selectedHistory.host}</dd></div>
              <div><dt>执行用户</dt><dd>{selectedHistory.user}</dd></div>
              <div><dt>执行时间</dt><dd>{selectedHistory.time}</dd></div>
              <div><dt>执行耗时</dt><dd>{selectedHistory.duration}</dd></div>
            </dl>
            <section><h3>执行命令</h3><code>{selectedHistory.command}</code></section>
            <section><h3>命令输出</h3><pre>{selectedHistory.output}</pre></section>
          </div>
        </DetailDrawer>
      )}
      {pendingHistoryRerun && (
        <ConfirmDialog
          title="确认重新执行"
          message={`将在 ${pendingHistoryRerun.user}@${pendingHistoryRerun.host} 上重新执行此命令。`}
          detail={pendingHistoryRerun.command}
          confirmLabel="确认执行"
          tone="warning"
          className="terminal-rerun-dialog"
          onClose={() => setPendingHistoryRerunId(null)}
          onConfirm={confirmHistoryRerun}
        />
      )}
    </ModulePageShell>
    </div>
    {detailSession && (
      <TerminalSessionDrawer
        session={detailSession}
        outputLineCount={(logsBySession[detailSession.id] ?? []).length}
        onClose={() => setDetailSessionId(null)}
        onConnect={() => connectSession(detailSession)}
        onDisconnect={() => requestDisconnect(detailSession)}
      />
    )}
    {pendingDisconnectSession && (
      <ConfirmDialog
        title="关闭终端会话"
        message={`确认关闭 ${pendingDisconnectSession.user}@${pendingDisconnectSession.host}？未保存的终端上下文将不可继续使用。`}
        detail={pendingDisconnectSession.ip}
        confirmLabel="确认关闭"
        tone="warning"
        className="terminal-disconnect-confirm"
        onClose={() => setPendingDisconnectSessionId(null)}
        onConfirm={() => {
          disconnectSession(pendingDisconnectSession);
          setPendingDisconnectSessionId(null);
        }}
      />
    )}
    {pendingSensitiveCommand && pendingSensitiveSession && (
      <ConfirmDialog
        title="确认执行变更命令"
        message={`此命令将以 ${pendingSensitiveSession.user} 身份修改 ${pendingSensitiveSession.host}，执行后可能影响正在运行的服务。`}
        detail={`${pendingSensitiveSession.user}@${pendingSensitiveSession.host} · ${pendingSensitiveCommand.command}`}
        confirmLabel="确认执行"
        tone="warning"
        className="terminal-command-confirm"
        onClose={() => setPendingSensitiveCommand(null)}
        onConfirm={confirmSensitiveCommand}
      />
    )}
    {selectedSnippet && (
      <DetailDrawer
        title={selectedSnippet.title}
        subtitle={`${selectedSnippet.category} · ${selectedSnippet.risk}`}
        className="terminal-snippet-drawer"
        modal
        onClose={() => setSelectedSnippetId(null)}
        actions={<>
          <button className="ghost" type="button" onClick={() => copyCommand(selectedSnippet.command)}><Copy size={15} />复制命令</button>
          <button className="ghost" type="button" onClick={() => { fillSnippet(selectedSnippet); setSelectedSnippetId(null); }}><ClipboardPaste size={15} />填充到终端</button>
          <button className="primary" type="button" disabled={selectedSnippet.risk === "危险"} onClick={() => { const snippet = selectedSnippet; setSelectedSnippetId(null); runSnippet(snippet); }}><Play size={15} />{selectedSnippet.risk === "危险" ? "已阻止执行" : "执行命令"}</button>
        </>}
      >
        <div className="terminal-snippet-detail">
          <div className={`terminal-snippet-notice ${selectedSnippet.risk === "危险" ? "danger" : selectedSnippet.risk === "变更" ? "warning" : "safe"}`}>
            {selectedSnippet.risk === "只读" ? <Shield size={20} /> : <AlertTriangle size={20} />}
            <span>
              <strong>{selectedSnippet.risk === "危险" ? "危险命令，已禁止直接执行" : selectedSnippet.risk === "变更" ? "变更命令，需要执行确认" : "只读命令"}</strong>
              <p>{selectedSnippet.risk === "危险" ? "请检查并调整命令后再填充到终端。" : selectedSnippet.risk === "变更" ? "执行将修改目标主机的运行状态。" : "该片段不会修改目标主机状态。"}</p>
            </span>
          </div>
          <section aria-labelledby="terminal-snippet-command-title"><h2 id="terminal-snippet-command-title">命令内容</h2><code>{selectedSnippet.command}</code></section>
          <dl>
            <div><dt>说明</dt><dd>{selectedSnippet.description}</dd></div>
            <div><dt>分类</dt><dd>{selectedSnippet.category}</dd></div>
            <div><dt>风险</dt><dd>{selectedSnippet.risk}</dd></div>
            <div><dt>最近使用</dt><dd>{selectedSnippet.lastUsed}</dd></div>
            <div><dt>目标会话</dt><dd>{selectedSession.user}@{selectedSession.host}</dd></div>
            <div><dt>会话状态</dt><dd>{connected ? "已打开" : "未打开"}</dd></div>
          </dl>
        </div>
      </DetailDrawer>
    )}
    {pendingSnippetRun && (
      <ConfirmDialog
        title="确认执行变更命令"
        message={`将在 ${selectedSession.user}@${selectedSession.host} 执行 ${pendingSnippetRun.title}，该操作会修改服务运行状态。`}
        detail={pendingSnippetRun.command}
        confirmLabel="确认执行"
        tone="warning"
        className="terminal-snippet-confirm"
        onClose={() => setPendingSnippetRunId(null)}
        onConfirm={confirmSnippetRun}
      />
    )}
    </>
  );
}

export { TerminalPage };
