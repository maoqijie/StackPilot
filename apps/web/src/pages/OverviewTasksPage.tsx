import { exportOverviewTasks, fetchOverviewTasks, refreshOverviewTasks, runOverviewTask } from "../api/overviewApi";
import type { OverviewMetricIcon, OverviewTaskPageData, OverviewTaskRecord } from "../api/overviewApi";
import { CalendarDays, Download, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { setQuickRoute } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { StatusLight } from "../components/ui/StatusVisuals";
import { overviewMetricIcons, reportApiError, taskTone } from "../features/overview/model";
import type { Notify, SetPage } from "../types/app";

function OverviewTasksPage({ notify, setPage }: { notify: Notify; setPage: SetPage }) {
  const [rows, setRows] = useState<OverviewTaskRecord[]>([]);
  const [pageData, setPageData] = useState<OverviewTaskPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OverviewTaskRecord | null>(null);
  const activeFilter = pageData?.filters.find((filter) => filter.id === tab) ?? pageData?.filters[0];
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const searchText = [row.type, row.title, row.target, row.status, row.priority, row.operator, row.source, row.duration, ...row.logs].join(" ").toLowerCase();
    const matchSearch = !query || searchText.includes(query);
    const matchTab = !activeFilter || activeFilter.statuses.length === 0 || activeFilter.statuses.includes(row.status);
    return matchSearch && matchTab;
  });
  const overviewMetricIconForTask = (icon: OverviewMetricIcon) => overviewMetricIcons[icon] ?? CalendarDays;

  useEffect(() => {
    const controller = new AbortController();
    fetchOverviewTasks(controller.signal)
      .then((payload) => {
        setRows(payload.tasks);
        setPageData(payload.page);
        setTab((current) => payload.page.filters.some((filter) => filter.id === current) ? current : payload.page.filters[0]?.id ?? "all");
        setSelected((current) => current ? payload.tasks.find((row) => row.id === current.id) ?? null : null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        reportApiError(error, notify, "任务流后端加载失败");
      });
    return () => controller.abort();
  }, [notify]);

  const applyTask = (task: OverviewTaskRecord) => {
    setRows((current) => current.map((row) => row.id === task.id ? task : row));
    setSelected((current) => current?.id === task.id ? task : current);
  };

  const refreshTasksFromApi = async () => {
    try {
      const payload = await refreshOverviewTasks();
      setRows(payload.tasks);
      setPageData(payload.page);
      setTab(payload.page.filters[0]?.id ?? "all");
      setSelected(payload.tasks[0] ?? null);
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "重新采集任务失败");
    }
  };

  const exportTasksFromApi = async () => {
    try {
      const payload = await exportOverviewTasks();
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "导出任务流失败");
    }
  };

  const runTaskFromApi = async (id: string) => {
    try {
      const payload = await runOverviewTask(id);
      setRows(payload.tasks);
      setPageData(payload.page);
      applyTask(payload.task);
      notify(payload.message, payload.tone ?? "success");
    } catch (error) {
      reportApiError(error, notify, "运行真实任务失败");
    }
  };
  const openScheduleCreate = () => {
    setPage("schedule-enabled", { message: "已打开真实定时任务创建", tone: "info" });
    window.requestAnimationFrame(() => setQuickRoute("schedule-enabled", "create-schedule"));
  };

  return (
    <ModulePageShell
      title={pageData?.title ?? "任务流"}
      subtitle={loading ? "正在从后端加载任务流。" : pageData?.subtitle ?? null}
      page="overview-tasks"
      viewContext={pageData?.context ?? false}
      actions={<><button className="ghost" type="button" onClick={exportTasksFromApi}><Download size={14} /> 导出</button><button className="ghost" type="button" onClick={openScheduleCreate}><Plus size={14} /> 新建计划任务</button><button className="primary" type="button" onClick={refreshTasksFromApi}><RefreshCw size={14} /> 重新采集</button></>}
      filters={<><div className="deploy-tabs">{(pageData?.filters ?? []).map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} type="button" onClick={() => setTab(item.id)}>{item.label}</button>)}</div><ModuleSearch value={search} placeholder={pageData?.searchPlaceholder ?? "搜索后端返回的任务"} onChange={setSearch} /></>}
      metrics={<>{(pageData?.metrics ?? []).map((metric) => <MetricTile key={metric.label} icon={overviewMetricIconForTask(metric.icon)} label={metric.label} value={metric.value} tone={metric.tone} />)}</>}
    >
      {selected && (
        <DetailDrawer title={selected.title} subtitle={`${selected.type} · ${selected.target}`} onClose={() => setSelected(null)} className="task-log-modal" modal>
          <div className="detail-kv">
            <p><span>状态</span><b><StatusLight tone={taskTone(selected.status)} /> {selected.status}</b></p>
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
      <DataTable
        columns={[
          { key: "type", label: "类型", width: "90px", render: (row) => <span className="pill blue">{row.type}</span> },
          { key: "title", label: "任务", width: "285px", render: (row) => <b>{row.title}</b> },
          { key: "target", label: "目标", width: "170px", render: (row) => row.target },
          { key: "status", label: "状态", width: "96px", render: (row) => <><StatusLight tone={taskTone(row.status)} /> {row.status}</> },
          { key: "priority", label: "优先级", width: "82px", render: (row) => row.priority },
          { key: "operator", label: "操作人", width: "96px", render: (row) => row.operator },
          { key: "queuedAt", label: "时间", width: "130px", render: (row) => row.queuedAt },
          { key: "duration", label: "耗时", width: "235px", render: (row) => row.duration },
          { key: "actions", label: "操作", width: "176px", render: (row) => (
            <div className="table-actions">
              <button type="button" onClick={() => setSelected(row)}>日志</button>
              <button type="button" onClick={() => void runTaskFromApi(row.id)}>{row.actionLabel}</button>
            </div>
          ) },
        ]}
        rows={filteredRows}
        emptyText="没有匹配的任务"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

export { OverviewTasksPage };
