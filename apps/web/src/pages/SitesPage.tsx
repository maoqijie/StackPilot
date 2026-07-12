import { Activity, CheckCircle2, CircleStop, Clock3, Code2, Eye, Globe2, Info, Play, Plus, RotateCw, ScrollText, Server, Shield, ShieldAlert, Square, TriangleAlert } from "lucide-react";
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
import { StatusDot, StatusLight } from "../components/ui/StatusVisuals";
import { percentValue } from "../features/hosts/model";
import { isSiteCertDue, runtimeGroupHealth, runtimeGroupsFromSites, siteStatusTone, siteTrafficGb, sitesPagePreset } from "../features/sites/model";
import type { SiteRecord, SiteRuntimeGroup } from "../features/sites/types";
import { initialHostRecords, initialSiteRecords } from "../mocks/demoData";
import type { Notify, PageKey, ViewContext } from "../types/app";

function SitesPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialSiteRecords);
  const sitePreset = sitesPagePreset(page);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [statusByPage, setStatusByPage] = useState<Record<string, string>>({});
  const [runtimeByPage, setRuntimeByPage] = useState<Record<string, string>>({});
  const [certRiskByPage, setCertRiskByPage] = useState<Record<string, string>>({});
  const [certModeByPage, setCertModeByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<{ type: "create" | "logs" | "cert"; site?: SiteRecord } | { type: "runtime"; runtime: string } | null>(null);
  const [draft, setDraft] = useState({ domain: "new.example.com", runtime: "Node 20", host: "panel-se-01" });
  const mode = page === "sites-runtime" ? "runtime" : page === "sites-cert" ? "cert" : page === "sites-running" ? "running" : "inventory";
  const runtimeOptions = ["全部", ...uniqueSorted(rows.map((row) => row.runtime))];
  const search = searchByPage[page] ?? sitePreset.search;
  const statusFilter = statusByPage[page] ?? sitePreset.status;
  const runtimeFilter = runtimeByPage[page] ?? sitePreset.runtime;
  const certRiskFilter = certRiskByPage[page] ?? "全部风险";
  const certModeFilter = certModeByPage[page] ?? "全部方式";

  const openCreateFromQuick = useCallback(() => {
    setDrawer({ type: "create" });
  }, []);

  useQuickIntent("sites", "create-site", openCreateFromQuick);

  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.domain} ${row.runtime} ${row.host} ${row.owner} ${row.upstream}`.toLowerCase().includes(query);
    const matchCert = mode === "cert" ? isSiteCertDue(row) : true;
    const matchCertRisk = mode !== "cert" || certRiskFilter === "全部风险" || (certRiskFilter === "7 天内" ? row.certDays <= 7 : row.certDays > 7);
    const matchCertMode = mode !== "cert" || certModeFilter === "全部方式" || (certModeFilter === "自动续期" ? row.certMode === "自动续期" : row.certMode !== "自动续期");
    const matchStatus = statusFilter === "全部"
      || (statusFilter === "活跃" ? row.status !== "已停止" : row.status === statusFilter);
    return matchSearch && matchStatus && (runtimeFilter === "全部" || row.runtime === runtimeFilter) && matchCert && matchCertRisk && matchCertMode;
  });
  const updateSite = (id: string, patch: Partial<SiteRecord>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const certDueRows = rows.filter(isSiteCertDue);
  const displayedSiteRows = mode === "cert" ? [...filteredRows].sort((left, right) => left.certDays - right.certDays) : filteredRows;
  const runtimeGroups = runtimeGroupsFromSites(filteredRows);
  const selectedRuntimeGroup = drawer?.type === "runtime" ? runtimeGroups.find((group) => group.runtime === drawer.runtime) ?? null : null;
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
  const certRisk = (row: SiteRecord) => row.certDays <= 7
    ? { label: "紧急", tone: "is-critical", icon: ShieldAlert }
    : { label: "临近到期", tone: "is-warning", icon: TriangleAlert };
  const certActions = (row: SiteRecord) => (
    <span className="table-actions cert-actions">
      <button type="button" aria-label={`续期 ${row.domain} 的证书`} onClick={() => renewSite(row)}><Shield size={14} />续期</button>
      <button type="button" aria-label={`查看 ${row.domain} 的证书详情`} onClick={() => setDrawer({ type: "cert", site: row })}><Eye size={14} />详情</button>
    </span>
  );
  const siteActions = (row: SiteRecord) => (
    <span className="table-actions site-actions">
      <button type="button" aria-label={`${row.status === "已停止" ? "启动" : "停止"}网站 ${row.domain}`} onClick={() => toggleSite(row)}>{row.status === "已停止" ? <Play size={14} /> : <Square size={14} />}<span>{row.status === "已停止" ? "启动" : "停止"}</span></button>
      {mode !== "running" && <button type="button" aria-label={`续期网站 ${row.domain} 证书`} onClick={() => renewSite(row)}><RotateCw size={14} /><span>续期</span></button>}
      <button type="button" aria-label={`查看网站 ${row.domain} 日志`} onClick={() => setDrawer({ type: "logs", site: row })}><ScrollText size={14} /><span>日志</span></button>
    </span>
  );
  const siteStatus = (row: SiteRecord) => {
    const tone = siteStatusTone(row.status);
    const Icon = row.status === "运行中" ? CheckCircle2 : row.status === "告警" ? TriangleAlert : CircleStop;
    return <span className={`site-status ${tone}`}><Icon size={14} aria-hidden="true" /><span>{row.status}</span></span>;
  };
  const siteIdentity = (row: SiteRecord) => (
    <span className="site-domain" title={row.domain}><Globe2 size={14} aria-hidden="true" /><b>{row.domain}</b></span>
  );
  const siteViewContext: ViewContext = mode === "runtime"
    ? { eyebrow: "网站 / 运行时分组", title: "运行时容量视图", chips: [`分组 ${runtimeGroups.length} 个`, `站点 ${filteredRows.length} 个`, `证书风险 ${filteredRows.filter(isSiteCertDue).length} 个`] }
    : mode === "cert"
      ? { eyebrow: "网站 / 证书续期", title: "证书风险处置", chips: [`待续期 ${certDueRows.length} 个`, `最短 ${certDueRows.length ? Math.min(...certDueRows.map((row) => row.certDays)) : "-"} 天`, "等待接入采集"] }
      : mode === "running"
        ? { eyebrow: "网站 / 运行中站点", title: "运行态监控", chips: [`运行中 ${filteredRows.filter((row) => row.status === "运行中").length} 个`, `告警 ${filteredRows.filter((row) => row.status === "告警").length} 个`, "等待接入采集"] }
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
      <MetricTile icon={Clock3} label="7 天内" value={`${certDueRows.filter((row) => row.certDays <= 7).length}`} tone="red" />
      <MetricTile icon={TriangleAlert} label="需人工介入" value={`${certDueRows.filter((row) => row.certMode !== "自动续期").length}`} tone="orange" />
    </>
  ) : mode === "running" ? (
    <>
      <MetricTile icon={Activity} label="活跃站点" value={`${filteredRows.length}`} tone="green" />
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
        { key: "domain", label: "域名", width: "208px", render: siteIdentity },
        { key: "status", label: "状态", width: "88px", render: siteStatus },
        { key: "upstream", label: "上游", width: "160px", render: (row) => <code className="site-truncate" title={row.upstream}>{row.upstream}</code> },
        { key: "latency", label: "延迟", width: "96px", sortValue: (row) => latencyValue(row.latency), render: (row) => <span className={(latencyValue(row.latency) ?? 0) > 120 ? "orange-text" : "green-text"}>{row.latency}</span> },
        { key: "error", label: "错误率", width: "96px", sortValue: (row) => percentValue(row.errorRate), render: (row) => <span className={percentValue(row.errorRate) > 1 ? "red-text" : percentValue(row.errorRate) > 0.2 ? "orange-text" : "green-text"}>{row.errorRate}</span> },
        { key: "deploy", label: "最近部署", render: (row) => row.lastDeploy },
        { key: "traffic", label: "流量", sortValue: siteTrafficGb, render: (row) => row.traffic },
        { key: "ops", label: "操作", width: "144px", render: siteActions },
      ]
    : mode === "cert"
      ? [
          { key: "risk", label: "风险", width: "124px", sortValue: (row) => row.certDays, render: (row) => { const risk = certRisk(row); const RiskIcon = risk.icon; return <span className={`cert-risk ${risk.tone}`}><RiskIcon size={16} /><b>{risk.label}</b><em>{row.certDays} 天</em></span>; } },
          { key: "domain", label: "域名", width: "260px", render: (row) => <span className="cert-domain"><b title={row.domain}>{row.domain}</b><small>{row.host}</small></span> },
          { key: "issuer", label: "签发方", width: "150px", render: (row) => row.certIssuer },
          { key: "runtime", label: "运行时", width: "132px", render: (row) => row.runtime },
          { key: "mode", label: "续期方式", width: "124px", render: (row) => <span className={`pill ${row.certMode === "自动续期" ? "green" : "orange"}`}>{row.certMode}</span> },
          { key: "owner", label: "负责人", width: "96px", render: (row) => row.owner },
          { key: "ops", label: "操作", width: "168px", render: certActions },
        ]
      : [
          { key: "domain", label: "域名", width: "208px", render: siteIdentity },
          { key: "status", label: "状态", width: "88px", render: siteStatus },
          { key: "runtime", label: "运行时", render: (row) => row.runtime },
          { key: "host", label: "主机", width: "144px", render: (row) => <span className="site-truncate" title={row.host}>{row.host}</span> },
          { key: "cert", label: "证书", sortValue: (row) => row.certDays, render: (row) => <span className={isSiteCertDue(row) ? "orange-text" : "green-text"}>{row.certDays} 天</span> },
          { key: "traffic", label: "流量", sortValue: siteTrafficGb, render: (row) => row.traffic },
          { key: "owner", label: "负责人", width: "92px", render: (row) => row.owner },
          { key: "ops", label: "操作", width: "208px", render: siteActions },
        ];
  const runtimeColumns: Array<TableColumn<SiteRuntimeGroup>> = [
    { key: "runtime", label: "运行时", width: "176px", render: (group) => <span className="runtime-group-title"><Code2 size={16} /> <b>{group.runtime}</b></span> },
    { key: "health", label: "健康状态", width: "104px", render: (group) => { const health = runtimeGroupHealth(group); return <StatusDot tone={health.tone} text={health.label} />; } },
    { key: "sites", label: "站点容量", width: "104px", sortValue: (group) => group.sites.length, render: (group) => <strong>{group.sites.length} 个</strong> },
    { key: "running", label: "运行态", width: "184px", render: (group) => <span className="runtime-state-summary"><span><CheckCircle2 size={14} />{group.running} 运行</span><span className={group.warning ? "orange-text" : "gray-text"}><TriangleAlert size={14} />{group.warning} 告警</span><span className="gray-text"><CircleStop size={14} />{group.stopped} 停止</span></span> },
    { key: "hosts", label: "主机", width: "160px", render: (group) => <span className="runtime-hosts" title={group.hosts}>{group.hosts || "未分配"}</span> },
    { key: "traffic", label: "总流量", width: "96px", sortValue: (group) => group.sites.reduce((sum, site) => sum + siteTrafficGb(site), 0), render: (group) => group.traffic },
    { key: "latency", label: "均延迟", width: "88px", sortValue: (group) => latencyValue(group.avgLatency), render: (group) => group.avgLatency },
    { key: "cert", label: "证书风险", width: "104px", sortValue: (group) => group.certDue, render: (group) => <span className={group.certDue ? "orange-text" : "green-text"}>{group.certDue ? `${group.certDue} 个` : "无风险"}</span> },
    { key: "ops", label: "操作", width: "64px", render: (group) => <span className="table-icon-actions"><button type="button" title="查看详情" aria-label={`查看 ${group.runtime} 运行时详情`} onClick={() => setDrawer({ type: "runtime", runtime: group.runtime })}><Eye size={16} /></button></span> },
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
      actions={mode === "cert"
        ? <button className="primary" type="button" onClick={renewDueSites} disabled={certDueRows.length === 0}><Shield size={15} /> 批量续期</button>
        : <button className="primary" type="button" onClick={() => setDrawer({ type: "create" })}><Plus size={15} /> 添加网站</button>}
      filters={mode === "cert"
        ? <><ModuleSearch value={search} placeholder="搜索域名、主机或负责人" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="风险" value={certRiskFilter} options={["全部风险", "7 天内", "8-13 天"]} onChange={(value) => setCertRiskByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="续期" value={certModeFilter} options={["全部方式", "自动续期", "需人工介入"]} onChange={(value) => setCertModeByPage((current) => ({ ...current, [page]: value }))} /></>
        : <><ModuleSearch value={search} placeholder="搜索域名、上游或负责人" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="状态" value={statusFilter} options={mode === "running" ? ["活跃", "运行中", "告警"] : ["全部", "运行中", "已停止", "告警"]} onChange={(value) => setStatusByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="运行时" value={runtimeFilter} options={runtimeOptions} onChange={(value) => setRuntimeByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={metrics}
      side={drawer?.type === "create" ? (
        <DetailDrawer title="添加网站" subtitle="配置站点域名、运行时和绑定主机" onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={addSite}>添加网站</button></>}>
          <FormLine label="域名" required value={draft.domain} onChange={(value) => setDraft((current) => ({ ...current, domain: value }))} />
          <FormSelectLine label="运行时" required value={draft.runtime} options={["Node 20", "PHP 8.3", "Static", "Nginx 静态"]} onChange={(value) => setDraft((current) => ({ ...current, runtime: value }))} />
          <FormSelectLine label="绑定主机" required value={draft.host} options={initialHostRecords.map((host) => host.name)} onChange={(value) => setDraft((current) => ({ ...current, host: value }))} />
        </DetailDrawer>
      ) : drawer?.type === "logs" && drawer.site ? (
        <DetailDrawer className="site-log-drawer" title="访问日志" subtitle={drawer.site.domain} onClose={() => setDrawer(null)}>
          <div className="detail-kv site-log-summary">
            <p><span>上游</span><b>{drawer.site.upstream}</b></p>
            <p><span>延迟</span><b>{drawer.site.latency}</b></p>
            <p><span>错误率</span><b>{drawer.site.errorRate}</b></p>
            <p><span>证书</span><b>{drawer.site.certDays} 天</b></p>
          </div>
          <div className="terminal-log compact-log site-access-log">
            <p>200 GET /api/health 38ms</p>
            <p>200 GET /assets/app.js 12ms</p>
            <p>304 GET /dashboard 8ms</p>
            <p>{drawer.site.status === "告警" ? "502 upstream response timeout" : "200 GET /login 24ms"}</p>
          </div>
        </DetailDrawer>
      ) : drawer?.type === "cert" && drawer.site ? (
        <DetailDrawer
          className="cert-detail-drawer"
          title="证书详情"
          subtitle={drawer.site.domain}
          onClose={() => setDrawer(null)}
          actions={<button className="primary" type="button" onClick={() => { renewSite(drawer.site!); setDrawer(null); }}><Shield size={15} />续期证书</button>}
        >
          <div className={`cert-detail-status ${certRisk(drawer.site).tone}`}>
            {drawer.site.certDays < 7 ? <ShieldAlert size={20} /> : <TriangleAlert size={20} />}
            <div><strong>{certRisk(drawer.site).label}</strong><span>证书剩余 {drawer.site.certDays} 天</span></div>
          </div>
          <div className="detail-kv cert-detail-kv">
            <p><span>域名</span><b>{drawer.site.domain}</b></p>
            <p><span>签发方</span><b>{drawer.site.certIssuer}</b></p>
            <p><span>续期方式</span><b>{drawer.site.certMode}</b></p>
            <p><span>绑定主机</span><b>{drawer.site.host}</b></p>
            <p><span>运行时</span><b>{drawer.site.runtime}</b></p>
            <p><span>负责人</span><b>{drawer.site.owner}</b></p>
          </div>
        </DetailDrawer>
      ) : drawer?.type === "runtime" && selectedRuntimeGroup ? (
        <DetailDrawer className="runtime-detail-drawer" title={selectedRuntimeGroup.runtime} subtitle={`${selectedRuntimeGroup.sites.length} 个站点 · ${selectedRuntimeGroup.hosts || "未分配主机"}`} onClose={() => setDrawer(null)}>
          <div className="runtime-detail-status">
            {(() => { const health = runtimeGroupHealth(selectedRuntimeGroup); return <><StatusLight tone={health.tone} /><span><small>运行时状态</small><strong>{health.label}</strong></span></>; })()}
          </div>
          <section className="runtime-detail-section">
            <header><Activity size={17} /><strong>容量与风险</strong></header>
            <div className="detail-kv runtime-detail-facts">
              <p><span>运行站点</span><b>{selectedRuntimeGroup.running} 个</b></p>
              <p><span>告警站点</span><b className={selectedRuntimeGroup.warning ? "orange-text" : undefined}>{selectedRuntimeGroup.warning} 个</b></p>
              <p><span>停止站点</span><b>{selectedRuntimeGroup.stopped} 个</b></p>
              <p><span>证书风险</span><b className={selectedRuntimeGroup.certDue ? "orange-text" : "green-text"}>{selectedRuntimeGroup.certDue ? `${selectedRuntimeGroup.certDue} 个` : "无风险"}</b></p>
              <p><span>总流量</span><b>{selectedRuntimeGroup.traffic}</b></p>
              <p><span>平均延迟</span><b>{selectedRuntimeGroup.avgLatency}</b></p>
            </div>
          </section>
          <section className="runtime-detail-section">
            <header><Server size={17} /><strong>站点实例</strong><span>{selectedRuntimeGroup.sites.length} 个</span></header>
            <div className="runtime-site-list">
              {selectedRuntimeGroup.sites.map((site) => (
                <article key={site.id}>
                  <StatusLight tone={siteStatusTone(site.status)} />
                  <span><strong title={site.domain}>{site.domain}</strong><small>{site.host} · {site.upstream}</small></span>
                  <span><b>{site.status}</b><small>{site.latency} · {site.traffic}</small></span>
                </article>
              ))}
            </div>
          </section>
        </DetailDrawer>
      ) : null}
    >
      {mode === "runtime" ? (
        <>
          <div className="runtime-collection-note" role="status"><Info size={16} /><span><strong>数据来源：当前站点清单</strong><small>实时采集尚未接入，页面不会显示虚假的刷新时间。</small></span></div>
          <DataTable columns={runtimeColumns} rows={runtimeGroups} emptyText="没有匹配的运行时分组" getRowKey={(group) => group.runtime} mobileCard={(group) => (
            <>
              <div className="module-card-head">
                <span className="module-card-title"><Code2 size={16} /><b>{group.runtime}</b></span>
                {(() => { const health = runtimeGroupHealth(group); return <StatusDot tone={health.tone} text={health.label} />; })()}
              </div>
              <div className="module-card-meta">
                <span><b>站点容量</b><em>{group.sites.length} 个</em></span>
                <span><b>运行 / 告警 / 停止</b><em>{group.running} / {group.warning} / {group.stopped}</em></span>
                <span><b>流量 / 延迟</b><em>{group.traffic} / {group.avgLatency}</em></span>
                <span><b>证书风险</b><em className={group.certDue ? "orange-text" : "green-text"}>{group.certDue ? `${group.certDue} 个` : "无风险"}</em></span>
              </div>
              <div className="module-card-footer"><button className="ghost small" type="button" onClick={() => setDrawer({ type: "runtime", runtime: group.runtime })}><Eye size={15} /> 查看详情</button></div>
            </>
          )} />
        </>
      ) : (
        <DataTable
          columns={siteColumns}
          rows={displayedSiteRows}
          emptyText={mode === "cert" ? "没有需要续期的网站" : "没有匹配的网站"}
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
          <>
            <div className="module-card-head">
              <span className="module-card-title site-mobile-domain">{mode === "cert" ? (row.certDays <= 7 ? <ShieldAlert className="red-text" size={16} /> : <TriangleAlert className="orange-text" size={16} />) : <Globe2 size={16} aria-hidden="true" />}<b title={row.domain}>{row.domain}</b></span>
              {mode === "cert" ? <span className={`pill ${row.certDays <= 7 ? "red" : "orange"}`}>{certRisk(row).label} · {row.certDays} 天</span> : siteStatus(row)}
            </div>
            <code className="module-card-code" title={mode === "running" ? row.upstream : row.host}>{mode === "running" ? row.upstream : row.host}</code>
            <div className="module-card-meta">
              <span><b>运行时</b><em>{row.runtime}</em></span>
              <span><b>{mode === "running" ? "延迟" : "证书"}</b><em className={isSiteCertDue(row) ? "orange-text" : "green-text"}>{mode === "running" ? row.latency : `${row.certDays} 天`}</em></span>
              <span><b>{mode === "cert" ? "签发方" : "流量"}</b><em>{mode === "cert" ? row.certIssuer : row.traffic}</em></span>
              <span><b>{mode === "running" ? "错误率" : "负责人"}</b><em>{mode === "running" ? row.errorRate : row.owner}</em></span>
            </div>
            <div className="module-card-footer">
              {mode === "cert" ? certActions(row) : siteActions(row)}
            </div>
          </>
          )}
        />
      )}
    </ModulePageShell>
  );
}

export { SitesPage };
