import {
  ArchiveRestore,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CirclePause,
  Clock3,
  Download,
  FileClock,
  LoaderCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { databasePagePreset } from "../app/pagePresets";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import type { DatabaseBackupDrawer, DatabaseBackupPlan, DatabaseBackupTask, DatabaseRestorePoint } from "../features/databases/types";
import { initialDatabaseBackupPlans, initialDatabaseBackupTasks, initialDatabaseRestorePoints } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";
import { createLocalId } from "../utils/time";

type BackupStatusTone = "green" | "orange" | "red" | "gray";

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
  const completedTasks = tasks.filter((task) => task.status === "成功" || task.status === "失败");
  const successTasks = completedTasks.filter((task) => task.status === "成功").length;
  const successRate = completedTasks.length ? Math.round((successTasks / completedTasks.length) * 100) : null;
  const failedTasks = tasks.filter((task) => task.status === "失败").length;
  const runningTasks = tasks.filter((task) => task.status === "运行中").length;
  const enabledPlans = plans.filter((plan) => plan.enabled).length;
  const freshness = latestBackupFreshness(tasks, restorePoints);

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
  const completeRunningTasks = () => {
    if (!runningTasks) {
      notify("当前没有运行中的备份任务", "info");
      return;
    }
    const completedPlanIds = tasks.filter((task) => task.status === "运行中").map((task) => task.planId);
    setTasks((current) => current.map((task) => task.status === "运行中" ? { ...task, status: "成功", size: task.size === "计算中" || task.size === "-" ? "3.1 GB" : task.size, duration: "2分06秒" } : task));
    syncCompletedPlan(completedPlanIds);
    notify("运行中的备份任务已标记成功");
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={preset.subtitle}
      page={page}
      viewContext={{
        eyebrow: "数据库 / 备份计划",
        title: "备份与恢复",
        chips: [`已启用 ${enabledPlans}`, `运行中 ${runningTasks}`, `恢复点 ${restorePoints.length}`],
      }}
      actions={<><button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredPlans.length} 条备份计划`, "info")}><Download size={15} /> 导出</button><button className="primary" type="button" onClick={createPlan}><Plus size={15} /> 新建计划</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索计划、数据库或 cron" onChange={setSearch} /><FieldSelect label="状态" value={statusFilter} options={["全部", "已启用", "已暂停", "告警"]} onChange={setStatusFilter} /><FieldSelect label="存储" value={storageFilter} options={["全部", "S3", "MinIO", "本地"]} onChange={setStorageFilter} /></>}
      metrics={<BackupMetrics planCount={plans.length} enabledPlans={enabledPlans} successRate={successRate} failedTasks={failedTasks} freshness={freshness} />}
      side={(selectedDrawerPlan || selectedDrawerRestorePoint) && (
        <DetailDrawer
          className="backup-detail-drawer"
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
              <BackupStatus icon={backupPlanStatus(selectedDrawerPlan).icon} label={backupPlanStatus(selectedDrawerPlan).label} tone={backupPlanStatus(selectedDrawerPlan).tone} />
              <dl>
                <div><dt>计划名称</dt><dd>{selectedDrawerPlan.name}</dd></div>
                <div><dt>数据库</dt><dd><code>{selectedDrawerPlan.database}</code></dd></div>
                <div><dt>执行周期</dt><dd><code>{selectedDrawerPlan.schedule}</code></dd></div>
                <div><dt>保留策略</dt><dd>{selectedDrawerPlan.retention}</dd></div>
                <div><dt>存储目标</dt><dd>{selectedDrawerPlan.storage}</dd></div>
                <div><dt>最近执行</dt><dd>{selectedDrawerPlan.lastRun}</dd></div>
                <div><dt>成功率</dt><dd>{selectedDrawerPlan.successRate}%</dd></div>
              </dl>
              <div className="drawer-tip">计划操作会更新当前列表中的任务状态和最近执行时间。</div>
            </div>
          ) : selectedDrawerRestorePoint ? (
            <div className="backup-drawer-body">
              <BackupStatus {...restorePointStatus(selectedDrawerRestorePoint)} />
              <dl>
                <div><dt>数据库</dt><dd><code>{selectedDrawerRestorePoint.database}</code></dd></div>
                <div><dt>恢复点</dt><dd>{selectedDrawerRestorePoint.createdAt}</dd></div>
                <div><dt>存储位置</dt><dd><code>{selectedDrawerRestorePoint.storage}</code></dd></div>
                <div><dt>大小</dt><dd>{selectedDrawerRestorePoint.size}</dd></div>
                <div><dt>校验</dt><dd>{selectedDrawerRestorePoint.checksum}</dd></div>
                <div><dt>演练状态</dt><dd>{selectedDrawerRestorePoint.drillStatus}</dd></div>
              </dl>
              <div className="drawer-warning">恢复演练不会覆盖生产库，当前视图仅更新演练状态和校验标记。</div>
            </div>
          ) : null}
        </DetailDrawer>
      )}
    >
      <div className="database-backup-content">
        <section className="backup-workspace" aria-labelledby="backup-plans-title">
          <WorkspaceHeader id="backup-plans-title" icon={CalendarDays} title="备份计划" meta={`显示 ${filteredPlans.length} / ${plans.length} 个计划`} />
          <DataTable
            columns={[
              { key: "plan", label: "备份计划", width: "220px", render: (plan) => <button className="backup-plan-link" type="button" title={plan.name} aria-label={`查看 ${plan.name} 详情`} onClick={() => setDrawer({ type: "plan", id: plan.id })}><b>{plan.name}</b><span>{plan.lastRun === "未执行" ? "尚未执行" : `最近 ${plan.lastRun}`}</span></button> },
              { key: "database", label: "数据库", width: "150px", render: (plan) => <code className="backup-ellipsis" title={plan.database}>{plan.database}</code> },
              { key: "schedule", label: "周期", width: "120px", render: (plan) => <code>{plan.schedule}</code> },
              { key: "storage", label: "存储", width: "76px", render: (plan) => <span className="pill blue">{plan.storage}</span> },
              { key: "retention", label: "保留", width: "68px", render: (plan) => plan.retention },
              { key: "status", label: "状态", width: "106px", render: (plan) => <BackupStatus {...backupPlanStatus(plan)} compact /> },
              { key: "success", label: "成功率", width: "78px", render: (plan) => <strong>{plan.successRate}%</strong> },
              { key: "ops", label: "操作", width: "198px", render: (plan) => <PlanActions plan={plan} onRun={runPlanNow} onToggle={() => { const enabled = !plan.enabled; updatePlan(plan.id, { enabled }); notify(`${plan.name} 已${enabled ? "启用" : "暂停"}`, enabled ? "success" : "warning"); }} onDetail={() => setDrawer({ type: "plan", id: plan.id })} /> },
            ]}
            rows={filteredPlans}
            emptyText="没有匹配的备份计划"
            getRowKey={(plan) => plan.id}
            mobileCard={(plan) => <BackupPlanCard plan={plan} onRun={runPlanNow} onToggle={() => { const enabled = !plan.enabled; updatePlan(plan.id, { enabled }); notify(`${plan.name} 已${enabled ? "启用" : "暂停"}`, enabled ? "success" : "warning"); }} onDetail={() => setDrawer({ type: "plan", id: plan.id })} />}
          />
        </section>

        <section className="database-backup-lower">
          <div className="backup-workspace backup-task-workspace">
            <WorkspaceHeader id="backup-tasks-title" icon={FileClock} title="最近备份任务" meta={`${runningTasks} 个运行中`} action={runningTasks ? "完成运行中" : undefined} onAction={completeRunningTasks} />
            <div className="backup-task-list" aria-labelledby="backup-tasks-title">
              {tasks.map((task) => (
                <article key={task.id}>
                  <BackupStatus {...backupTaskStatus(task.status)} />
                  <span className="backup-task-identity"><b title={task.database}>{task.database}</b><em>{task.storage}</em></span>
                  <span className="backup-task-freshness"><Clock3 size={14} /><em>{task.startedAt}</em></span>
                  <span className="backup-task-result"><b>{task.size}</b><em>{task.duration}</em></span>
                  <button className={task.status === "失败" ? "backup-task-action warning" : "backup-task-action ghost"} type="button" aria-label={`${task.status === "失败" ? "重试" : "查看日志"} ${task.database}`} onClick={() => {
                    if (task.status === "失败") {
                      updateTask(task.id, { status: "运行中", startedAt: "刚刚", duration: "0秒" });
                      notify(`${task.database} 失败任务已重试`);
                      return;
                    }
                    notify(`${task.database} 任务日志已打开`, "info");
                  }}>{task.status === "失败" ? <><RotateCcw size={14} />重试</> : "日志"}</button>
                </article>
              ))}
            </div>
          </div>

          <div className="backup-workspace restore-workspace">
            <WorkspaceHeader id="restore-points-title" icon={ArchiveRestore} title="恢复点演练" meta={`${restorePoints.length} 个可用恢复点`} action={selectedRestorePoint ? "开始演练" : undefined} onAction={() => {
              if (selectedRestorePoint) {
                setDrawer({ type: "restore", id: selectedRestorePoint.id });
                notify(`${selectedRestorePoint.database} 恢复演练已准备`, "info");
              }
            }} />
            <div className="restore-point-list" aria-labelledby="restore-points-title">
              {restorePoints.map((point) => (
                <button key={point.id} className={point.id === restorePointId ? "active" : ""} type="button" aria-label={`选择恢复点 ${point.database} ${point.createdAt}`} aria-pressed={point.id === restorePointId} onClick={() => { setRestorePointId(point.id); setDrawer({ type: "restore", id: point.id }); }}>
                  <ArchiveRestore size={20} />
                  <span><b title={point.database}>{point.database}</b><code title={point.storage}>{point.storage}</code></span>
                  <span><b>{point.size}</b><em>{point.createdAt}</em></span>
                  <BackupStatus {...restorePointStatus(point)} compact />
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </ModulePageShell>
  );
}

function BackupMetrics({ planCount, enabledPlans, successRate, failedTasks, freshness }: { planCount: number; enabledPlans: number; successRate: number | null; failedTasks: number; freshness: string }) {
  return (
    <>
      <article className="backup-metric-summary">
        <CalendarDays className="blue" size={26} />
        <span>备份计划</span>
        <strong>{planCount}</strong>
        <em>{enabledPlans} 个已启用</em>
      </article>
      <article className="backup-metric-rate">
        <div className={`backup-progress ${successRate !== null && successRate < 90 ? "red" : "green"}`} style={{ "--progress": successRate ?? 0 } as React.CSSProperties} aria-label={successRate === null ? "任务成功率暂无数据" : `任务成功率 ${successRate}%`}>
          <span><strong>{successRate ?? "--"}</strong><em>{successRate === null ? "" : "%"}</em></span>
        </div>
        <span>已完成任务成功率</span>
        <em>{successRate === null ? "暂无已完成任务" : `${successRate}% 成功`}</em>
      </article>
      <article className="backup-metric-summary">
        {failedTasks ? <CircleAlert className="red" size={26} /> : <ShieldCheck className="green" size={26} />}
        <span>失败任务</span>
        <strong>{failedTasks}</strong>
        <em>{failedTasks ? "需要处理" : "当前无失败"}</em>
      </article>
      <article className="backup-metric-summary">
        <Clock3 className="purple" size={26} />
        <span>最近备份活动</span>
        <strong className="backup-freshness-value">{freshness}</strong>
        <em>任务或恢复点记录</em>
      </article>
    </>
  );
}

function WorkspaceHeader({ id, icon: Icon, title, meta, action, onAction }: { id: string; icon: LucideIcon; title: string; meta: string; action?: string; onAction?: () => void }) {
  return (
    <header className="backup-workspace-head">
      <span><Icon size={20} /><span><strong id={id}>{title}</strong><em>{meta}</em></span></span>
      {action && <button className="ghost small" type="button" onClick={onAction}>{action}</button>}
    </header>
  );
}

function BackupStatus({ icon: Icon, label, tone, compact = false }: { icon: LucideIcon; label: string; tone: BackupStatusTone; compact?: boolean }) {
  return <span className={`backup-status ${tone} ${compact ? "compact" : ""}`}><Icon size={compact ? 14 : 16} aria-hidden="true" /><span>{label}</span></span>;
}

function PlanActions({ plan, onRun, onToggle, onDetail }: { plan: DatabaseBackupPlan; onRun: (plan: DatabaseBackupPlan) => void; onToggle: () => void; onDetail: () => void }) {
  return (
    <span className="table-actions backup-plan-actions">
      <button type="button" aria-label={`立即备份 ${plan.name}`} onClick={() => onRun(plan)}>立即备份</button>
      <button type="button" aria-label={`${plan.enabled ? "暂停" : "启用"} ${plan.name}`} onClick={onToggle}>{plan.enabled ? "暂停" : "启用"}</button>
      <button type="button" aria-label={`打开 ${plan.name} 详情`} onClick={onDetail}>详情</button>
    </span>
  );
}

function BackupPlanCard({ plan, onRun, onToggle, onDetail }: { plan: DatabaseBackupPlan; onRun: (plan: DatabaseBackupPlan) => void; onToggle: () => void; onDetail: () => void }) {
  return (
    <div className="backup-plan-card">
      <header>
        <button type="button" title={plan.name} aria-label={`查看 ${plan.name} 详情`} onClick={onDetail}><strong>{plan.name}</strong><code>{plan.database}</code></button>
        <BackupStatus {...backupPlanStatus(plan)} compact />
      </header>
      <dl>
        <div><dt>周期</dt><dd><code>{plan.schedule}</code></dd></div>
        <div><dt>存储 / 保留</dt><dd>{plan.storage} · {plan.retention}</dd></div>
        <div><dt>最近执行</dt><dd>{plan.lastRun}</dd></div>
        <div><dt>成功率</dt><dd>{plan.successRate}%</dd></div>
      </dl>
      <PlanActions plan={plan} onRun={onRun} onToggle={onToggle} onDetail={onDetail} />
    </div>
  );
}

function backupPlanStatus(plan: DatabaseBackupPlan): { icon: LucideIcon; label: string; tone: BackupStatusTone } {
  if (!plan.enabled) return { icon: CirclePause, label: "已暂停", tone: "gray" };
  if (plan.health === "告警") return { icon: CircleAlert, label: "告警", tone: "red" };
  return { icon: CheckCircle2, label: "正常", tone: "green" };
}

function backupTaskStatus(status: DatabaseBackupTask["status"]): { icon: LucideIcon; label: string; tone: BackupStatusTone } {
  if (status === "成功") return { icon: CheckCircle2, label: "成功", tone: "green" };
  if (status === "失败") return { icon: CircleAlert, label: "失败", tone: "red" };
  if (status === "运行中") return { icon: LoaderCircle, label: "运行中", tone: "orange" };
  return { icon: Clock3, label: "等待", tone: "gray" };
}

function restorePointStatus(point: DatabaseRestorePoint): { icon: LucideIcon; label: string; tone: BackupStatusTone } {
  if (point.drillStatus === "演练中") return { icon: LoaderCircle, label: "演练中", tone: "orange" };
  if (point.drillStatus === "已完成") return { icon: CheckCircle2, label: "演练完成", tone: "green" };
  if (point.checksum === "待校验") return { icon: CircleAlert, label: "待校验", tone: "orange" };
  return { icon: ShieldCheck, label: "已校验", tone: "green" };
}

function latestBackupFreshness(tasks: DatabaseBackupTask[], restorePoints: DatabaseRestorePoint[]) {
  const timestamps = [
    ...tasks.map((task) => task.startedAt),
    ...restorePoints.map((point) => point.createdAt),
  ].filter((value) => value !== "等待窗口");
  return timestamps.sort((left, right) => relativeFreshnessRank(right) - relativeFreshnessRank(left))[0] ?? "等待采集";
}

function relativeFreshnessRank(value: string) {
  if (value === "刚刚") return 3 * 24 * 60;
  const match = value.match(/^(今天|昨天) (\d{2}):(\d{2})$/);
  if (!match) return 0;
  const day = match[1] === "今天" ? 2 : 1;
  return day * 24 * 60 + Number(match[2]) * 60 + Number(match[3]);
}

export { DatabaseBackupsPage };
