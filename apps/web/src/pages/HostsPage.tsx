import type { OverviewNode } from "../api/overviewApi";
import { fetchOverviewHealth } from "../api/overviewApi";
import { Activity, CheckCircle2, Clock3, Eye, Gauge, Server, Shield, TriangleAlert, Wrench } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import type { TableColumn } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { Bar, StatusLight } from "../components/ui/StatusVisuals";
import {
  hostHasHighResource,
  hostHasStaleBackup,
  hostHealthOptions,
  hostHighestResource,
  hostMatchesHealth,
  hostNeedsAttention,
  hostPagePreset,
  hostPressureScore,
  hostResourceTone,
  hostRiskReasons,
  hostStatusTone,
  hostViewContext,
  isCleanUpdate,
  percentValue,
} from "../features/hosts/model";
import type { HostPageMode } from "../features/hosts/types";
import { reportApiError } from "../features/overview/model";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import type { Notify, PageKey } from "../types/app";
import { uniqueSorted } from "../utils/data";

function HostMetrics({ mode, rows, filteredRows }: { mode: HostPageMode; rows: OverviewNode[]; filteredRows: OverviewNode[] }) {
  const productionRows = rows.filter((row) => row.env === "生产");
  const currentRows = mode === "inventory" ? rows : filteredRows;
  if (mode === "production") {
    return (
      <>
        <MetricTile icon={Server} label="生产主机" value={`${productionRows.length}`} tone="blue" />
        <MetricTile icon={Activity} label="高水位" value={`${productionRows.filter(hostHasHighResource).length}`} tone="orange" />
        <MetricTile icon={Clock3} label="备份异常" value={`${productionRows.filter(hostHasStaleBackup).length}`} tone="orange" />
      </>
    );
  }
  if (mode === "alerts") {
    return (
      <>
        <MetricTile icon={Shield} label="待处理" value={`${rows.filter(hostNeedsAttention).length}`} tone="orange" />
        <MetricTile icon={Activity} label="资源高压" value={`${rows.filter(hostHasHighResource).length}`} tone="orange" />
        <MetricTile icon={Clock3} label="备份异常" value={`${rows.filter(hostHasStaleBackup).length}`} tone="orange" />
      </>
    );
  }
  return (
    <>
      <MetricTile icon={Server} label="主机总数" value={`${currentRows.length}`} tone="blue" />
      <MetricTile icon={CheckCircle2} label="健康" value={`${rows.filter((row) => row.status === "健康").length}`} tone="green" />
      <MetricTile icon={Shield} label="需关注" value={`${rows.filter(hostNeedsAttention).length}`} tone="orange" />
    </>
  );
}

function HostName({ row }: { row: OverviewNode }) {
  return (
    <span className="host-name-cell" title={row.name}>
      <b>{row.name}</b>
    </span>
  );
}

function HostStatus({ row }: { row: OverviewNode }) {
  const Icon = row.status === "健康" ? CheckCircle2 : row.status === "警告" ? TriangleAlert : Wrench;
  return <span className={`host-status ${hostStatusTone(row.status)}`}><Icon size={16} aria-hidden="true" />{row.status}</span>;
}

function HostPressureCell({ row }: { row: OverviewNode }) {
  const resources = [
    { label: "CPU", value: row.cpu },
    { label: "内存", value: row.memory },
    { label: "磁盘", value: row.disk },
  ].sort((left, right) => percentValue(right.value) - percentValue(left.value));
  const primary = resources[0];
  return <div className="host-pressure-cell"><span>{primary.label}</span><Bar value={primary.value} tone={hostResourceTone(primary.value)} /></div>;
}

function HostResourceSummary({ row }: { row: OverviewNode }) {
  return (
    <span className="host-resource-summary" aria-label={`CPU ${row.cpu}，内存 ${row.memory}，磁盘 ${row.disk}`}>
      <span><em>CPU</em><Bar value={row.cpu} tone={hostResourceTone(row.cpu)} /></span>
      <span><em>内存</em><Bar value={row.memory} tone={hostResourceTone(row.memory)} /></span>
      <span><em>磁盘</em><Bar value={row.disk} tone={hostResourceTone(row.disk)} /></span>
    </span>
  );
}

