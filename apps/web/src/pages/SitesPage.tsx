import { Activity, CheckCircle2, Clock3, Code2, Globe2, Plus, RefreshCw, Shield } from "lucide-react";
import { useCallback, useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { useQuickIntent } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { latencyValue, uniqueSorted } from "../utils/data";
import type { TableColumn } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine, FormSelectLine } from "../components/ui/FormControls";
import { StatusLight } from "../components/ui/StatusVisuals";
import { percentValue } from "../features/hosts/model";
import { isSiteCertDue, runtimeGroupsFromSites, siteStatusTone, siteTrafficGb, sitesPagePreset } from "../features/sites/model";
import type { SiteRecord, SiteRuntimeGroup } from "../features/sites/types";
import { initialHostRecords, initialSiteRecords } from "../mocks/demoData";
import type { Notify, PageKey, ViewContext } from "../types/app";

function SitesPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialSiteRecords);
  const sitePreset = sitesPagePreset(page);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [statusByPage, setStatusByPage] = useState<Record<string, string>>({});
  const [runtimeByPage, setRuntimeByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<{ type: "create" | "logs"; site?: SiteRecord } | null>(null);
  const [draft, setDraft] = useState({ domain: "new.example.com", runtime: "Node 20", host: "panel-se-01" });
  const mode = page === "sites-runtime" ? "runtime" : page === "sites-cert" ? "cert" : page === "sites-running" ? "running" : "inventory";
  const runtimeOptions = ["全部", ...uniqueSorted(rows.map((row) => row.runtime))];
  const search = searchByPage[page] ?? sitePreset.search;
  const statusFilter = statusByPage[page] ?? sitePreset.status;
  const runtimeFilter = runtimeByPage[page] ?? sitePreset.runtime;

  const openCreateFromQuick = useCallback(() => {
    setDrawer({ type: "create" });
  }, []);

  useQuickIntent("sites", "create-site", openCreateFromQuick);

  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.domain} ${row.runtime} ${row.host} ${row.owner} ${row.upstream}`.toLowerCase().includes(query);
    const matchCert = mode === "cert" ? isSiteCertDue(row) : true;
    return matchSearch && (statusFilter === "全部" || row.status === statusFilter) && (runtimeFilter === "全部" || row.runtime === runtimeFilter) && matchCert;
  });
  const updateSite = (id: string, patch: Partial<SiteRecord>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const certDueRows = rows.filter(isSiteCertDue);
  const runtimeGroups = runtimeGroupsFromSites(filteredRows);
  const maxRuntimeSites = Math.max(...runtimeGroups.map((group) => group.sites.length), 1);
  const latencySamples = filteredRows.map((row) => latencyValue(row.latency)).filter((value): value is number => value !== null);
  const averageSiteLatency = latencySamples.length ? `${Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length)}ms` : "-";
  const toggleSite = (row: SiteRecord) => {
    const nextStatus = row.status === "已停止" ? "运行中" : "已停止";
    updateSite(row.id, { status: nextStatus, latency: nextStatus === "运行中" ? "42ms" : "-", errorRate: nextStatus === "运行中" ? "0.02%" : "-" });
    notify(`${row.domain} 已${nextStatus === "运行中" ? "启动" : "停止"}`);
  };
  const renewSite = (row: SiteRecord) => {
    updateSite(row.id, { certDays: 90, certMode: "自动续期" });
    notify(`${row.domain} 证书已续期`);
  };
  const renewDueSites = () => {
    setRows((current) => current.map((row) => isSiteCertDue(row) ? { ...row, certDays: 90, certMode: "自动续期" } : row));
    notify(`已提交 ${certDueRows.length} 个证书续期任务`);
  };
  const siteActions = (row: SiteRecord) => (
    <span className="table-actions">
      <button type="button" aria-label={`${row.status === "已停止" ? "启动" : "停止"}网站 ${row.domain}`} onClick={() => toggleSite(row)}>{row.status === "已停止" ? "启动" : "停止"}</button>
      <button type="button" aria-label={`续期网站 ${row.domain} 证书`} onClick={() => renewSite(row)}>续期</button>
      <button type="button" aria-label={`查看网站 ${row.domain} 日志`} onClick={() => setDrawer({ type: "logs", site: row })}>日志</button>
    </span>
  );
  const siteViewContext: ViewContext = mode === "runtime"
    ? { eyebrow: "网站 / 运行时分组", title: "运行时容量视图", chips: [`分组 ${runtimeGroups.length} 个`, `站点 ${filteredRows.length} 个`, `证书风险 ${filteredRows.filter(isSiteCertDue).length} 个`] }
    : mode === "cert"
      ? { eyebrow: "网站 / 证书续期", title: "续期处置队列", chips: [`待续期 ${certDueRows.length} 个`, `最短 ${certDueRows.length ? Math.min(...certDueRows.map((row) => row.certDays)) : "-"} 天`, `当前 ${filteredRows.length} 个`] }
      : mode === "running"
        ? { eyebrow: "网站 / 运行中站点", title: "运行态监控", chips: [`运行中 ${filteredRows.length} 个`, `平均延迟 ${averageSiteLatency}`, `告警 ${filteredRows.filter((row) => row.status === "告警").length} 个`] }
        : { eyebrow: "网站 / 默认视图", title: "站点资产清单", chips: [`总数 ${rows.length} 个`, `运行中 ${rows.filter((row) => row.status === "运行中").length} 个`, `证书风险 ${certDueRows.length} 个`] };
  const metrics = mode === "runtime" ? (
    <>
      <MetricTile icon={Code2} label="运行时组" value={`${runtimeGroups.length}`} tone="blue" />
      <MetricTile icon={Globe2} label="覆盖站点" value={`${filteredRows.length}`} tone="green" />
      <MetricTile icon={Shield} label="证书风险" value={`${filteredRows.filter(isSiteCertDue).length}`} tone="orange" />
    </>
  ) : mode === "cert" ? (
    <>
      <MetricTile icon={Shield} label="待续期" value={`${certDueRows.length}`} tone="orange" />
      <MetricTile icon={Clock3} label="7 天内" value={`${certDueRows.filter((row) => row.certDays < 7).length}`} tone="red" />
      <MetricTile icon={CheckCircle2} label="自动续期" value={`${rows.filter((row) => row.certMode === "自动续期").length}`} tone="green" />
    </>
  ) : mode === "running" ? (
    <>
      <MetricTile icon={Activity} label="运行站点" value={`${filteredRows.length}`} tone="green" />
      <MetricTile icon={Clock3} label="平均延迟" value={averageSiteLatency} tone="blue" />
      <MetricTile icon={Shield} label="异常站点" value={`${filteredRows.filter((row) => row.status === "告警" || percentValue(row.errorRate) > 1).length}`} tone="orange" />
    </>
  ) : (
    <>
      <MetricTile icon={Globe2} label="站点" value={`${rows.length}`} tone="blue" />
      <MetricTile icon={CheckCircle2} label="运行中" value={`${rows.filter((row) => row.status === "运行中").length}`} tone="green" />
      <MetricTile icon={Shield} label="证书告警" value={`${certDueRows.length}`} tone="orange" />
    </>
  );
  const siteColumns: Array<TableColumn<SiteRecord>> = mode === "running"
    ? [
        { key: "domain", label: "域名", width: "220px", render: (row) => <><StatusLight tone={siteStatusTone(row.status)} /> <b className="blue-text">{row.domain}</b></> },
        { key: "upstream", label: "上游", render: (row) => <code>{row.upstream}</code> },
        { key: "latency", label: "延迟", width: "96px", sortValue: (row) => latencyValue(row.latency), render: (row) => <span className={(latencyValue(row.latency) ?? 0) > 120 ? "orange-text" : "green-text"}>{row.latency}</span> },
        { key: "error", label: "错误率", width: "96px", sortValue: (row) => percentValue(row.errorRate), render: (row) => <span className={percentValue(row.errorRate) > 1 ? "red-text" : percentValue(row.errorRate) > 0.2 ? "orange-text" : "green-text"}>{row.errorRate}</span> },
        { key: "deploy", label: "最近部署", render: (row) => row.lastDeploy },
        { key: "traffic", label: "流量", sortValue: siteTrafficGb, render: (row) => row.traffic },
        { key: "ops", label: "操作", width: "220px", render: siteActions },
      ]
    : mode === "cert"
      ? [
          { key: "domain", label: "域名", width: "220px", render: (row) => <><StatusLight tone={siteStatusTone(row.status)} /> <b className="blue-text">{row.domain}</b></> },
          { key: "days", label: "剩余", width: "92px", sortValue: (row) => row.certDays, render: (row) => <span className={row.certDays < 7 ? "red-text" : "orange-text"}>{row.certDays} 天</span> },
          { key: "issuer", label: "签发方", render: (row) => row.certIssuer },
          { key: "mode", label: "续期方式", render: (row) => <span className={`pill ${row.certMode === "自动续期" ? "green" : "orange"}`}>{row.certMode}</span> },
          { key: "runtime", label: "运行时", render: (row) => row.runtime },
          { key: "host", label: "主机", render: (row) => row.host },
          { key: "ops", label: "操作", width: "220px", render: siteActions },
        ]
      : [
          { key: "domain", label: "域名", width: "220px", render: (row) => <><StatusLight tone={siteStatusTone(row.status)} /> <b className="blue-text">{row.domain}</b></> },
          { key: "status", label: "状态", width: "90px", render: (row) => <span className={`pill ${row.status === "运行中" ? "green" : row.status === "告警" ? "red" : "blue"}`}>{row.status}</span> },
          { key: "runtime", label: "运行时", render: (row) => row.runtime },
          { key: "host", label: "主机", render: (row) => row.host },
          { key: "cert", label: "证书", sortValue: (row) => row.certDays, render: (row) => <span className={isSiteCertDue(row) ? "orange-text" : "green-text"}>{row.certDays} 天</span> },
          { key: "traffic", label: "流量", sortValue: siteTrafficGb, render: (row) => row.traffic },
          { key: "owner", label: "负责人", width: "92px", render: (row) => row.owner },
          { key: "ops", label: "操作", width: "220px", render: siteActions },
        ];
  const runtimeColumns: Array<TableColumn<SiteRuntimeGroup>> = [
    { key: "runtime", label: "运行时", width: "180px", render: (group) => <span className="runtime-group-title"><Code2 size={15} /> <b>{group.runtime}</b></span> },
    { key: "sites", label: "站点", width: "120px", sortValue: (group) => group.sites.length, render: (group) => <span className="site-stack-cell"><b>{group.sites.length} 个</b><i aria-hidden="true"><em style={{ width: `${Math.round((group.sites.length / maxRuntimeSites) * 100)}%` }} /></i></span> },
    { key: "running", label: "运行态", render: (group) => <span className="site-ops-summary"><em>{group.running} 运行</em><em>{group.warning} 告警</em><em>{group.stopped} 停止</em></span> },
    { key: "hosts", label: "主机", render: (group) => group.hosts },
    { key: "traffic", label: "总流量", sortValue: (group) => group.sites.reduce((sum, site) => sum + siteTrafficGb(site), 0), render: (group) => group.traffic },
    { key: "latency", label: "均延迟", sortValue: (group) => latencyValue(group.avgLatency), render: (group) => group.avgLatency },
    { key: "cert", label: "证书风险", width: "96px", sortValue: (group) => group.certDue, render: (group) => <span className={group.certDue ? "orange-text" : "green-text"}>{group.certDue}</span> },
    { key: "ops", label: "操作", width: "132px", render: (group) => <span className="table-actions"><button type="button" onClick={() => { setRuntimeByPage((current) => ({ ...current, [page]: group.runtime })); notify(`已聚焦 ${group.runtime} 站点`, "info"); }}>聚焦</button></span> },
  ];
  const addSite = () => {
    if (!draft.domain.trim()) {
      notify("域名不能为空", "danger");
      return;
    }
    const next: SiteRecord = { id: `site-${Date.now()}`, domain: draft.domain.trim(), runtime: draft.runtime, host: draft.host, status: "运行中", certDays: 90, traffic: "0 GB", owner: "未分配", latency: "42ms", errorRate: "0.02%", upstream: `${draft.runtime.toLowerCase().replace(/\s+/g, "-")}:8080`, lastDeploy: "刚刚", certIssuer: "Let's Encrypt", certMode: "自动续期" };
    setRows((current) => [next, ...current]);
    setDrawer(null);
    notify(`网站 ${next.domain} 已添加`);
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={sitePreset.subtitle}
      page={page}
      viewContext={siteViewContext}
      actions={<><button className="ghost" type="button" onClick={() => notify(mode === "running" ? "运行态探测已刷新" : "站点列表已刷新", "info")}><RefreshCw size={15} /> 刷新</button>{mode === "cert" && <button className="ghost" type="button" onClick={renewDueSites}><Shield size={15} /> 批量续期</button>}<button className="primary" type="button" onClick={() => setDrawer({ type: "create" })}><Plus size={15} /> 添加网站</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索域名、上游或负责人" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="状态" value={statusFilter} options={["全部", "运行中", "已停止", "告警"]} onChange={(value) => setStatusByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="运行时" value={runtimeFilter} options={runtimeOptions} onChange={(value) => setRuntimeByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={metrics}
      side={drawer?.type === "create" ? (
        <DetailDrawer title="添加网站" subtitle="配置站点域名、运行时和绑定主机" onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={addSite}>添加网站</button></>}>
          <FormLine label="域名" required value={draft.domain} onChange={(value) => setDraft((current) => ({ ...current, domain: value }))} />
          <FormSelectLine label="运行时" required value={draft.runtime} options={["Node 20", "PHP 8.3", "Static", "Nginx 静态"]} onChange={(value) => setDraft((current) => ({ ...current, runtime: value }))} />
          <FormSelectLine label="绑定主机" required value={draft.host} options={initialHostRecords.map((host) => host.name)} onChange={(value) => setDraft((current) => ({ ...current, host: value }))} />
        </DetailDrawer>
      ) : drawer?.type === "logs" && drawer.site ? (
        <DetailDrawer title="访问日志" subtitle={drawer.site.domain} onClose={() => setDrawer(null)}>
          <div className="detail-kv site-log-summary">
            <p><span>上游</span><b>{drawer.site.upstream}</b></p>
            <p><span>延迟</span><b>{drawer.site.latency}</b></p>
            <p><span>错误率</span><b>{drawer.site.errorRate}</b></p>
            <p><span>证书</span><b>{drawer.site.certDays} 天</b></p>
          </div>
          <div className="terminal-log compact-log">
            <p>200 GET /api/health 38ms</p>
            <p>200 GET /assets/app.js 12ms</p>
            <p>304 GET /dashboard 8ms</p>
            <p>{drawer.site.status === "告警" ? "502 upstream response timeout" : "200 GET /login 24ms"}</p>
          </div>
        </DetailDrawer>
      ) : null}
    >
      {mode === "runtime" ? (
        <DataTable columns={runtimeColumns} rows={runtimeGroups} emptyText="没有匹配的运行时分组" getRowKey={(group) => group.runtime} mobileCard={(group) => (
          <>
            <div className="module-card-head">
              <span className="module-card-title"><Code2 size={16} /><b>{group.runtime}</b></span>
              <span className={`pill ${group.warning || group.certDue ? "orange" : "green"}`}>{group.sites.length} 个站点</span>
            </div>
            <div className="module-card-meta">
              <span><b>运行</b><em>{group.running}</em></span>
              <span><b>告警</b><em>{group.warning}</em></span>
              <span><b>流量</b><em>{group.traffic}</em></span>
              <span><b>延迟</b><em>{group.avgLatency}</em></span>
            </div>
          </>
        )} />
      ) : (
        <DataTable
          columns={siteColumns}
          rows={filteredRows}
          emptyText={mode === "cert" ? "没有需要续期的网站" : "没有匹配的网站"}
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
          <>
            <div className="module-card-head">
              <span className="module-card-title"><StatusLight tone={siteStatusTone(row.status)} /><b>{row.domain}</b></span>
              <span className={`pill ${row.status === "运行中" ? "green" : row.status === "告警" ? "red" : "blue"}`}>{row.status}</span>
            </div>
            <code className="module-card-code">{mode === "running" ? row.upstream : row.host}</code>
            <div className="module-card-meta">
              <span><b>运行时</b><em>{row.runtime}</em></span>
              <span><b>{mode === "running" ? "延迟" : "证书"}</b><em className={isSiteCertDue(row) ? "orange-text" : "green-text"}>{mode === "running" ? row.latency : `${row.certDays} 天`}</em></span>
              <span><b>{mode === "cert" ? "签发方" : "流量"}</b><em>{mode === "cert" ? row.certIssuer : row.traffic}</em></span>
              <span><b>{mode === "running" ? "错误率" : "负责人"}</b><em>{mode === "running" ? row.errorRate : row.owner}</em></span>
            </div>
            <div className="module-card-footer">
              <div className="table-actions actions-3">{siteActions(row)}</div>
            </div>
          </>
          )}
        />
      )}
    </ModulePageShell>
  );
}

export { SitesPage };
