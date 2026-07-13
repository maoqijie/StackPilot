import { exportOverviewTasks, fetchOverviewTasks } from "../api/overviewApi";
import type { OverviewMetricIcon, OverviewTaskPageData, OverviewTaskRecord, OverviewTaskStatus } from "../api/overviewApi";
import {
  CalendarDays,
  CheckCircle2,
  CircleX,
  Clock3,
  Download,
  LoaderCircle,
  Plus,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { setQuickRoute } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile } from "../components/ui/Cards";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { useOptionalOverviewData } from "../features/overview/OverviewDataProvider";
import { overviewMetricIcons, reportApiError, taskTone } from "../features/overview/model";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import type { Notify, SetPage } from "../types/app";
import { formatBackendDateTime } from "../utils/time";

const taskStatusIcons: Record<OverviewTaskStatus, LucideIcon> = {
  成功: CheckCircle2,
  运行中: LoaderCircle,
  等待: Clock3,
  失败: CircleX,
  取消: CircleX,
  过期: Clock3,
};

function OverviewTasksPage({ notify, setPage }: { notify: Notify; setPage: SetPage }) {
  const shared = useOptionalOverviewData();
  const usesSharedOverview = shared !== null;
  const [localRows, setLocalRows] = useState<OverviewTaskRecord[]>([]);
  const [localPageData, setLocalPageData] = useState<OverviewTaskPageData | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = shared?.overview?.tasks ?? localRows;
  const pageData = shared?.overview?.taskPage ?? localPageData;
  const loading = shared ? shared.loading && !shared.overview : localLoading;
  const loadError = shared?.error ?? localError;
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const overviewMetricIconForTask = (icon: OverviewMetricIcon) => overviewMetricIcons[icon] ?? CalendarDays;

  const syncTasks = useCallback((payload: Awaited<ReturnType<typeof fetchOverviewTasks>>) => {
    setLocalRows(payload.tasks);
    setLocalPageData(payload.page);
  }, []);

  const loadTasks = useCallback(async (signal?: AbortSignal) => {
    setLocalLoading(true);
    setLocalError(null);
    try {
      const payload = await fetchOverviewTasks(signal);
      syncTasks(payload);
    } catch (error) {
      if (signal?.aborted) return;
      const message = error instanceof Error ? error.message : "任务流后端加载失败";
      setLocalError(message);
      reportApiError(error, notify, "任务流后端加载失败");
    } finally {
      if (!signal?.aborted) setLocalLoading(false);
    }
  }, [notify, syncTasks]);

  useEffect(() => {
    if (usesSharedOverview) return;
    const controller = new AbortController();
    fetchOverviewTasks(controller.signal)
      .then((payload) => {
        syncTasks(payload);
        setLocalError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "任务流后端加载失败";
        setLocalError(message);
        reportApiError(error, notify, "任务流后端加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLocalLoading(false);
      });
    return () => controller.abort();
  }, [notify, syncTasks, usesSharedOverview]);

  const autoRefreshTasks = useCallback(async (signal: AbortSignal) => {
    const payload = await fetchOverviewTasks(signal);
    syncTasks(payload);
  }, [syncTasks]);

  useAutoRefresh(autoRefreshTasks, undefined, !usesSharedOverview && !loading && !loadError);

  const exportTasksFromApi = async () => {
    try {
      const payload = await exportOverviewTasks();
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "导出任务流失败");
    }
  };

  const openScheduleCreate = () => {
    setPage("schedule-enabled", { message: "已打开真实定时任务创建", tone: "info" });
    window.requestAnimationFrame(() => setQuickRoute("schedule-enabled", "create-schedule"));
  };

  const freshness = pageData?.collectedAt ?? shared?.overview?.collectedAt;
  const retry = () => usesSharedOverview ? shared.reload() : loadTasks();

  return (
    <ModulePageShell
      title={pageData?.title ?? "任务流"}
      hideHeading
      page="overview-tasks"
      viewContext={false}
      actions={(
        <>
          <span className="task-page-freshness" role="status"><Clock3 size={14} aria-hidden="true" />{freshness ? `采集于 ${formatBackendDateTime(freshness)}` : "等待采集"}</span>
          <button className="ghost" type="button" onClick={exportTasksFromApi}><Download size={14} /> 导出</button>
          <button className="ghost" type="button" onClick={openScheduleCreate}><Plus size={14} /> 新建计划任务</button>
        </>
      )}
      metrics={<>{(pageData?.metrics ?? []).map((metric) => <MetricTile key={metric.label} icon={overviewMetricIconForTask(metric.icon)} label={metric.label} value={metric.value} tone={metric.tone} />)}</>}
    >
      {selected && (
        <DetailDrawer title={selected.title} subtitle={`${selected.type} · ${selected.target}`} onClose={() => setSelectedId(null)} className="task-log-modal" modal>
          <div className="detail-kv task-detail-kv">
            <p><span>状态</span><b className={`task-inline-status ${taskTone(selected.status)}`}>{renderTaskStatusIcon(selected.status, 15)} {selected.status}</b></p>
            <p><span>优先级</span><b>{selected.priority}</b></p>
            <p><span>操作人</span><b>{selected.operator}</b></p>
            <p><span>排队时间</span><b>{selected.queuedAt}</b></p>
            <p><span>耗时</span><b>{selected.duration}</b></p>
            <p><span>来源</span><b>{selected.source}</b></p>
            <p><span>采集时间</span><b>{formatBackendDateTime(selected.collectedAt)}</b></p>
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
            <span>{loading ? "正在采集" : `${rows.length} 条结果`}</span>
          </div>
        </header>

        {loading && rows.length === 0 && (
          <div className="task-page-state" role="status"><LoaderCircle className="is-spinning" size={20} />正在采集任务</div>
        )}
        {loadError && (
          <div className="task-page-state error" role="alert">
            <CircleX size={20} />
            <span><strong>任务数据暂不可用</strong><small>{loadError}</small></span>
            <button className="ghost small" type="button" onClick={() => void retry()}><RefreshCw size={14} /> 重试</button>
          </div>
        )}
        {!loading && !loadError && rows.length === 0 && (
          <div className="task-page-state" role="status"><Clock3 size={20} />暂无任务，自动采集将继续运行</div>
        )}
        {!loadError && rows.map((row) => (
          <TaskWorkflowRow
            key={row.id}
            task={row}
            onOpen={() => setSelectedId(row.id)}
          />
        ))}
      </section>
    </ModulePageShell>
  );
}

function TaskWorkflowRow({
  task,
  onOpen,
}: {
  task: OverviewTaskRecord;
  onOpen: () => void;
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
        <small>采集 {formatBackendDateTime(task.collectedAt)}</small>
      </div>
      <div className="task-row-result">
        <strong className={tone}>{task.status}</strong>
        <small>{task.duration}</small>
      </div>
      <div className="task-row-actions">
        <button type="button" onClick={onOpen}><TerminalSquare size={14} /> 日志</button>
      </div>
    </article>
  );
}

function renderTaskStatusIcon(status: OverviewTaskStatus, size: number) {
  const StatusIcon = taskStatusIcons[status];
  return <StatusIcon size={size} aria-hidden="true" />;
}

export { OverviewTasksPage };
