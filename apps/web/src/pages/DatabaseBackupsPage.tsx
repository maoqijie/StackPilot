import { CalendarDays, CheckCircle2, Download, Plus, RefreshCw, Shield } from "lucide-react";
import { useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch, PanelCard } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { StatusLight } from "../components/ui/StatusVisuals";
import type { DatabaseBackupDrawer, DatabaseBackupPlan, DatabaseBackupTask, DatabaseRestorePoint } from "../features/databases/types";
import { initialDatabaseBackupPlans, initialDatabaseBackupTasks, initialDatabaseRestorePoints } from "../mocks/demoData";
import { databasePagePreset } from "../app/pagePresets";
import type { Notify, PageKey } from "../types/app";
import { createLocalId, currentClock } from "../utils/time";

function DatabaseBackupsPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const preset = databasePagePreset(page);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [storageFilter, setStorageFilter] = useState("全部");
  const [plans, setPlans] = useState(initialDatabaseBackupPlans);
  const [tasks, setTasks] = useState(initialDatabaseBackupTasks);
  const [restorePoints, setRestorePoints] = useState(initialDatabaseRestorePoints);
  const [restorePointId, setRestorePointId] = useState(initialDatabaseRestorePoints[0]?.id ?? "");
  const [drawer, setDrawer] = useState<DatabaseBackupDrawer | null>(null);
  const [lastSync, setLastSync] = useState(currentClock());
  const selectedRestorePoint = restorePoints.find((point) => point.id === restorePointId) ?? restorePoints[0];
  const selectedDrawerPlan = drawer?.type === "plan" ? plans.find((plan) => plan.id === drawer.id) ?? null : null;
  const selectedDrawerRestorePoint = drawer?.type === "restore" ? restorePoints.find((point) => point.id === drawer.id) ?? null : null;
  const filteredPlans = plans.filter((plan) => {
    const keyword = search.trim().toLowerCase();
    const matchSearch = !keyword || `${plan.name} ${plan.database} ${plan.schedule}`.toLowerCase().includes(keyword);
    const matchStatus = statusFilter === "全部" || (statusFilter === "已启用" ? plan.enabled : statusFilter === "已暂停" ? !plan.enabled : plan.health === "告警");
    const matchStorage = storageFilter === "全部" || plan.storage === storageFilter;
    return matchSearch && matchStatus && matchStorage;
  });
  const successTasks = tasks.filter((task) => task.status === "成功").length;
  const successRate = tasks.length ? Math.round((successTasks / tasks.length) * 100) : 0;
  const failedTasks = tasks.filter((task) => task.status === "失败").length;
  const runningTasks = tasks.filter((task) => task.status === "运行中").length;
  const updatePlan = (id: string, patch: Partial<DatabaseBackupPlan>) => {
    setPlans((current) => current.map((plan) => plan.id === id ? { ...plan, ...patch } : plan));
  };
  const updateTask = (id: string, patch: Partial<DatabaseBackupTask>) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
  };
  const syncCompletedPlan = (planIds: string[]) => {
    const uniqueIds = new Set(planIds);
    setPlans((current) => current.map((plan) => uniqueIds.has(plan.id) ? { ...plan, health: plan.health === "告警" ? "正常" : plan.health, lastRun: "刚刚", successRate: Math.max(plan.successRate, 96.8) } : plan));
  };
  const updateRestorePoint = (id: string, patch: Partial<DatabaseRestorePoint>) => {
    setRestorePoints((current) => current.map((point) => point.id === id ? { ...point, ...patch } : point));
  };
  const runPlanNow = (plan: DatabaseBackupPlan) => {
    const task: DatabaseBackupTask = {
      id: createLocalId("db-bkp-task"),
      planId: plan.id,
      database: plan.database,
      storage: plan.storage,
      status: "运行中",
      startedAt: "刚刚",
      size: "计算中",
      duration: "0秒",
    };
    setTasks((current) => [task, ...current]);
    updatePlan(plan.id, { lastRun: "刚刚" });
    notify(`${plan.database} 已开始立即备份`);
  };
  const createPlan = () => {
    const next: DatabaseBackupPlan = {
      id: createLocalId("db-bkp-plan"),
      name: "新建备份计划",
      database: "staging-pg-03",
      storage: "S3",
      schedule: "0 3 * * *",
      retention: "7 份",
      enabled: false,
      health: "正常",
      lastRun: "未执行",
      successRate: 100,
    };
    setPlans((current) => [next, ...current]);
    setSearch("");
    setStatusFilter("全部");
    setStorageFilter("全部");
    setDrawer({ type: "plan", id: next.id });
    notify("备份计划已创建，默认处于暂停状态", "info");
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={`${preset.subtitle} · 最近同步 ${lastSync}`}
      page={page}
      viewContext={{
        eyebrow: "数据库 / 备份计划",
        title: "备份计划",
        chips: [`计划 ${plans.length}`, `失败 ${failedTasks}`, `恢复点 ${restorePoints.length}`],
      }}
      actions={<><button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredPlans.length} 条备份计划`, "info")}><Download size={15} /> 导出</button><button className="ghost" type="button" onClick={() => { setLastSync(currentClock()); notify("备份计划状态已刷新", "info"); }}><RefreshCw size={15} /> 刷新</button><button className="primary" type="button" onClick={createPlan}><Plus size={15} /> 新建计划</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索计划、数据库或 cron" onChange={setSearch} /><FieldSelect label="状态" value={statusFilter} options={["全部", "已启用", "已暂停", "告警"]} onChange={setStatusFilter} /><FieldSelect label="存储" value={storageFilter} options={["全部", "S3", "MinIO", "本地"]} onChange={setStorageFilter} /></>}
      metrics={<><MetricTile icon={CalendarDays} label="备份计划" value={`${plans.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="任务成功率" value={`${successRate}%`} tone="green" /><MetricTile icon={Shield} label="失败任务" value={`${failedTasks}`} tone={failedTasks ? "red" : "gray"} /></>}
      side={(selectedDrawerPlan || selectedDrawerRestorePoint) && (
        <DetailDrawer
          title={selectedDrawerPlan ? "备份计划详情" : "恢复演练"}
          subtitle={(selectedDrawerPlan ?? selectedDrawerRestorePoint)?.database}
          onClose={() => setDrawer(null)}
          actions={selectedDrawerPlan ? (
            <><button className="ghost" type="button" onClick={() => setDrawer(null)}>关闭</button><button className="primary" type="button" onClick={() => { runPlanNow(selectedDrawerPlan); setDrawer(null); }}>立即备份</button></>
          ) : selectedDrawerRestorePoint ? (
            <><button className="ghost" type="button" aria-label={`校验恢复点 ${selectedDrawerRestorePoint.database}`} onClick={() => { updateRestorePoint(selectedDrawerRestorePoint.id, { checksum: "已校验" }); notify(`${selectedDrawerRestorePoint.database} 校验已完成`, "info"); }}>校验</button><button className="primary" type="button" aria-label={`${selectedDrawerRestorePoint.drillStatus === "演练中" ? "完成" : "开始"}恢复演练 ${selectedDrawerRestorePoint.database}`} onClick={() => { updateRestorePoint(selectedDrawerRestorePoint.id, { drillStatus: selectedDrawerRestorePoint.drillStatus === "演练中" ? "已完成" : "演练中" }); notify(`${selectedDrawerRestorePoint.database} 恢复演练已${selectedDrawerRestorePoint.drillStatus === "演练中" ? "完成" : "创建"}`); }}>{selectedDrawerRestorePoint.drillStatus === "演练中" ? "完成演练" : "开始演练"}</button></>
          ) : null}
        >
          {selectedDrawerPlan ? (
            <div className="backup-drawer-body">
              <p><span>计划名称</span><b>{selectedDrawerPlan.name}</b></p>
              <p><span>执行周期</span><b>{selectedDrawerPlan.schedule}</b></p>
              <p><span>保留策略</span><b>{selectedDrawerPlan.retention}</b></p>
              <p><span>存储目标</span><b>{selectedDrawerPlan.storage}</b></p>
              <p><span>状态</span><b>{selectedDrawerPlan.enabled ? selectedDrawerPlan.health : "暂停"}</b></p>
              <p><span>最近执行</span><b>{selectedDrawerPlan.lastRun}</b></p>
              <p><span>成功率</span><b>{selectedDrawerPlan.successRate}%</b></p>
              <div className="drawer-tip">计划操作会更新当前列表中的任务状态和最近执行时间。</div>
            </div>
          ) : selectedDrawerRestorePoint ? (
            <div className="backup-drawer-body">
              <p><span>恢复点</span><b>{selectedDrawerRestorePoint.createdAt}</b></p>
              <p><span>存储位置</span><b>{selectedDrawerRestorePoint.storage}</b></p>
              <p><span>大小</span><b>{selectedDrawerRestorePoint.size}</b></p>
              <p><span>校验</span><b>{selectedDrawerRestorePoint.checksum}</b></p>
              <p><span>演练状态</span><b>{selectedDrawerRestorePoint.drillStatus}</b></p>
              <div className="drawer-warning">恢复演练不会覆盖生产库，当前视图仅更新演练状态和校验标记。</div>
            </div>
          ) : null}
        </DetailDrawer>
      )}
    >
      <div className="database-backup-content">
        <section className="backup-plan-section">
          <DataTable
            columns={[
              { key: "plan", label: "备份计划", width: "240px", render: (plan) => <button className="module-row-link" type="button" aria-label={`查看 ${plan.name} 详情`} onClick={() => setDrawer({ type: "plan", id: plan.id })}><StatusLight tone={backupPlanTone(plan)} /><b>{plan.name}</b></button> },
              { key: "database", label: "数据库", render: (plan) => <code>{plan.database}</code> },
              { key: "schedule", label: "周期", render: (plan) => plan.schedule },
              { key: "storage", label: "存储", render: (plan) => <span className="pill blue">{plan.storage}</span> },
              { key: "retention", label: "保留", render: (plan) => plan.retention },
              { key: "status", label: "状态", render: (plan) => <span className={`pill ${backupPlanTone(plan)}`}>{plan.enabled ? plan.health : "暂停"}</span> },
              { key: "success", label: "成功率", render: (plan) => <span className={plan.successRate < 90 ? "red-text" : "green-text"}>{plan.successRate}%</span> },
              { key: "ops", label: "操作", width: "230px", render: (plan) => <span className="table-actions"><button type="button" aria-label={`立即备份 ${plan.name}`} onClick={() => runPlanNow(plan)}>立即</button><button type="button" aria-label={`${plan.enabled ? "暂停" : "启用"} ${plan.name}`} onClick={() => { const enabled = !plan.enabled; updatePlan(plan.id, { enabled }); notify(`${plan.name} 已${enabled ? "启用" : "暂停"}`, enabled ? "success" : "warning"); }}>{plan.enabled ? "暂停" : "启用"}</button><button type="button" aria-label={`打开 ${plan.name} 详情`} onClick={() => setDrawer({ type: "plan", id: plan.id })}>详情</button></span> },
            ]}
            rows={filteredPlans}
            emptyText="没有匹配的备份计划"
            getRowKey={(plan) => plan.id}
          />
        </section>
        <section className="database-backup-lower">
          <PanelCard title="最近备份任务" action="完成运行中" onAction={() => {
            if (!runningTasks) {
              notify("当前没有运行中的备份任务", "info");
              return;
            }
            const completedPlanIds = tasks.filter((task) => task.status === "运行中").map((task) => task.planId);
            setTasks((current) => current.map((task) => task.status === "运行中" ? { ...task, status: "成功", size: task.size === "计算中" || task.size === "-" ? "3.1 GB" : task.size, duration: "2分06秒" } : task));
            syncCompletedPlan(completedPlanIds);
            notify("运行中的备份任务已标记成功");
          }}>
            <div className="backup-task-list">
              {tasks.map((task) => (
                <article key={task.id}>
                  <span><StatusLight tone={backupTaskTone(task.status)} /> <b>{task.database}</b></span>
                  <em>{task.startedAt} · {task.storage}</em>
                  <strong className={task.status === "失败" ? "red-text" : task.status === "成功" ? "green-text" : ""}>{task.status}</strong>
                  <i>{task.size} / {task.duration}</i>
                  <button type="button" aria-label={`${task.status === "失败" ? "重试" : "查看日志"} ${task.database}`} onClick={() => {
                    if (task.status === "失败") {
                      updateTask(task.id, { status: "运行中", startedAt: "刚刚", duration: "0秒" });
                      notify(`${task.database} 失败任务已重试`);
                      return;
                    }
                    notify(`${task.database} 任务日志已打开`, "info");
                  }}>{task.status === "失败" ? "重试" : "日志"}</button>
                </article>
              ))}
            </div>
          </PanelCard>
          <PanelCard title="恢复点演练" action="开始演练" onAction={() => {
            if (selectedRestorePoint) {
              setDrawer({ type: "restore", id: selectedRestorePoint.id });
              notify(`${selectedRestorePoint.database} 恢复演练已准备`, "info");
            }
          }}>
            <div className="restore-point-list">
              {restorePoints.map((point) => (
                <button key={point.id} className={point.id === restorePointId ? "active" : ""} type="button" aria-label={`选择恢复点 ${point.database} ${point.createdAt}`} aria-pressed={point.id === restorePointId} onClick={() => { setRestorePointId(point.id); setDrawer({ type: "restore", id: point.id }); }}>
                  <span><b>{point.database}</b><i>{point.createdAt}</i></span>
                  <em>{point.size}</em>
                  <strong>{point.checksum} · {point.drillStatus}</strong>
                </button>
              ))}
            </div>
          </PanelCard>
        </section>
      </div>
    </ModulePageShell>
  );
}

function backupPlanTone(plan: DatabaseBackupPlan) {
  if (!plan.enabled) return "gray";
  if (plan.health === "告警") return "red";
  return "green";
}

function backupTaskTone(status: DatabaseBackupTask["status"]) {
  if (status === "成功") return "green";
  if (status === "失败") return "red";
  if (status === "运行中") return "orange";
  return "gray";
}

export { DatabaseBackupsPage };
