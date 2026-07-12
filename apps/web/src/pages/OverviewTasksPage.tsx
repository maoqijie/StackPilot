import { exportOverviewTasks, fetchOverviewTasks, runOverviewTask } from "../api/overviewApi";
import type { OverviewMetricIcon, OverviewTaskPageData, OverviewTaskRecord, OverviewTaskStatus } from "../api/overviewApi";
import {
  CalendarDays,
  CheckCircle2,
  CircleX,
  Clock3,
  Download,
  ListRestart,
  LoaderCircle,
  Plus,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { setQuickRoute } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { overviewMetricIcons, reportApiError, taskTone } from "../features/overview/model";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import type { Notify, SetPage } from "../types/app";

const taskStatusIcons: Record<OverviewTaskStatus, LucideIcon> = {
  成功: CheckCircle2,
  运行中: LoaderCircle,
  等待: Clock3,
  失败: CircleX,
};

function OverviewTasksPage({ notify, setPage }: { notify: Notify; setPage: SetPage }) {
  const [rows, setRows] = useState<OverviewTaskRecord[]>([]);
  const [pageData, setPageData] = useState<OverviewTaskPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OverviewTaskRecord | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const activeFilter = pageData?.filters.find((filter) => filter.id === tab) ?? pageData?.filters[0];
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const searchText = [row.type, row.title, row.target, row.status, row.priority, row.operator, row.source, row.duration, ...row.logs].join(" ").toLowerCase();
    const matchSearch = !query || searchText.includes(query);
    const matchTab = !activeFilter || activeFilter.statuses.length === 0 || activeFilter.statuses.includes(row.status);
    return matchSearch && matchTab;
  });
  const overviewMetricIconForTask = (icon: OverviewMetricIcon) => overviewMetricIcons[icon] ?? CalendarDays;

  const syncTasks = useCallback((payload: Awaited<ReturnType<typeof fetchOverviewTasks>>) => {
    setRows(payload.tasks);
    setPageData(payload.page);
    setTab((current) => payload.page.filters.some((filter) => filter.id === current) ? current : payload.page.filters[0]?.id ?? "all");
    setSelected((current) => current ? payload.tasks.find((row) => row.id === current.id) ?? null : null);
  }, []);

  const loadTasks = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const payload = await fetchOverviewTasks(signal);
      syncTasks(payload);
    } catch (error) {
      if (signal?.aborted) return;
      const message = error instanceof Error ? error.message : "任务流后端加载失败";
      setLoadError(message);
      reportApiError(error, notify, "任务流后端加载失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [notify, syncTasks]);

  useEffect(() => {
    const controller = new AbortController();
    fetchOverviewTasks(controller.signal)
      .then((payload) => {
        syncTasks(payload);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "任务流后端加载失败";
        setLoadError(message);
        reportApiError(error, notify, "任务流后端加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [notify, syncTasks]);

  const autoRefreshTasks = useCallback(async (signal: AbortSignal) => {
    const payload = await fetchOverviewTasks(signal);
    syncTasks(payload);
  }, [syncTasks]);

  useAutoRefresh(autoRefreshTasks, undefined, !loading && !loadError);

  const exportTasksFromApi = async () => {
    try {
      const payload = await exportOverviewTasks();
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "导出任务流失败");
    }
  };

  const runTaskFromApi = async (id: string) => {
    if (runningTaskId) return;
    setRunningTaskId(id);
    try {
      const payload = await runOverviewTask(id);
      syncTasks(payload);
      notify(payload.message, payload.tone ?? "success");
    } catch (error) {
      reportApiError(error, notify, "运行真实任务失败");
    } finally {
      setRunningTaskId(null);
    }
  };

  const openScheduleCreate = () => {
    setPage("schedule-enabled", { message: "已打开真实定时任务创建", tone: "info" });
    window.requestAnimationFrame(() => setQuickRoute("schedule-enabled", "create-schedule"));
  };

  const freshness = pageData?.collectedAt;

  return (
    <ModulePageShell
      title={pageData?.title ?? "任务流"}
      subtitle={loading ? "正在加载设备任务与自动化执行记录" : pageData?.subtitle ?? "集中查看任务队列、状态与执行日志"}
      page="overview-tasks"
      viewContext={pageData?.context ?? false}
      actions={(
        <>
          <span className="task-page-freshness" role="status"><Clock3 size={14} aria-hidden="true" />{freshness ? `采集于 ${freshness}` : "等待采集"}</span>
          <button className="ghost" type="button" onClick={exportTasksFromApi}><Download size={14} /> 导出</button>
          <button className="ghost" type="button" onClick={openScheduleCreate}><Plus size={14} /> 新建计划任务</button>
        </>
      )}
      filters={(
        <>
          <div className="deploy-tabs" aria-label="任务状态筛选">
            {(pageData?.filters ?? []).map((item) => (
              <button key={item.id} className={tab === item.id ? "active" : ""} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>
            ))}
          </div>
          <ModuleSearch value={search} placeholder={pageData?.searchPlaceholder ?? "搜索后端返回的任务"} onChange={setSearch} />
        </>
      )}
      metrics={<>{(pageData?.metrics ?? []).map((metric) => <MetricTile key={metric.label} icon={overviewMetricIconForTask(metric.icon)} label={metric.label} value={metric.value} tone={metric.tone} />)}</>}
    >
      {selected && (
        <DetailDrawer title={selected.title} subtitle={`${selected.type} · ${selected.target}`} onClose={() => setSelected(null)} className="task-log-modal" modal>
          <div className="detail-kv task-detail-kv">
            <p><span>状态</span><b className={`task-inline-status ${taskTone(selected.status)}`}>{renderTaskStatusIcon(selected.status, 15)} {selected.status}</b></p>
            <p><span>优先级</span><b>{selected.priority}</b></p>
            <p><span>操作人</span><b>{selected.operator}</b></p>
            <p><span>排队时间</span><b>{selected.queuedAt}</b></p>
            <p><span>耗时</span><b>{selected.duration}</b></p>
            <p><span>来源</span><b>{selected.source}</b></p>
            <p><span>采集时间</span><b>{selected.collectedAt}</b></p>
          </div>
          <div className="overview-event-log">
            <strong>执行日志</strong>
            {selected.logs.map((log, index) => <p key={`${selected.id}-${index}-${log}`}><span>{index + 1}</span>{log}</p>)}
          </div>
        </DetailDrawer>
      )}

      <section className="task-workflow" aria-label="任务执行记录">
        <header className="task-workflow-head">
          <div>
            <strong>任务执行记录</strong>
            <span>{loading ? "正在采集" : `${filteredRows.length} 条结果`}</span>
          </div>
          {activeFilter && <span>{activeFilter.label}</span>}
        </header>

        {loading && rows.length === 0 && (
          <div className="task-page-state" role="status"><LoaderCircle className="is-spinning" size={20} />正在采集任务</div>
        )}
        {loadError && (
          <div className="task-page-state error" role="alert">
            <CircleX size={20} />
            <span><strong>任务数据暂不可用</strong><small>{loadError}</small></span>
            <button className="ghost small" type="button" onClick={() => void loadTasks()}><RefreshCw size={14} /> 重试</button>
          </div>
        )}
        {!loading && !loadError && filteredRows.length === 0 && (
          <div className="task-page-state" role="status"><Clock3 size={20} />没有匹配的任务，自动采集将继续运行</div>
        )}
        {!loadError && filteredRows.map((row) => (
          <TaskWorkflowRow
            key={row.id}
            task={row}
            running={runningTaskId === row.id}
            actionsDisabled={runningTaskId !== null}
            onOpen={() => setSelected(row)}
            onRun={() => void runTaskFromApi(row.id)}
          />
        ))}
      </section>
    </ModulePageShell>
  );
}

function TaskWorkflowRow({
  task,
  running,
  actionsDisabled,
  onOpen,
  onRun,
}: {
  task: OverviewTaskRecord;
  running: boolean;
  actionsDisabled: boolean;
  onOpen: () => void;
  onRun: () => void;
}) {
  const StatusIcon = taskStatusIcons[task.status];
  const tone = taskTone(task.status);
  return (
    <article className="task-workflow-row">
      <span className={`task-status-icon ${tone}`} title={task.status}><StatusIcon size={20} aria-hidden="true" /></span>
      <div className="task-row-primary">
        <span>{task.type}</span>
        <strong title={task.title}>{task.title}</strong>
        <small><span title={task.target}>{task.target}</span><span>{task.source}</span><span>{task.operator}</span><span>{task.priority}优先级</span></small>
      </div>
      <div className="task-row-time">
        <span>排队时间</span>
        <strong>{task.queuedAt}</strong>
        <small>采集 {task.collectedAt}</small>
      </div>
      <div className="task-row-result">
        <strong className={tone}>{task.status}</strong>
        <small>{task.duration}</small>
      </div>
      <div className="task-row-actions">
        <button type="button" onClick={onOpen}><TerminalSquare size={14} /> 日志</button>
        <button type="button" disabled={actionsDisabled} onClick={onRun}>
          {running ? <LoaderCircle className="is-spinning" size={14} /> : <ListRestart size={14} />}
          {running ? "运行中" : task.actionLabel}
        </button>
      </div>
    </article>
  );
}

function renderTaskStatusIcon(status: OverviewTaskStatus, size: number) {
  const StatusIcon = taskStatusIcons[status];
  return <StatusIcon size={size} aria-hidden="true" />;
}

export { OverviewTasksPage };
