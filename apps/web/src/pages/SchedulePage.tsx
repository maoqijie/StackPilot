import { createScheduleJob, deleteScheduleJob, fetchScheduleJobs, runScheduleJob, updateScheduleJob } from "../api/scheduleApi";
import type { ScheduleJob } from "../api/scheduleApi";
import { CalendarDays, CheckCircle2, Plus, Shield, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { useQuickIntent } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch, PanelCard } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine, ToggleLine } from "../components/ui/FormControls";
import { StatusLight } from "../components/ui/StatusVisuals";
import { createScheduleDraft, describeCronExpression, isLikelyCronExpression, scheduleCronPresets, scheduleCrontabPreview, schedulePagePreset } from "../features/schedule/model";
import type { ScheduleDraft } from "../features/schedule/model";
import { reportApiError } from "../features/overview/model";
import type { Notify, PageKey } from "../types/app";
import { activateOnKeyboard } from "../utils/focus";

function SchedulePage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState<ScheduleJob[]>([]);
  const [loading, setLoading] = useState(true);
  const schedulePreset = schedulePagePreset(page);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [stateByPage, setStateByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<
    | { type: "create" }
    | { type: "edit"; job: ScheduleJob }
    | { type: "detail"; id: string }
    | { type: "delete"; id: string }
    | null
  >(null);
  const [draft, setDraft] = useState<ScheduleDraft>(() => createScheduleDraft());
  const [saving, setSaving] = useState(false);
  const cronInputRef = useRef<HTMLInputElement>(null);
  const search = searchByPage[page] ?? schedulePreset.search;
  const stateFilter = stateByPage[page] ?? schedulePreset.state;
  const selectedJob = drawer?.type === "detail" || drawer?.type === "delete"
    ? rows.find((row) => row.id === drawer.id) ?? null
    : null;

  const openScheduleCreateFromQuick = useCallback(() => {
    setDraft(createScheduleDraft());
    setDrawer({ type: "create" });
  }, []);

  useQuickIntent("schedule-enabled", "create-schedule", openScheduleCreateFromQuick);
  useEffect(() => {
    const controller = new AbortController();
    fetchScheduleJobs(controller.signal)
      .then((payload) => {
        setRows(payload.jobs);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        reportApiError(error, notify, "定时任务后端加载失败");
      });
    return () => controller.abort();
  }, [notify]);

  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.name} ${row.cron} ${row.command}`.toLowerCase().includes(query);
    const matchState = stateFilter === "全部" || (stateFilter === "已启用" ? row.enabled : !row.enabled);
    const matchFailed = page === "schedule-failed" ? row.result === "失败" : true;
    return matchSearch && matchState && matchFailed;
  });
  const selectedJobVisible = selectedJob
    ? filteredRows.some((row) => row.id === selectedJob.id)
    : true;
  const selectedVisibleJob = selectedJobVisible ? selectedJob : null;

  const applySchedulePayload = (jobs: ScheduleJob[], selectedId?: string) => {
    setRows(jobs);
    setDrawer((current) => {
      if (!current || current.type === "create" || current.type === "edit") return current;
      return jobs.some((row) => row.id === current.id) ? current : null;
    });
    if (selectedId) setDrawer({ type: "detail", id: selectedId });
  };

  const saveJob = async () => {
    if (saving) return;
    const currentDrawer = drawer;
    const nextName = draft.name.trim();
    const nextCron = draft.cron.trim();
    const nextCommand = draft.command.trim();
    if (!nextName || !nextCron || !nextCommand) {
      notify("任务名、cron 和命令不能为空", "danger");
      return;
    }
    if (!isLikelyCronExpression(nextCron)) {
      notify("cron 需要是 5 段表达式，例如 0 4 * * *", "danger");
      return;
    }
    if (!currentDrawer || (currentDrawer.type !== "create" && currentDrawer.type !== "edit")) return;
    setSaving(true);
    try {
      const payload = currentDrawer.type === "edit"
        ? await updateScheduleJob(currentDrawer.job.id, { name: nextName, cron: nextCron, command: nextCommand, enabled: draft.enabled })
        : await createScheduleJob({ name: nextName, cron: nextCron, command: nextCommand, enabled: draft.enabled });
      applySchedulePayload(payload.jobs, payload.job.id);
      notify(payload.message, payload.tone ?? "success");
      setDrawer({ type: "detail", id: payload.job.id });
    } catch (error) {
      reportApiError(error, notify, "保存定时任务失败");
    } finally {
      setSaving(false);
    }
  };
  const requestDeleteJob = (row: ScheduleJob) => setDrawer({ type: "delete", id: row.id });
  const deleteJob = async (row: ScheduleJob) => {
    try {
      const payload = await deleteScheduleJob(row.id);
      setRows(payload.jobs);
      setDrawer(null);
      notify(payload.message, payload.tone ?? "warning");
    } catch (error) {
      reportApiError(error, notify, "删除定时任务失败");
    }
  };
  const runJobNow = async (row: ScheduleJob) => {
    try {
      const payload = await runScheduleJob(row.id);
      applySchedulePayload(payload.jobs, row.id);
      notify(payload.message, payload.tone ?? "success");
    } catch (error) {
      reportApiError(error, notify, "立即执行定时任务失败");
    }
  };
  const toggleJob = async (row: ScheduleJob) => {
    try {
      const payload = await updateScheduleJob(row.id, { enabled: !row.enabled });
      applySchedulePayload(payload.jobs, row.id);
      notify(payload.message, payload.tone ?? "success");
    } catch (error) {
      reportApiError(error, notify, "切换定时任务状态失败");
    }
  };
  const editJob = (row: ScheduleJob) => {
    setDraft({ name: row.name, cron: row.cron, command: row.command, enabled: row.enabled });
    setDrawer({ type: "edit", job: row });
  };
  const scheduleActionButtons = (row: ScheduleJob) => (
    <>
      <button type="button" onClick={() => toggleJob(row)}>{row.enabled ? "停用" : "启用"}</button>
      <button type="button" disabled={!row.enabled} onClick={() => runJobNow(row)}>执行</button>
      <button type="button" onClick={() => setDrawer({ type: "detail", id: row.id })}>详情</button>
      <button type="button" onClick={() => editJob(row)}>编辑</button>
      <button type="button" onClick={() => requestDeleteJob(row)}>删除</button>
    </>
  );
  const editingJobId = drawer?.type === "edit" ? drawer.job.id : undefined;
  const cronDescription = describeCronExpression(draft.cron);
  const cronHasError = draft.cron.trim().length > 0 && !isLikelyCronExpression(draft.cron);
  const crontabPreview = scheduleCrontabPreview(draft, editingJobId);
  const activeCronPreset = scheduleCronPresets.find((preset) => preset.cron === draft.cron.trim())?.cron ?? "custom";
  const scheduleDialog = drawer?.type === "create" || drawer?.type === "edit" ? (
    <DetailDrawer
      title={drawer.type === "edit" ? "编辑计划任务" : "新建计划任务"}
      subtitle={drawer.type === "edit" ? drawer.job.name : "当前用户 crontab"}
      onClose={() => { if (!saving) setDrawer(null); }}
      className="schedule-job-modal"
      modal
      actions={<><button className="ghost" type="button" disabled={saving} onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" disabled={saving} onClick={saveJob}>{saving ? "保存中..." : "保存任务"}</button></>}
    >
      <div className="schedule-modal-form">
        <div className="schedule-modal-source">
          <TerminalSquare size={17} />
          <div>
            <strong>当前用户 crontab</strong>
            <span>StackPilot 托管块</span>
          </div>
          <b>{draft.enabled ? "启用" : "停用"}</b>
        </div>
        <FormLine label="任务名" required value={draft.name} disabled={saving} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
        <section className="schedule-form-section" aria-label="执行周期">
          <div className="schedule-form-section-head">
            <span>执行周期</span>
            <em>{cronDescription}</em>
          </div>
          <div className="schedule-cron-presets">
            {scheduleCronPresets.map((preset) => (
              <button
                key={preset.cron}
                className={`schedule-preset-button ${activeCronPreset === preset.cron ? "active" : ""}`}
                type="button"
                disabled={saving}
                aria-pressed={activeCronPreset === preset.cron}
                onClick={() => setDraft((current) => ({ ...current, cron: preset.cron }))}
              >
                {preset.label}
              </button>
            ))}
            <button
              className={`schedule-preset-button ${activeCronPreset === "custom" ? "active" : ""}`}
              type="button"
              disabled={saving}
              aria-pressed={activeCronPreset === "custom"}
              onClick={() => cronInputRef.current?.focus()}
            >
              自定义
            </button>
          </div>
          <FormLine
            label="cron 表达式"
            required
            value={draft.cron}
            error={cronHasError ? "需要 5 段表达式" : undefined}
            inputRef={cronInputRef}
            disabled={saving}
            onChange={(value) => setDraft((current) => ({ ...current, cron: value }))}
          />
        </section>
        <FormLine label="命令" required value={draft.command} disabled={saving} onChange={(value) => setDraft((current) => ({ ...current, command: value }))} />
        <ToggleLine
          label="保存后启用任务"
          hint={draft.enabled ? "保存后写入可执行 crontab 行" : "仅保存任务配置，不写入执行行"}
          active={draft.enabled}
          disabled={saving}
          onToggle={(active) => setDraft((current) => ({ ...current, enabled: active }))}
        />
        <div className="schedule-command-preview">
          <div>
            <span>写入预览</span>
            <em>{draft.enabled ? "保存后生效" : "停用状态"}</em>
          </div>
          <code>{crontabPreview}</code>
        </div>
        <p className="schedule-managed-note">仅写入 StackPilot 托管块，保留当前用户 crontab 的其他行。</p>
      </div>
    </DetailDrawer>
  ) : drawer?.type === "detail" && selectedVisibleJob ? (
    <DetailDrawer title="任务详情" subtitle={selectedVisibleJob.name} onClose={() => setDrawer(null)} className="schedule-job-modal" modal actions={<><button className="ghost" type="button" onClick={() => editJob(selectedVisibleJob)}>编辑</button><button className="primary" type="button" disabled={!selectedVisibleJob.enabled} onClick={() => runJobNow(selectedVisibleJob)}>立即执行</button></>}>
      <div className="detail-kv">
        <p><span>cron</span><b>{selectedVisibleJob.cron}</b></p>
        <p><span>命令</span><b>{selectedVisibleJob.command}</b></p>
        <p><span>状态</span><b>{selectedVisibleJob.enabled ? "启用" : "停用"}</b></p>
        <p><span>下次执行</span><b>{selectedVisibleJob.nextRun}</b></p>
        <p><span>最近执行</span><b>{selectedVisibleJob.lastRun}</b></p>
        <p><span>结果</span><b>{selectedVisibleJob.result}</b></p>
      </div>
      <div className="terminal-log compact-log">
        <p>$ {selectedVisibleJob.command}</p>
        <p>{selectedVisibleJob.result === "失败" ? "最近一次立即执行失败" : selectedVisibleJob.result === "成功" ? "最近一次立即执行成功" : "等待 crontab 调度或手动执行"}</p>
      </div>
    </DetailDrawer>
  ) : drawer?.type === "delete" && selectedVisibleJob ? (
    <DetailDrawer title="删除定时任务" subtitle={selectedVisibleJob.name} onClose={() => setDrawer(null)} className="schedule-job-modal" modal actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="danger-soft" type="button" onClick={() => deleteJob(selectedVisibleJob)}>确认删除</button></>}>
      <div className="delete-confirm">
        <StatusLight tone="red" />
        <p>删除后会从 StackPilot 托管的当前用户 crontab 中移除。</p>
        <code>{selectedVisibleJob.cron} · {selectedVisibleJob.command}</code>
      </div>
    </DetailDrawer>
  ) : null;

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={loading ? "正在读取当前用户 crontab。" : schedulePreset.subtitle}
      page={page}
      actions={page === "schedule-failed" ? undefined : <button className="primary" type="button" onClick={openScheduleCreateFromQuick}><Plus size={15} /> 新建任务</button>}
      filters={<><ModuleSearch value={search} placeholder="搜索任务、cron 或命令" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="状态" value={stateFilter} options={["全部", "已启用", "已停用"]} onChange={(value) => setStateByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={<><MetricTile icon={CalendarDays} label="任务数" value={`${rows.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="启用" value={`${rows.filter((row) => row.enabled).length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${rows.filter((row) => row.result === "失败").length}`} tone="red" /><MetricTile icon={TerminalSquare} label="来源" value="cron" tone="orange" /></>}
    >
      {scheduleDialog}
      {schedulePreset.mode === "calendar" && (
        <div className="schedule-calendar">
          {filteredRows.map((row) => <article key={row.id} role="button" tabIndex={0} onClick={() => setDrawer({ type: "detail", id: row.id })} onKeyDown={(event) => activateOnKeyboard(event, () => setDrawer({ type: "detail", id: row.id }))}><span>{row.nextRun}</span><strong>{row.name}</strong><em>{row.cron}</em><b className={row.result === "失败" ? "red-text" : row.result === "成功" ? "green-text" : "orange-text"}>{row.enabled ? row.result : "已停用"}</b></article>)}
          {filteredRows.length === 0 && <p className="module-empty-card">当前筛选没有日历任务</p>}
        </div>
      )}
      <DataTable
        columns={[
          { key: "name", label: "任务", width: "190px", render: (row) => <button className="module-row-link" type="button" onClick={() => setDrawer({ type: "detail", id: row.id })}><CalendarDays size={15} /><b>{row.name}</b></button> },
          { key: "cron", label: "cron", render: (row) => <code>{row.cron}</code> },
          { key: "command", label: "命令", render: (row) => row.command },
          { key: "enabled", label: "启用", render: (row) => <span className={`pill ${row.enabled ? "green" : "blue"}`}>{row.enabled ? "启用" : "停用"}</span> },
          { key: "last", label: "最近执行", render: (row) => row.lastRun },
          { key: "result", label: "结果", render: (row) => <span className={`pill ${row.result === "成功" ? "green" : row.result === "失败" ? "red" : "blue"}`}>{row.result}</span> },
          { key: "ops", label: "操作", width: "370px", render: (row) => <span className="table-actions">{scheduleActionButtons(row)}</span> },
        ]}
        rows={filteredRows}
        emptyText="没有匹配的定时任务"
        getRowKey={(row) => row.id}
        mobileCard={(row) => (
          <>
            <div className="module-card-head">
              <button className="module-row-link" type="button" onClick={() => setDrawer({ type: "detail", id: row.id })}><CalendarDays size={15} /><b>{row.name}</b></button>
              <span className={`pill ${row.result === "成功" ? "green" : row.result === "失败" ? "red" : "blue"}`}>{row.result}</span>
            </div>
            <code className="module-card-code">{row.cron} · {row.command}</code>
            <div className="module-card-meta">
              <span><b>状态</b><em>{row.enabled ? "启用" : "停用"}</em></span>
              <span><b>最近</b><em>{row.lastRun}</em></span>
              <span><b>下次</b><em>{row.nextRun}</em></span>
              <span><b>结果</b><em>{row.result}</em></span>
            </div>
            <div className="module-card-footer">
              <div className="table-actions actions-5">
                {scheduleActionButtons(row)}
              </div>
            </div>
          </>
        )}
      />
      <section className="schedule-deleted-panel">
        <PanelCard title="真实来源">
          <div className="restore-mini-list">
            <p><TerminalSquare size={14} /><span>当前用户 crontab</span><em>仅管理 StackPilot 标记块，保留其他 crontab 行</em></p>
          </div>
        </PanelCard>
      </section>
    </ModulePageShell>
  );
}

export { SchedulePage };
