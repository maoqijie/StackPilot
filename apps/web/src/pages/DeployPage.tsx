import { Activity, CheckCircle2, CloudUpload, Plus } from "lucide-react";
import type { Permission } from "@stackpilot/contracts";
import { useRef, useState } from "react";
import { deployPagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FormLine } from "../components/ui/FormControls";
import type { DeployJob } from "../features/deployments/types";
import { initialDeployJobs } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";
import { SiteRollbacksWorkspace } from "../features/deployments/SiteRollbacksWorkspace";

function LegacyDeployPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialDeployJobs);
  const deployPreset = deployPagePreset(page);
  const [envByPage, setEnvByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<
    | { type: "create" }
    | { type: "deploy"; id: string }
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
  const env = envByPage[page] ?? deployPreset.env;
  const deployEnvOptions = ["生产", "预发", "开发"];
  const filteredRows = rows.filter((row) => row.env === env);
  const updateDeploy = (id: string, patch: Partial<DeployJob>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const selectedDeploy = drawer?.type === "deploy" ? rows.find((row) => row.id === drawer.id) ?? null : null;

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
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={deployPreset.subtitle}
      page={page}
      actions={<button className="primary" type="button" onClick={openDeployCreate}><Plus size={15} /> 创建部署任务</button>}
      filters={<div className="deploy-tabs">{deployEnvOptions.map((item) => <button key={item} className={item === env ? "active" : ""} type="button" onClick={() => setEnvByPage((current) => ({ ...current, [page]: item }))}>{item}</button>)}</div>}
      metrics={<><MetricTile icon={CloudUpload} label="当前环境" value={env} tone="blue" /><MetricTile icon={Activity} label="运行中" value={`${rows.filter((row) => row.status === "运行中").length}`} tone="orange" /><MetricTile icon={CheckCircle2} label="成功" value={`${rows.filter((row) => row.status === "成功").length}`} tone="green" /></>}
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
        <DetailDrawer className="deploy-log-drawer" title="部署日志" subtitle={`${selectedDeploy.app} ${selectedDeploy.version}`} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => redeployJob(selectedDeploy)}>重部署</button>{selectedDeploy.status === "运行中" && <button className="primary" type="button" onClick={() => completeDeploy(selectedDeploy)}>完成</button>}</>}>
          <div className="terminal-log compact-log">
            {deployLogLines(selectedDeploy).map((line) => <p key={line}>{line}</p>)}
          </div>
          <div className="detail-kv deploy-preview-kv">
            <p><span>状态</span><b>{selectedDeploy.status}</b></p>
            <p><span>耗时</span><b>{selectedDeploy.duration}</b></p>
          </div>
        </DetailDrawer>
      ) : null}
    >
      <DataTable
          columns={[
            { key: "app", label: "应用", width: "210px", render: (row) => <b className="blue-text" title={row.app}>{row.app}</b> },
            { key: "env", label: "环境", render: (row) => <span className="pill blue">{row.env}</span> },
            { key: "version", label: "版本", render: (row) => row.version },
            { key: "status", label: "状态", render: (row) => <span className={`pill ${row.status === "成功" ? "green" : row.status === "失败" ? "red" : "blue"}`}>{row.status}</span> },
            { key: "operator", label: "操作人", render: (row) => row.operator },
            { key: "duration", label: "耗时", render: (row) => row.duration },
            { key: "ops", label: "操作", width: "250px", render: (row) => <span className="table-actions">{row.status === "待发布" && <button type="button" onClick={() => startDeploy(row)}>开始</button>}{row.status === "运行中" && <button type="button" onClick={() => completeDeploy(row)}>完成</button>}<button type="button" onClick={() => setDrawer({ type: "deploy", id: row.id })}>日志</button><button type="button" onClick={() => redeployJob(row)}>重部署</button></span> },
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
                  <button type="button" onClick={() => setDrawer({ type: "deploy", id: row.id })}>日志</button>
                  <button type="button" onClick={() => redeployJob(row)}>重部署</button>
                </div>
              </div>
            </>
          )}
      />
    </ModulePageShell>
  );
}

function DeployPage({ page, notify, permissions = [] }: { page: PageKey; notify: Notify; permissions?: Permission[] }) {
  return page === "deploy-rollbacks"
    ? <SiteRollbacksWorkspace notify={notify} permissions={permissions} />
    : <LegacyDeployPage page={page} notify={notify} />;
}

export { DeployPage };