function HostRiskTags({ row }: { row: OverviewNode }) {
  return <span className="host-risk-tags">{hostRiskReasons(row).slice(0, 3).map((reason) => <em key={reason}>{reason}</em>)}</span>;
}

function HostServices({ row }: { row: OverviewNode }) {
  return <span className="host-service-pills">{row.services.slice(0, 3).map((service) => <em key={service.id}>{service.name}</em>)}</span>;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 GB";
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function DiskMetric({ row }: { row: OverviewNode }) {
  const tooltipId = useId();
  const volumes = row.diskVolumes ?? [];
  return (
    <span className="host-disk-metric">
      <button type="button" className="host-disk-trigger" aria-describedby={volumes.length ? tooltipId : undefined}>
        <Bar value={row.disk} tone={hostResourceTone(row.disk)} />
      </button>
      {volumes.length > 0 && (
        <span className="host-disk-tooltip" id={tooltipId} role="tooltip">
          <strong>全部磁盘卷</strong>
          {volumes.map((volume) => (
            <span key={`${volume.label}-${volume.mount}`}>
              <b>{volume.label} ({volume.mount})</b>
              <em>{volume.percent}% · 已用 {formatBytes(volume.usedBytes)} / {formatBytes(volume.totalBytes)}</em>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

function HostsPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const hostPreset = hostPagePreset(page);
  const [rows, setRows] = useState<OverviewNode[]>([]);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [envByPage, setEnvByPage] = useState<Record<string, string>>({});
  const [healthByPage, setHealthByPage] = useState<Record<string, string>>({});
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("-");
  const search = searchByPage[page] ?? hostPreset.search;
  const envFilter = envByPage[page] ?? hostPreset.env;
  const healthFilter = healthByPage[page] ?? hostPreset.health;
  const selectedHost = rows.find((row) => row.id === selectedHostId) ?? null;

  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const searchable = [row.name, row.ip, row.owner, row.version, ...row.services.flatMap((service) => [service.name, service.target])].join(" ").toLowerCase();
    return (!query || searchable.includes(query))
      && (envFilter === "全部" || row.env === envFilter)
      && hostMatchesHealth(row, healthFilter);
  });
  const envOptions = uniqueSorted([hostPreset.env, ...rows.map((row) => row.env)].filter((value) => value !== "全部"));

  const loadHosts = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const payload = await fetchOverviewHealth(signal);
      setRows(payload.nodes);
      setSelectedHostId((current) => current && payload.nodes.some((row) => row.id === current) ? current : null);
      setLastRefresh(payload.lastRefresh || "等待后端时间");
      setError(null);
    } catch (loadError) {
      if (signal?.aborted) return;
      if (!silent) {
        const message = loadError instanceof Error ? loadError.message : "主机监控后端加载失败";
        setError(message);
        reportApiError(loadError, notify, "主机监控后端加载失败");
      }
    } finally {
      if (!signal?.aborted && !silent) setLoading(false);
    }
  }, [notify, setSelectedHostId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchOverviewHealth(controller.signal)
      .then((payload) => {
        setRows(payload.nodes);
        setSelectedHostId((current) => current && payload.nodes.some((row) => row.id === current) ? current : null);
        setLastRefresh(payload.lastRefresh || "等待后端时间");
        setError(null);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        const message = loadError instanceof Error ? loadError.message : "主机监控后端加载失败";
        setError(message);
        setLoading(false);
        reportApiError(loadError, notify, "主机监控后端加载失败");
      });
    return () => controller.abort();
  }, [notify]);

  useAutoRefresh((signal) => loadHosts(signal, true), undefined, !loading);

  const detailAction = (row: OverviewNode) => (
    <span className="table-icon-actions host-actions">
      <button type="button" title="查看详情" aria-label={`查看主机 ${row.name}`} onClick={() => setSelectedHostId(row.id)}><Eye size={15} /></button>
    </span>
  );
  const tableColumns: Array<TableColumn<OverviewNode>> = hostPreset.mode === "production"
    ? [
        { key: "name", label: "生产节点", width: "184px", render: (row) => <HostName row={row} /> },
        { key: "ip", label: "IP 地址", width: "128px", render: (row) => row.ip },
        { key: "pressure", label: "资源使用", width: "218px", sortValue: hostPressureScore, render: (row) => <HostResourceSummary row={row} /> },
        { key: "services", label: "关键服务", width: "176px", render: (row) => <HostServices row={row} /> },
        { key: "backup", label: "备份", width: "132px", render: (row) => <span className={hostHasStaleBackup(row) ? "orange-text" : "green-text"}>{row.backup}</span> },
        { key: "update", label: "更新", width: "128px", render: (row) => <span className={isCleanUpdate(row.update) ? "green-text" : "orange-text"}>{row.update}</span> },
        { key: "status", label: "健康", width: "92px", render: (row) => <HostStatus row={row} /> },
        { key: "ops", label: "操作", width: "64px", render: detailAction },
      ]
    : hostPreset.mode === "alerts"
      ? [
          { key: "issue", label: "告警对象", width: "240px", render: (row) => <div className="host-issue-cell"><HostName row={row} /><HostRiskTags row={row} /></div> },
          { key: "env", label: "环境 / IP", width: "160px", render: (row) => <span className="host-env-ip"><em>{row.env}</em><code>{row.ip}</code></span> },
          { key: "pressure", label: "资源压力", width: "150px", sortValue: hostPressureScore, render: (row) => <HostPressureCell row={row} /> },
          { key: "backup", label: "备份", width: "132px", render: (row) => <span className={hostHasStaleBackup(row) ? "orange-text" : "green-text"}>{row.backup}</span> },
          { key: "update", label: "更新", width: "128px", render: (row) => <span className={isCleanUpdate(row.update) ? "green-text" : "orange-text"}>{row.update}</span> },
          { key: "status", label: "状态", width: "92px", render: (row) => <HostStatus row={row} /> },
          { key: "ops", label: "操作", width: "64px", render: detailAction },
        ]
      : [
          { key: "name", label: "主机名", width: "184px", render: (row) => <HostName row={row} /> },
          { key: "ip", label: "IP 地址", width: "128px", render: (row) => row.ip },
          { key: "env", label: "环境", width: "84px", render: (row) => row.env },
          { key: "latency", label: "延迟", width: "84px", render: (row) => <span><StatusLight tone={row.latencyStatus === "健康" ? "green" : "orange"} /> {row.latency}</span> },
          { key: "cpu", label: "CPU", width: "112px", sortValue: (row) => percentValue(row.cpu), render: (row) => <Bar value={row.cpu} tone={hostResourceTone(row.cpu)} /> },
          { key: "memory", label: "内存", width: "112px", sortValue: (row) => percentValue(row.memory), render: (row) => <Bar value={row.memory} tone={hostResourceTone(row.memory)} /> },
          { key: "disk", label: "磁盘", width: "112px", sortValue: (row) => percentValue(row.disk), render: (row) => <DiskMetric row={row} /> },
          { key: "status", label: "健康", width: "92px", render: (row) => <HostStatus row={row} /> },
          { key: "ops", label: "操作", width: "64px", render: detailAction },
        ];

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={loading ? "正在采集主机、服务与资源状态" : `${hostPreset.subtitle} · 更新于 ${lastRefresh}`}
      page={page}
      viewContext={hostViewContext(hostPreset.mode, rows, filteredRows)}
      filters={<><ModuleSearch value={search} placeholder="搜索主机名、IP、服务或版本" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} />{hostPreset.mode !== "production" && <FieldSelect label="环境" value={envFilter} options={["全部", ...envOptions]} onChange={(value) => setEnvByPage((current) => ({ ...current, [page]: value }))} />}<FieldSelect label="健康" value={healthFilter} options={hostHealthOptions(hostPreset.mode)} onChange={(value) => setHealthByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={<HostMetrics mode={hostPreset.mode} rows={rows} filteredRows={filteredRows} />}
    >
      {loading && <span className="sr-only" role="status" aria-live="polite">正在从 /api/overview/health 实时采集主机状态</span>}
      {error && (
        <div className="overview-error-state hosts-error-state">
          <Shield size={18} /><span>{error}</span><button type="button" onClick={() => void loadHosts()}>重试</button>
        </div>
      )}
      <HostFocusPanel mode={hostPreset.mode} rows={rows} filteredRows={filteredRows} lastRefresh={lastRefresh} onOpen={(row) => setSelectedHostId(row.id)} />
      <DataTable
        columns={tableColumns}
        rows={filteredRows}
        emptyText={error ? "实时采集失败，未显示示例主机" : loading ? "正在采集主机状态" : "没有匹配的主机，系统将继续自动采集"}
        getRowKey={(row) => row.id}
        mobileCard={(row) => (
          <>
            <div className="module-card-head host-mobile-head">
              <button className="module-row-link host-mobile-name" type="button" title={row.name} aria-label={`查看主机 ${row.name}`} onClick={() => setSelectedHostId(row.id)}><HostName row={row} /></button>
              <HostStatus row={row} />
            </div>
            <code className="module-card-code">{row.ip}</code>
            {hostPreset.mode === "alerts" && <HostRiskTags row={row} />}
            <div className="module-card-meta">
              <span><b>环境</b><em>{row.env}</em></span>
              <span><b>版本</b><em>{row.version}</em></span>
              <span><b>高水位</b><em>{hostHighestResource(row)}</em></span>
              <span><b>备份</b><em>{row.backup}</em></span>
            </div>
            <div className="module-card-footer">
              <span className={isCleanUpdate(row.update) ? "green-text" : "orange-text"}>{row.update}</span>
              <button className="ghost small" type="button" onClick={() => setSelectedHostId(row.id)}><Eye size={14} /> 查看详情</button>
            </div>
          </>
        )}
      />
      {selectedHost && (
        <DetailDrawer title={selectedHost.name} subtitle={`${selectedHost.ip} · ${selectedHost.env}`} onClose={() => setSelectedHostId(null)} className="host-detail-drawer" modal>
          <HostDetailContent host={selectedHost} lastRefresh={lastRefresh} />
        </DetailDrawer>
      )}
    </ModulePageShell>
  );
}

function HostDetailContent({ host, lastRefresh }: { host: OverviewNode; lastRefresh: string }) {
  return (
    <div className="host-detail-content">
      <div className="host-detail-status" tabIndex={0} aria-label={`${host.name} 当前状态 ${host.status}`}><Server size={20} /><span><b><HostStatus row={host} /></b><em>采集于 {lastRefresh}</em></span></div>
      <div className="detail-kv">
        <p><span>节点 ID</span><b>{host.id}</b></p><p><span>网络延迟</span><b>{host.latency}</b></p>
        <p><span>版本</span><b>{host.version}</b></p><p><span>运行时间</span><b>{host.uptime}</b></p>
        <p><span>备份</span><b>{host.backup}</b></p><p><span>更新</span><b>{host.update}</b></p>
        <p><span>负责人</span><b>{host.owner}</b></p><p><span>关注项</span><b>{hostRiskReasons(host).join(" / ")}</b></p>
      </div>
      <section className="host-detail-section"><strong>资源使用</strong><div className="resource-bars"><p><span>CPU</span><Bar value={host.cpu} tone={hostResourceTone(host.cpu)} /></p><p><span>内存</span><Bar value={host.memory} tone={hostResourceTone(host.memory)} /></p><p><span>磁盘汇总</span><DiskMetric row={host} /></p></div></section>
      <section className="host-detail-section"><strong>磁盘卷</strong><div className="host-volume-list">{host.diskVolumes?.length ? host.diskVolumes.map((volume) => <p key={`${volume.label}-${volume.mount}`}><span><b>{volume.label}</b><em>{volume.mount}</em></span><strong>{volume.percent}%</strong><small>已用 {formatBytes(volume.usedBytes)} / {formatBytes(volume.totalBytes)}</small></p>) : <p className="host-detail-unavailable">卷级数据暂不可用，等待采集</p>}</div></section>
      <section className="host-detail-section"><strong>服务实例</strong><div className="drawer-list">{host.services.map((service) => <p key={service.id}><StatusLight tone={service.status === "健康" ? "green" : service.status === "警告" ? "orange" : "red"} /><span><b>{service.name}</b><em>{service.target}</em></span><strong>{service.status}</strong></p>)}{host.services.length === 0 && <p className="host-detail-unavailable">服务数据暂不可用，等待采集</p>}</div></section>
    </div>
  );
}

function HostFocusPanel({ mode, rows, filteredRows, lastRefresh, onOpen }: { mode: HostPageMode; rows: OverviewNode[]; filteredRows: OverviewNode[]; lastRefresh: string; onOpen: (host: OverviewNode) => void }) {
  const visibleRows = mode === "inventory" ? rows : filteredRows;
  if (mode === "inventory") {
    const envCounts = uniqueSorted(rows.map((row) => row.env)).map((env) => [env, rows.filter((row) => row.env === env).length] as const);
    const serviceCount = uniqueSorted(rows.flatMap((row) => row.services.map((service) => service.name))).length;
    return <section className="host-focus-panel host-inventory-grid" aria-label="主机资源清单">{envCounts.map(([env, count]) => <article key={env}><span>{env}</span><strong>{count}</strong><em>{rows.filter((row) => row.env === env && row.status === "健康").length} 台健康</em></article>)}<article><span>服务覆盖</span><strong>{serviceCount}</strong><em>{filteredRows.length} 台当前命中</em></article>{rows.length === 0 && <p className="host-focus-empty">{visibleRows.length === 0 ? "等待主机数据采集" : "暂无主机"}</p>}</section>;
  }
  return (
    <section className={`host-focus-panel ${mode === "production" ? "host-production-board" : "host-alert-board"}`} aria-label={mode === "production" ? "生产主机视图" : "主机告警队列"}>
      <div className="host-panel-section"><header><span>{mode === "production" ? "生产节点" : "处置队列"}</span><strong>{visibleRows.length} 台</strong></header><div className="host-lane-list">{visibleRows.slice(0, 6).map((row) => <button type="button" key={row.id} onClick={() => onOpen(row)}><HostStatus row={row} /><span><b title={row.name}>{row.name}</b><code>{row.ip}</code></span><em>{mode === "production" ? `高水位 ${hostHighestResource(row)}` : hostRiskReasons(row)[0]}</em></button>)}{visibleRows.length === 0 && <p className="host-focus-empty">没有匹配的主机，系统将继续自动采集</p>}</div></div>
      <div className="host-panel-section host-alert-summary"><header><span>状态摘要</span><strong>{visibleRows.filter((row) => row.status === "健康").length}/{visibleRows.length} 健康</strong></header><p><TriangleAlert className="orange" size={16} aria-hidden="true" />警告节点 <b>{visibleRows.filter((row) => row.status === "警告").length}</b></p><p><Wrench className="gray" size={16} aria-hidden="true" />维护节点 <b>{visibleRows.filter((row) => row.status === "维护").length}</b></p><p><Gauge className="orange" size={16} aria-hidden="true" />资源高压 <b>{visibleRows.filter(hostHasHighResource).length}</b></p><p><Clock3 className="orange" size={16} aria-hidden="true" />备份异常 <b>{visibleRows.filter(hostHasStaleBackup).length}</b></p><small className="host-collection-time">采集于 {lastRefresh}</small></div>
    </section>
  );
}

export { DiskMetric, HostMetrics, HostPressureCell, HostRiskTags, HostServices, HostsPage, HostFocusPanel };
