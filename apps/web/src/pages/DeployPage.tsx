import { Activity, CheckCircle2, CircleAlert, CircleCheck, CircleDot, CloudUpload, Plus, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { deployPagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FormLine } from "../components/ui/FormControls";
import type { DeployJob, RollbackRecord } from "../features/deployments/types";
import { initialDeployJobs, initialRollbackRecords } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";
import { currentClock } from "../utils/time";

function DeployPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialDeployJobs);
  const [rollbackRows, setRollbackRows] = useState(initialRollbackRecords);
  const [rollbackDeployIds, setRollbackDeployIds] = useState<Record<string, string>>({});
  const deployPreset = deployPagePreset(page);
  const [envByPage, setEnvByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<
    | { type: "create" }
    | { type: "deploy"; id: string }
    | { type: "rollback"; id: string }
    | null
  >(null);
  const [draft, setDraft] = useState({
    app: "web-console",
    version: "release-2026.06.22",
    operator: "管理员",
  });
  const [draftErrors, setDraftErrors] = useState<{ app?: string; version?: string }>({});
  const deployAppRef = useRef<HTMLInputElement>(null);
  const deployVersionRef = useRef<HTMLInputElement>(null);
  const isRollbackMode = deployPreset.mode === "rollbacks";
  const env = envByPage[page] ?? deployPreset.env;
  const deployEnvOptions = isRollbackMode ? ["全部", "生产", "预发", "开发"] : ["生产", "预发", "开发"];
  const filteredRows = rows.filter((row) => row.env === env);
  const filteredRollbackRows = rollbackRows.filter((row) => env === "全部" || row.env === env);
  const updateDeploy = (id: string, patch: Partial<DeployJob>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const updateRollback = (id: string, patch: Partial<RollbackRecord>) => setRollbackRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const selectedDeploy = drawer?.type === "deploy" ? rows.find((row) => row.id === drawer.id) ?? null : null;
  const selectedRollback = drawer?.type === "rollback" ? rollbackRows.find((row) => row.id === drawer.id) ?? null : null;
  const linkedDeployIdForRollback = (row: RollbackRecord) => (
    rollbackDeployIds[row.id] ?? rows.find((deploy) => deploy.app === row.app && deploy.env === row.env && deploy.version === row.fromVersion)?.id
  );

  const createDeploy = () => {
    const nextApp = draft.app.trim();
    const nextVersion = draft.version.trim();
    const nextErrors = {
      app: nextApp ? undefined : "请输入应用名",
      version: nextVersion ? undefined : "请输入版本号",
    };
    setDraftErrors(nextErrors);
    if (nextErrors.app || nextErrors.version) {
      notify(nextErrors.app ?? "版本号不能为空", "danger");
      window.requestAnimationFrame(() => (nextErrors.app ? deployAppRef : deployVersionRef).current?.focus());
      return;
    }
    const next: DeployJob = {
      id: `dep-${Date.now()}`,
      app: nextApp,
      env,
      version: nextVersion,
      status: "运行中",
      operator: draft.operator.trim() || "管理员",
      duration: "运行中",
    };
    setRows((current) => [next, ...current]);
    setDrawer({ type: "deploy", id: next.id });
    notify(`${env} 部署任务已创建`, "info");
  };
  const startDeploy = (row: DeployJob) => {
    updateDeploy(row.id, { status: "运行中", duration: "运行中" });
    notify(`${row.app} 已开始发布`, "info");
  };
  const completeDeploy = (row: DeployJob) => {
    updateDeploy(row.id, { status: "成功", duration: "1分02秒" });
    notify(`${row.app} 部署已完成`);
  };
  const redeployJob = (row: DeployJob) => {
    updateDeploy(row.id, { status: "运行中", duration: "运行中" });
    setDrawer({ type: "deploy", id: row.id });
    notify(`${row.app} 已重新部署`, "info");
  };
  const rollbackDeploy = (row: DeployJob) => {
    const rollback: RollbackRecord = {
      id: `rb-${Date.now()}`,
      app: row.app,
      env: row.env,
      fromVersion: row.version,
      targetVersion: "上一健康版本",
      status: "回滚中",
      operator: row.operator,
      reason: "从部署任务发起回滚",
      createdAt: currentClock(),
    };
    setRollbackRows((current) => [rollback, ...current]);
    setRollbackDeployIds((current) => ({ ...current, [rollback.id]: row.id }));
    updateDeploy(row.id, { status: "运行中", duration: "回滚中" });
    setDrawer({ type: "rollback", id: rollback.id });
    notify(`${row.app} 已开始回滚`, "warning");
  };
  const toggleRollback = (row: RollbackRecord) => {
    const nextStatus = row.status === "回滚中" ? "已回滚" : "回滚中";
    updateRollback(row.id, { status: nextStatus, createdAt: row.status === "回滚中" ? row.createdAt : currentClock() });
    const deployId = linkedDeployIdForRollback(row);
    if (deployId) {
      updateDeploy(deployId, { status: nextStatus === "已回滚" ? "成功" : "运行中", duration: nextStatus === "已回滚" ? "已回滚" : "回滚中" });
    }
    notify(`${row.app} ${row.status === "回滚中" ? "回滚已完成" : "已开始回滚"}`, row.status === "回滚中" ? "success" : "warning");
  };
  const retryRollback = (row: RollbackRecord) => {
    updateRollback(row.id, { status: "回滚中", createdAt: currentClock() });
    const deployId = linkedDeployIdForRollback(row);
    if (deployId) updateDeploy(deployId, { status: "运行中", duration: "回滚中" });
    setDrawer({ type: "rollback", id: row.id });
    notify(`${row.app} 已重新执行回滚`, "info");
  };
  const openDeployCreate = () => {
    setDraft({
      app: env === "生产" ? "shop-web" : env === "预发" ? "admin-console" : "worker",
      version: `release-${new Date().toISOString().slice(0, 10)}`,
      operator: "管理员",
    });
    setDraftErrors({});
    setDrawer({ type: "create" });
  };
  const deployLogLines = (row: DeployJob) => [
    `checkout ${row.version}`,
    `install dependencies for ${row.app}`,
    row.status === "待发布" ? "waiting for operator approval" : row.status === "运行中" ? "health check running..." : row.status === "失败" ? "deploy failed: health check timeout" : "deploy finished",
    `env=${row.env} operator=${row.operator} duration=${row.duration}`,
  ];
  const rollbackLogLines = (row: RollbackRecord) => [
    `rollback requested by ${row.operator}`,
    `current ${row.fromVersion}`,
    `target ${row.targetVersion}`,
    row.status === "已回滚" ? "rollback completed, traffic restored" : row.status === "回滚中" ? "switching release pointer and draining traffic" : "rollback candidate is ready",
    row.reason,
  ];
  const rollbackStatusIcon = (status: RollbackRecord["status"]) => {
    if (status === "已回滚") return <CircleCheck size={14} aria-hidden="true" />;
    if (status === "回滚中") return <CircleDot size={14} aria-hidden="true" />;
    return <CircleAlert size={14} aria-hidden="true" />;
  };
  const rollbackStatusClass = (status: RollbackRecord["status"]) => (
    status === "已回滚" ? "green" : status === "回滚中" ? "blue" : "orange"
  );

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={deployPreset.subtitle}
      page={page}
      actions={!isRollbackMode && <button className="primary" type="button" onClick={openDeployCreate}><Plus size={15} /> 创建部署任务</button>}
      filters={<div className="deploy-tabs">{deployEnvOptions.map((item) => <button key={item} className={item === env ? "active" : ""} type="button" onClick={() => setEnvByPage((current) => ({ ...current, [page]: item }))}>{item}</button>)}</div>}
      metrics={isRollbackMode
        ? <><MetricTile icon={RefreshCw} label="可回滚" value={`${rollbackRows.filter((row) => row.status === "可回滚").length}`} tone="blue" /><MetricTile icon={Activity} label="回滚中" value={`${rollbackRows.filter((row) => row.status === "回滚中").length}`} tone="orange" /><MetricTile icon={CheckCircle2} label="已回滚" value={`${rollbackRows.filter((row) => row.status === "已回滚").length}`} tone="green" /></>
        : <><MetricTile icon={CloudUpload} label="当前环境" value={env} tone="blue" /><MetricTile icon={Activity} label="运行中" value={`${rows.filter((row) => row.status === "运行中").length}`} tone="orange" /><MetricTile icon={CheckCircle2} label="成功" value={`${rows.filter((row) => row.status === "成功").length}`} tone="green" /></>}
      sideModal={drawer?.type === "create"}
      side={drawer?.type === "create" ? (
        <DetailDrawer className="deploy-create-drawer" modal title="创建部署任务" subtitle={env} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={createDeploy}>创建并运行</button></>}>
          <FormLine label="应用" required value={draft.app} inputRef={deployAppRef} error={draftErrors.app} onChange={(value) => { setDraft((current) => ({ ...current, app: value })); setDraftErrors((current) => ({ ...current, app: undefined })); }} />
          <FormLine label="版本" required value={draft.version} inputRef={deployVersionRef} error={draftErrors.version} onChange={(value) => { setDraft((current) => ({ ...current, version: value })); setDraftErrors((current) => ({ ...current, version: undefined })); }} />
          <FormLine label="操作人" value={draft.operator} onChange={(value) => setDraft((current) => ({ ...current, operator: value }))} />
          <div className="detail-kv deploy-preview-kv">
            <p><span>目标环境</span><b>{env}</b></p>
            <p><span>初始状态</span><b>运行中</b></p>
          </div>
        </DetailDrawer>
      ) : selectedDeploy ? (
        <DetailDrawer className="deploy-log-drawer" title="部署日志" subtitle={`${selectedDeploy.app} ${selectedDeploy.version}`} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => redeployJob(selectedDeploy)}>重部署</button>{selectedDeploy.status === "运行中" ? <button className="primary" type="button" onClick={() => completeDeploy(selectedDeploy)}>完成</button> : <button className="primary" type="button" onClick={() => rollbackDeploy(selectedDeploy)}>回滚</button>}</>}>
          <div className="terminal-log compact-log">
            {deployLogLines(selectedDeploy).map((line) => <p key={line}>{line}</p>)}
          </div>
          <div className="detail-kv deploy-preview-kv">
            <p><span>状态</span><b>{selectedDeploy.status}</b></p>
            <p><span>耗时</span><b>{selectedDeploy.duration}</b></p>
          </div>
        </DetailDrawer>
      ) : selectedRollback ? (
        <DetailDrawer className="deploy-rollback-drawer" title="回滚日志" subtitle={`${selectedRollback.app} ${selectedRollback.fromVersion} -> ${selectedRollback.targetVersion}`} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => retryRollback(selectedRollback)}>重试</button>{selectedRollback.status !== "已回滚" && <button className="primary" type="button" onClick={() => toggleRollback(selectedRollback)}>{selectedRollback.status === "回滚中" ? "完成回滚" : "执行回滚"}</button>}</>}>
          <div className="terminal-log compact-log">
            {rollbackLogLines(selectedRollback).map((line) => <p key={line}>{line}</p>)}
          </div>
        </DetailDrawer>
      ) : null}
    >
      {isRollbackMode ? (
        <DataTable
          columns={[
            { key: "app", label: "应用", width: "190px", render: (row) => <b className="blue-text" title={row.app}>{row.app}</b> },
            { key: "env", label: "环境", render: (row) => <span className="pill blue">{row.env}</span> },
            { key: "from", label: "当前版本", render: (row) => row.fromVersion },
            { key: "target", label: "目标版本", render: (row) => row.targetVersion },
            { key: "status", label: "状态", render: (row) => <span className={`pill status-with-icon ${rollbackStatusClass(row.status)}`}>{rollbackStatusIcon(row.status)}{row.status}</span> },
            { key: "reason", label: "原因", render: (row) => row.reason },
            { key: "ops", label: "操作", width: "220px", render: (row) => <span className="table-actions">{row.status !== "已回滚" && <button type="button" onClick={() => toggleRollback(row)}>{row.status === "回滚中" ? "完成" : "执行"}</button>}<button type="button" onClick={() => setDrawer({ type: "rollback", id: row.id })}>日志</button>{row.status !== "已回滚" && <button type="button" onClick={() => retryRollback(row)}>重试</button>}</span> },
          ]}
          rows={filteredRollbackRows}
          emptyText="当前筛选没有回滚记录"
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
            <>
              <div className="module-card-head">
                <span className="module-card-title"><RefreshCw size={15} /><b>{row.app}</b></span>
                <span className={`pill status-with-icon ${rollbackStatusClass(row.status)}`}>{rollbackStatusIcon(row.status)}{row.status}</span>
              </div>
              <code className="module-card-code">{`${row.fromVersion} -> ${row.targetVersion}`}</code>
              <div className="module-card-meta">
                <span><b>环境</b><em>{row.env}</em></span>
                <span><b>操作人</b><em>{row.operator}</em></span>
                <span><b>时间</b><em>{row.createdAt}</em></span>
                <span className="module-card-span-2"><b>原因</b><em>{row.reason}</em></span>
              </div>
              <div className="module-card-footer">
                <div className={`table-actions ${row.status === "已回滚" ? "actions-1" : "actions-3"}`}>
                  {row.status !== "已回滚" && <button type="button" onClick={() => toggleRollback(row)}>{row.status === "回滚中" ? "完成" : "执行"}</button>}
                  <button type="button" onClick={() => setDrawer({ type: "rollback", id: row.id })}>日志</button>
                  {row.status !== "已回滚" && <button type="button" onClick={() => retryRollback(row)}>重试</button>}
                </div>
              </div>
            </>
          )}
        />
      ) : (
        <DataTable
          columns={[
            { key: "app", label: "应用", width: "210px", render: (row) => <b className="blue-text" title={row.app}>{row.app}</b> },
            { key: "env", label: "环境", render: (row) => <span className="pill blue">{row.env}</span> },
            { key: "version", label: "版本", render: (row) => row.version },
            { key: "status", label: "状态", render: (row) => <span className={`pill ${row.status === "成功" ? "green" : row.status === "失败" ? "red" : "blue"}`}>{row.status}</span> },
            { key: "operator", label: "操作人", render: (row) => row.operator },
            { key: "duration", label: "耗时", render: (row) => row.duration },
            { key: "ops", label: "操作", width: "290px", render: (row) => <span className="table-actions">{row.status === "待发布" && <button type="button" onClick={() => startDeploy(row)}>开始</button>}{row.status === "运行中" && <button type="button" onClick={() => completeDeploy(row)}>完成</button>}<button type="button" onClick={() => rollbackDeploy(row)}>回滚</button><button type="button" onClick={() => setDrawer({ type: "deploy", id: row.id })}>日志</button><button type="button" onClick={() => redeployJob(row)}>重部署</button></span> },
          ]}
          rows={filteredRows}
          emptyText="当前环境没有部署任务"
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
            <>
              <div className="module-card-head">
                <span className="module-card-title"><CloudUpload size={15} /><b>{row.app}</b></span>
                <span className={`pill ${row.status === "成功" ? "green" : row.status === "失败" ? "red" : "blue"}`}>{row.status}</span>
              </div>
              <code className="module-card-code">{row.version}</code>
              <div className="module-card-meta">
                <span><b>环境</b><em>{row.env}</em></span>
                <span><b>操作人</b><em>{row.operator}</em></span>
                <span><b>耗时</b><em>{row.duration}</em></span>
                <span><b>状态</b><em>{row.status}</em></span>
              </div>
              <div className="module-card-footer">
                <div className={`table-actions ${row.status === "待发布" || row.status === "运行中" ? "" : "actions-3"}`}>
                  {row.status === "待发布" && <button type="button" onClick={() => startDeploy(row)}>开始</button>}
                  {row.status === "运行中" && <button type="button" onClick={() => completeDeploy(row)}>完成</button>}
                  <button type="button" onClick={() => rollbackDeploy(row)}>回滚</button>
                  <button type="button" onClick={() => setDrawer({ type: "deploy", id: row.id })}>日志</button>
                  <button type="button" onClick={() => redeployJob(row)}>重部署</button>
                </div>
              </div>
            </>
          )}
        />
      )}
    </ModulePageShell>
  );
}

export { DeployPage };
