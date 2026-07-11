import { Activity, CheckCircle2, Clock3, Download, Eye, Plus, RefreshCw, Server, Shield } from "lucide-react";
import { useRef, useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { uniqueSorted } from "../utils/data";
import type { TableColumn } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine, FormSelectLine } from "../components/ui/FormControls";
import { Bar, StatusLight } from "../components/ui/StatusVisuals";
import { isValidIpv4Address } from "../features/firewall/validation";
import { hostHasHighResource, hostHasStaleBackup, hostHealthOptions, hostHighestResource, hostMatchesHealth, hostNeedsAttention, hostPagePreset, hostPressureScore, hostResourceTone, hostRiskReasons, hostServiceSummary, hostStatusTone, hostViewContext, isCleanUpdate, percentValue } from "../features/hosts/model";
import type { HostPageMode, HostRecord } from "../features/hosts/types";
import { initialHostRecords } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";
import { currentClock } from "../utils/time";

function HostMetrics({ mode, rows, filteredRows }: { mode: HostPageMode; rows: HostRecord[]; filteredRows: HostRecord[] }) {
  const productionRows = rows.filter((row) => row.env === "生产");
  const currentRows = mode === "inventory" ? rows : filteredRows;
  if (mode === "production") {
    return (
      <>
        <MetricTile icon={Server} label="生产主机" value={`${productionRows.length}`} tone="blue" />
        <MetricTile icon={Activity} label="高水位" value={`${productionRows.filter(hostHasHighResource).length}`} tone="orange" />
        <MetricTile icon={RefreshCw} label="待更新" value={`${productionRows.filter((row) => !isCleanUpdate(row.update)).length}`} tone="purple" />
      </>
    );
  }
  if (mode === "alerts") {
    return (
      <>
        <MetricTile icon={Shield} label="待处理" value={`${rows.filter(hostNeedsAttention).length}`} tone="orange" />
        <MetricTile icon={Activity} label="资源高压" value={`${rows.filter(hostHasHighResource).length}`} tone="red" />
        <MetricTile icon={Clock3} label="备份滞后" value={`${rows.filter(hostHasStaleBackup).length}`} tone="purple" />
      </>
    );
  }
  return (
    <>
      <MetricTile icon={Server} label="主机总数" value={`${currentRows.length}`} tone="blue" />
      <MetricTile icon={CheckCircle2} label="健康" value={`${rows.filter((row) => row.health === "健康").length}`} tone="green" />
      <MetricTile icon={Shield} label="需关注" value={`${rows.filter(hostNeedsAttention).length}`} tone="orange" />
    </>
  );
}

function HostPressureCell({ row }: { row: HostRecord }) {
  const resources = [
    { label: "CPU", value: row.cpu },
    { label: "内存", value: row.memory },
    { label: "磁盘", value: row.disk },
  ].sort((left, right) => percentValue(right.value) - percentValue(left.value));
  const primary = resources[0];
  return (
    <div className="host-pressure-cell">
      <span>{primary.label}</span>
      <Bar value={primary.value} tone={hostResourceTone(primary.value)} />
    </div>
  );
}

function HostRiskTags({ row }: { row: HostRecord }) {
  return (
    <span className="host-risk-tags">
      {hostRiskReasons(row).slice(0, 3).map((reason) => <em key={reason}>{reason}</em>)}
    </span>
  );
}

function HostServices({ row }: { row: HostRecord }) {
  return (
    <span className="host-service-pills">
      {row.services.slice(0, 3).map((service) => <em key={service}>{service}</em>)}
    </span>
  );
}

function HostsPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialHostRecords);
  const hostPreset = hostPagePreset(page);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [envByPage, setEnvByPage] = useState<Record<string, string>>({});
  const [healthByPage, setHealthByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<{ type: "detail" | "create"; host?: HostRecord } | null>(null);
  const [draft, setDraft] = useState({ name: "panel-new-05", ip: "10.0.4.55", env: "开发" });
  const [draftErrors, setDraftErrors] = useState<{ name?: string; ip?: string }>({});
  const draftNameRef = useRef<HTMLInputElement>(null);
  const draftIpRef = useRef<HTMLInputElement>(null);
  const search = searchByPage[page] ?? hostPreset.search;
  const envFilter = envByPage[page] ?? hostPreset.env;
  const healthFilter = healthByPage[page] ?? hostPreset.health;
  const productionRows = rows.filter((row) => row.env === "生产");
  const alertRows = rows.filter(hostNeedsAttention);

  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || row.name.toLowerCase().includes(query) || row.ip.includes(query) || row.os.toLowerCase().includes(query);
    const matchEnv = envFilter === "全部" || row.env === envFilter;
    const matchHealth = hostMatchesHealth(row, healthFilter);
    return matchSearch && matchEnv && matchHealth;
  });

  const updateHost = (id: string, patch: Partial<HostRecord>) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  };
  const openHostDetail = (host: HostRecord) => setDrawer({ type: "detail", host });
  const restartHost = (host: HostRecord) => {
    updateHost(host.id, { health: "健康", uptime: "刚刚重启" });
    notify(`${host.name} 已重启`);
  };
  const backupHost = (host: HostRecord) => {
    updateHost(host.id, { backup: currentClock() });
    notify(`${host.name} 已创建备份`);
  };
  const updateHostPackages = (host: HostRecord) => {
    updateHost(host.id, { update: "已是最新" });
    notify(`${host.name} 已更新`);
  };
  const hostActionButtons = (row: HostRecord, compact = false) => (
    <span className={`table-actions host-actions ${compact ? "compact actions-3" : "actions-4"}`}>
      <button type="button" aria-label={`查看主机 ${row.name}`} onClick={() => openHostDetail(row)}>{hostPreset.mode === "alerts" ? "详情" : "查看"}</button>
      <button type="button" aria-label={`重启主机 ${row.name}`} onClick={() => restartHost(row)}>重启</button>
      {hostPreset.mode !== "alerts" && <button type="button" aria-label={`备份主机 ${row.name}`} onClick={() => backupHost(row)}>备份</button>}
      <button type="button" aria-label={`更新主机 ${row.name}`} onClick={() => updateHostPackages(row)}>更新</button>
    </span>
  );

  const addHost = () => {
    const ip = draft.ip.trim();
    const nextErrors = {
      name: draft.name.trim() ? undefined : "请输入主机名",
      ip: !ip ? "请输入 IP 地址" : isValidIpv4Address(ip) ? undefined : "请输入有效 IPv4 地址",
    };
    setDraftErrors(nextErrors);
    if (nextErrors.name || nextErrors.ip) {
      notify(nextErrors.ip ?? "主机名不能为空", "danger");
      window.requestAnimationFrame(() => (nextErrors.name ? draftNameRef : draftIpRef).current?.focus());
      return;
    }
    const next: HostRecord = {
      id: `host-${Date.now()}`,
      name: draft.name.trim(),
      ip,
      env: draft.env,
      health: "健康",
      cpu: "9%",
      memory: "28%",
      disk: "18%",
      os: "Ubuntu 24.04",
      uptime: "刚刚接入",
      backup: "等待首次备份",
      update: "已是最新",
      services: ["nginx", "docker", "node"],
    };
    setRows((current) => [next, ...current]);
    setDrawer({ type: "detail", host: next });
    notify(`主机 ${next.name} 已新增`);
  };

  const tableColumns: Array<TableColumn<HostRecord>> = hostPreset.mode === "production"
    ? [
        { key: "name", label: "生产节点", width: "170px", render: (row) => <><StatusLight tone={hostStatusTone(row.health)} /> <b className="blue-text">{row.name}</b></> },
        { key: "ip", label: "IP 地址", width: "128px", render: (row) => row.ip },
        { key: "pressure", label: "资源高水位", width: "150px", sortValue: hostPressureScore, render: (row) => <HostPressureCell row={row} /> },
        { key: "services", label: "关键服务", width: "168px", render: (row) => <HostServices row={row} /> },
        { key: "backup", label: "备份", width: "108px", render: (row) => <span className={hostHasStaleBackup(row) ? "orange-text" : "green-text"}>{row.backup}</span> },
        { key: "update", label: "更新", width: "108px", render: (row) => <span className={isCleanUpdate(row.update) ? "green-text" : "orange-text"}>{row.update}</span> },
        { key: "status", label: "健康", width: "88px", render: (row) => <><StatusLight tone={hostStatusTone(row.health)} /> {row.health}</> },
        { key: "ops", label: "操作", width: "190px", render: (row) => hostActionButtons(row) },
      ]
    : hostPreset.mode === "alerts"
      ? [
          { key: "issue", label: "告警对象", width: "230px", render: (row) => <div className="host-issue-cell"><b>{row.name}</b><HostRiskTags row={row} /></div> },
          { key: "env", label: "环境 / IP", width: "150px", render: (row) => <span className="host-env-ip"><em>{row.env}</em><code>{row.ip}</code></span> },
          { key: "pressure", label: "资源压力", width: "150px", sortValue: hostPressureScore, render: (row) => <HostPressureCell row={row} /> },
          { key: "backup", label: "备份", width: "108px", render: (row) => <span className={hostHasStaleBackup(row) ? "orange-text" : "green-text"}>{row.backup}</span> },
          { key: "update", label: "更新", width: "108px", render: (row) => <span className={isCleanUpdate(row.update) ? "green-text" : "orange-text"}>{row.update}</span> },
          { key: "status", label: "状态", width: "88px", render: (row) => <><StatusLight tone={hostStatusTone(row.health)} /> {row.health}</> },
          { key: "ops", label: "操作", width: "154px", render: (row) => hostActionButtons(row, true) },
        ]
      : [
          { key: "name", label: "主机名", width: "170px", render: (row) => <><StatusLight tone={hostStatusTone(row.health)} /> <b className="blue-text">{row.name}</b></> },
          { key: "ip", label: "IP 地址", width: "128px", render: (row) => row.ip },
          { key: "env", label: "环境", width: "78px", render: (row) => <span className="pill blue">{row.env}</span> },
          { key: "os", label: "系统", width: "128px", render: (row) => row.os },
          { key: "cpu", label: "CPU", sortValue: (row) => percentValue(row.cpu), render: (row) => <Bar value={row.cpu} tone={hostResourceTone(row.cpu)} /> },
          { key: "memory", label: "内存", sortValue: (row) => percentValue(row.memory), render: (row) => <Bar value={row.memory} tone={hostResourceTone(row.memory)} /> },
          { key: "disk", label: "磁盘", sortValue: (row) => percentValue(row.disk), render: (row) => <Bar value={row.disk} tone={hostResourceTone(row.disk)} /> },
          { key: "status", label: "健康", width: "92px", render: (row) => <><StatusLight tone={hostStatusTone(row.health)} /> {row.health}</> },
          { key: "ops", label: "操作", width: "210px", render: (row) => hostActionButtons(row) },
        ];

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={hostPreset.subtitle}
      page={page}
      viewContext={hostViewContext(hostPreset.mode, rows, filteredRows)}
      actions={<><button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredRows.length} 台主机`, "info")}><Download size={15} /> 导出</button><button className="primary" type="button" onClick={() => { setDraftErrors({}); setDrawer({ type: "create" }); }}><Plus size={15} /> 新增主机</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索主机名、IP 或系统" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="环境" value={envFilter} options={["全部", "生产", "预发", "开发"]} onChange={(value) => setEnvByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="健康" value={healthFilter} options={hostHealthOptions(hostPreset.mode)} onChange={(value) => setHealthByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={<HostMetrics mode={hostPreset.mode} rows={rows} filteredRows={filteredRows} />}
      side={drawer?.type === "detail" && drawer.host ? (
        <DetailDrawer title={drawer.host.name} subtitle={`${drawer.host.ip} · ${drawer.host.env}`} onClose={() => setDrawer(null)}>
          <div className="detail-kv">
            <p><span>系统</span><b>{drawer.host.os}</b></p>
            <p><span>运行时间</span><b>{drawer.host.uptime}</b></p>
            <p><span>备份</span><b>{drawer.host.backup}</b></p>
            <p><span>更新</span><b>{drawer.host.update}</b></p>
            <p><span>关注项</span><b>{hostRiskReasons(drawer.host).join(" / ")}</b></p>
          </div>
          <div className="resource-bars">
            <p><span>CPU</span><Bar value={drawer.host.cpu} tone={hostResourceTone(drawer.host.cpu)} /></p>
            <p><span>内存</span><Bar value={drawer.host.memory} tone={hostResourceTone(drawer.host.memory)} /></p>
            <p><span>磁盘</span><Bar value={drawer.host.disk} tone={hostResourceTone(drawer.host.disk)} /></p>
          </div>
          <div className="drawer-list">
            <strong>服务列表</strong>
            {drawer.host.services.map((service) => <p key={service}><StatusLight tone="green" /> {service}<span>active</span></p>)}
          </div>
        </DetailDrawer>
      ) : drawer?.type === "create" ? (
        <DetailDrawer
          title="新增主机"
          subtitle="保存后进入主机监控列表"
          onClose={() => setDrawer(null)}
          actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={addHost}>保存主机</button></>}
        >
          <FormLine label="主机名" required value={draft.name} inputRef={draftNameRef} error={draftErrors.name} onChange={(value) => { setDraft((current) => ({ ...current, name: value })); setDraftErrors((current) => ({ ...current, name: undefined })); }} />
          <FormLine label="IP 地址" required value={draft.ip} inputRef={draftIpRef} error={draftErrors.ip} onChange={(value) => { setDraft((current) => ({ ...current, ip: value })); setDraftErrors((current) => ({ ...current, ip: undefined })); }} />
          <FormSelectLine label="环境" required value={draft.env} options={["生产", "预发", "开发"]} onChange={(value) => setDraft((current) => ({ ...current, env: value }))} />
        </DetailDrawer>
      ) : null}
    >
      <HostFocusPanel
        mode={hostPreset.mode}
        rows={rows}
        filteredRows={filteredRows}
        productionRows={productionRows}
        alertRows={alertRows}
        onOpen={openHostDetail}
        onBackup={backupHost}
        onUpdate={updateHostPackages}
        notify={notify}
      />
      <DataTable
        columns={tableColumns}
        rows={filteredRows}
        emptyText="没有匹配的主机"
        getRowKey={(row) => row.id}
        mobileCard={(row) => (
          <>
            <div className="module-card-head">
              <button className="module-row-link" type="button" aria-label={`查看主机 ${row.name}`} onClick={() => openHostDetail(row)}><StatusLight tone={hostStatusTone(row.health)} /><b>{row.name}</b></button>
              <span className={`pill ${row.health === "健康" ? "green" : row.health === "警告" ? "orange" : "red"}`}>{row.health}</span>
            </div>
            <code className="module-card-code">{row.ip}</code>
            {hostPreset.mode === "alerts" && <HostRiskTags row={row} />}
            <div className="module-card-meta">
              <span><b>环境</b><em>{row.env}</em></span>
              <span><b>{hostPreset.mode === "production" ? "服务" : "系统"}</b><em>{hostPreset.mode === "production" ? hostServiceSummary(row) : row.os}</em></span>
              <span><b>高水位</b><em>{hostHighestResource(row)}</em></span>
              <span><b>备份</b><em>{row.backup}</em></span>
            </div>
            <div className="module-card-footer">
              <span className={row.update === "已是最新" ? "green-text" : "orange-text"}>{row.update}</span>
              {hostActionButtons(row, hostPreset.mode === "alerts")}
            </div>
          </>
        )}
      />
    </ModulePageShell>
  );
}

function HostFocusPanel({
  mode,
  rows,
  filteredRows,
  productionRows,
  alertRows,
  onOpen,
  onBackup,
  onUpdate,
  notify,
}: {
  mode: HostPageMode;
  rows: HostRecord[];
  filteredRows: HostRecord[];
  productionRows: HostRecord[];
  alertRows: HostRecord[];
  onOpen: (host: HostRecord) => void;
  onBackup: (host: HostRecord) => void;
  onUpdate: (host: HostRecord) => void;
  notify: Notify;
}) {
  if (mode === "production") {
    const staleBackupRows = productionRows.filter(hostHasStaleBackup);
    const pendingUpdateRows = productionRows.filter((row) => !isCleanUpdate(row.update));
    return (
      <section className="host-focus-panel host-production-board" aria-label="生产主机视图">
        <div className="host-panel-section">
          <header><span>生产拓扑</span><strong>{productionRows.length} 台节点</strong></header>
          <div className="host-lane-list">
            {productionRows.map((row) => (
              <button type="button" key={row.id} onClick={() => onOpen(row)}>
                <StatusLight tone={hostStatusTone(row.health)} />
                <b>{row.name}</b>
                <em>{hostHighestResource(row)}</em>
              </button>
            ))}
          </div>
        </div>
        <div className="host-panel-section host-checklist">
          <header><span>发布前检查</span><strong>{productionRows.filter((row) => row.health === "健康").length}/{productionRows.length} 健康</strong></header>
          <p><StatusLight tone={staleBackupRows.length ? "orange" : "green"} />备份滞后 <b>{staleBackupRows.length}</b></p>
          <p><StatusLight tone={pendingUpdateRows.length ? "orange" : "green"} />待更新 <b>{pendingUpdateRows.length}</b></p>
          <div>
            <button className="ghost small" type="button" onClick={() => notify(`已检查 ${productionRows.length} 台生产主机`, "info")}><Eye size={14} /> 预检</button>
            {pendingUpdateRows[0] && <button className="warning small" type="button" onClick={() => onUpdate(pendingUpdateRows[0])}><RefreshCw size={14} /> 更新首项</button>}
          </div>
        </div>
      </section>
    );
  }
  if (mode === "alerts") {
    return (
      <section className="host-focus-panel host-alert-board" aria-label="主机告警队列">
        <div className="host-panel-section">
          <header><span>处置队列</span><strong>{filteredRows.length} 台命中</strong></header>
          <div className="host-alert-list">
            {filteredRows.slice(0, 4).map((row) => (
              <button type="button" key={row.id} onClick={() => onOpen(row)}>
                <StatusLight tone={hostStatusTone(row.health)} />
                <b>{row.name}</b>
                <em>{hostRiskReasons(row)[0]}</em>
              </button>
            ))}
            {filteredRows.length === 0 && <p>当前筛选没有告警主机</p>}
          </div>
        </div>
        <div className="host-panel-section host-alert-summary">
          <header><span>告警结构</span><strong>{alertRows.length} 台待处理</strong></header>
          <p><StatusLight tone="red" />离线节点 <b>{rows.filter((row) => row.health === "离线").length}</b></p>
          <p><StatusLight tone="orange" />警告节点 <b>{rows.filter((row) => row.health === "警告").length}</b></p>
          <p><StatusLight tone="purple" />资源高压 <b>{rows.filter(hostHasHighResource).length}</b></p>
          {alertRows[0] && <button className="warning small" type="button" onClick={() => onBackup(alertRows[0])}><Clock3 size={14} /> 补备份</button>}
        </div>
      </section>
    );
  }
  const envCounts = uniqueSorted(rows.map((row) => row.env)).map((env) => [env, rows.filter((row) => row.env === env).length] as const);
  const serviceCount = uniqueSorted(rows.flatMap((row) => row.services)).length;
  return (
    <section className="host-focus-panel host-inventory-grid" aria-label="主机资源清单">
      {envCounts.map(([env, count]) => (
        <article key={env}>
          <span>{env}</span>
          <strong>{count}</strong>
          <em>{rows.filter((row) => row.env === env && row.health === "健康").length} 台健康</em>
        </article>
      ))}
      <article>
        <span>服务覆盖</span>
        <strong>{serviceCount}</strong>
        <em>{filteredRows.length} 台当前命中</em>
      </article>
    </section>
  );
}

export { HostMetrics, HostPressureCell, HostRiskTags, HostServices, HostsPage, HostFocusPanel };
