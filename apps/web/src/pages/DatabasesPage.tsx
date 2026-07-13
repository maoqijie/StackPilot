import { Activity, CheckCircle2, CircleAlert, CircleCheck, CircleX, Copy, Database, DatabaseBackup, Download, Eye, Lock, MoreVertical, Plus, Shield } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { databasePagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { consumePendingDatabaseFocus, readDatabaseFocusParam, useQuickIntent } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch, PanelCard } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine, FormSelectLine, ToggleLine } from "../components/ui/FormControls";
import type { DatabaseInstance } from "../features/databases/types";
import { databaseBackupTone, databaseHealthTone } from "../features/databases/model";
import { AccessSummary, BackupSummary, HealthMini, SlowInstanceList } from "../features/databases/OverviewWidgets";
import { dbRows } from "../mocks/demoData";
import type { Notify, PageKey, SetPage } from "../types/app";
import { createLocalId, currentDateTime } from "../utils/time";

function DatabasesPage({ page, setPage, notify }: { page: PageKey; setPage: SetPage; notify: Notify }) {
  const databasePreset = databasePagePreset(page);
  const initialFocusName = page === "databases" ? readDatabaseFocusParam() : null;
  const initialFocusInstance = initialFocusName ? dbRows.find((row) => row.name === initialFocusName) ?? null : null;
  const [search, setSearch] = useState(initialFocusName ?? databasePreset.search);
  const [typeFilter, setTypeFilter] = useState(databasePreset.type);
  const [statusFilter, setStatusFilter] = useState(databasePreset.status);
  const [hostFilter, setHostFilter] = useState(databasePreset.host);
  const [rows, setRows] = useState(dbRows);
  const [drawer, setDrawer] = useState<{ type: "create" } | { type: "detail"; id: string; focus?: "actions" } | null>(() => (
    initialFocusInstance ? { type: "detail", id: initialFocusInstance.id, focus: "actions" } : null
  ));
  const hostOptions = ["全部主机", ...Array.from(new Set(rows.map((row) => row.host)))];
  const selectedInstance = drawer?.type === "detail" ? rows.find((row) => row.id === drawer.id) ?? null : null;

  useEffect(() => {
    const focusDatabase = () => {
      const name = consumePendingDatabaseFocus() ?? readDatabaseFocusParam();
      if (!name) return;
      const target = rows.find((row) => row.name === name);
      setSearch(name);
      setTypeFilter("全部");
      setStatusFilter("全部");
      setHostFilter("全部主机");
      if (target) {
        setDrawer({ type: "detail", id: target.id, focus: "actions" });
        notify(`已定位 ${target.name}，保留慢查询来源上下文`, target.connectionHealth.startsWith("延迟") ? "warning" : "info");
      } else {
        setDrawer(null);
        notify(`未找到 ${name}，已保留实例搜索条件`, "warning");
      }
    };
    focusDatabase();
    window.addEventListener("stackpilot:database-focus", focusDatabase);
    window.addEventListener("hashchange", focusDatabase);
    window.addEventListener("popstate", focusDatabase);
    return () => {
      window.removeEventListener("stackpilot:database-focus", focusDatabase);
      window.removeEventListener("hashchange", focusDatabase);
      window.removeEventListener("popstate", focusDatabase);
    };
  }, [notify, rows]);

  const openDatabaseCreateFromQuick = useCallback(() => {
    setDrawer({ type: "create" });
  }, []);

  useQuickIntent("databases", "create-database", openDatabaseCreateFromQuick);
  const filteredRows = rows.filter((row) => {
    const keyword = search.trim().toLowerCase();
    const matchSearch = !keyword || `${row.name} ${row.engine} ${row.host} ${row.owner} ${row.access} ${row.region}`.toLowerCase().includes(keyword);
    const matchType = typeFilter === "全部" || row.engine.includes(typeFilter);
    const matchStatus = statusFilter === "全部" || (statusFilter === "告警" ? row.connectionHealth.startsWith("延迟") || row.backupStatus === "失败" : row.connectionHealth === "正常");
    const matchHost = hostFilter === "全部主机" || row.host === hostFilter;
    const matchSlow = page === "databases-slow" ? row.slowQueries > 0 || row.connectionHealth.startsWith("延迟") : true;
    return matchSearch && matchType && matchStatus && matchHost && matchSlow;
  });
  const totalCount = rows.length;
  const postgresCount = rows.filter((row) => row.engine.includes("PostgreSQL")).length;
  const mysqlCount = rows.filter((row) => row.engine.includes("MySQL")).length;
  const healthyCount = rows.filter((row) => row.connectionHealth === "正常").length;
  const alertCount = rows.filter((row) => row.connectionHealth.startsWith("延迟") || row.backupStatus === "失败").length;
  const backupSuccessRate = totalCount ? Math.round((rows.filter((row) => row.backupStatus === "成功").length / totalCount) * 100) : 0;
  const slowQueryCount = rows.reduce((sum, row) => sum + row.slowQueries, 0);
  const healthFocus = [...filteredRows].sort((left, right) => databaseLatency(right) - databaseLatency(left))[0] ?? null;
  const updateInstance = (id: string, patch: Partial<DatabaseInstance>) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  };
  const openDetail = (instance: DatabaseInstance, focus?: "actions") => {
    setDrawer({ type: "detail", id: instance.id, focus });
  };
  const openDatabaseDetailById = (id: string) => {
    const target = rows.find((row) => row.id === id);
    if (!target) {
      notify("没有可查看的数据库实例", "warning");
      return;
    }
    openDetail(target);
    notify(`已打开 ${target.name} 监控详情`, "info");
  };
  const runBackup = (instance: DatabaseInstance) => {
    const backupTime = currentDateTime().slice(0, 16);
    updateInstance(instance.id, { backupStatus: "成功", lastBackup: backupTime });
    setDrawer({ type: "detail", id: instance.id, focus: "actions" });
    notify(`${instance.name} 备份已完成`);
  };
  const toggleReadOnly = (instance: DatabaseInstance) => {
    if (instance.access === "仅备份") {
      notify(`${instance.name} 为仅备份实例，不能切换读写权限`, "warning");
      return;
    }
    setRows((current) => current.map((row) => {
      if (row.id !== instance.id) return row;
      if (row.access === "仅备份") return row;
      const nextAccess = row.access === "只读" ? "读写" : "只读";
      return { ...row, access: nextAccess };
    }));
    notify(`${instance.name} 已切换为${instance.access === "只读" ? "读写" : "只读"}`);
  };
  const clearSlowQueries = (instance: DatabaseInstance) => {
    updateInstance(instance.id, { slowQueries: 0 });
    notify(`${instance.name} 慢查询计数已清零`);
  };
  const copyConnection = async (instance: DatabaseInstance) => {
    const auth = instance.username ? `${encodeURIComponent(instance.username)}@` : "";
    const connection = `${instance.engine.split(" ")[0].toLowerCase()}://${auth}${instance.host}:${instance.port}/${instance.name}`;
    try {
      if (!navigator.clipboard?.writeText) {
        notify("当前浏览器不支持复制连接信息", "warning");
        return;
      }
      await navigator.clipboard.writeText(connection);
      notify(`${instance.name} 连接信息已复制`, "info");
    } catch {
      notify("浏览器未允许复制连接信息", "warning");
    }
  };
  const createInstance = (draft: { name: string; type: string; port: string; host: string; owner: string; username: string; password: string; access: DatabaseInstance["access"]; autoBackup: boolean; remoteAccess: boolean }) => {
    const engine = draft.type === "PostgreSQL" ? "PostgreSQL 16.2" : "MySQL 8.0.36";
    const next: DatabaseInstance = {
      id: createLocalId("db"),
      name: draft.name,
      engine,
      username: draft.username,
      host: draft.host,
      port: draft.port,
      connectionHealth: "正常",
      backupStatus: draft.autoBackup ? "成功" : "等待确认",
      slowQueries: 0,
      lastBackup: draft.autoBackup ? "刚刚" : "未启用",
      access: draft.access,
      owner: draft.owner,
      storage: "0.4 GB",
      connections: "0 / 80",
      latency: "新建",
      region: draft.host === "10.0.12.24" ? "新加坡" : "默认",
      autoBackup: draft.autoBackup,
      remoteAccess: draft.remoteAccess,
    };
    setRows((current) => [next, ...current]);
    setSearch("");
    setTypeFilter("全部");
    setStatusFilter("全部");
    setHostFilter("全部主机");
    setDrawer({ type: "detail", id: next.id });
    notify(`数据库 ${draft.name} 已创建，用户 ${draft.username} 已生成`);
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={`${databasePreset.subtitle} · 采集时间不可用，当前显示本地会话数据`}
      page={page}
      className="module-page-databases"
      viewContext={{
        eyebrow: "数据库 / 实例列表",
        title: "数据库实例",
        chips: [`筛选 ${filteredRows.length}/${rows.length}`, `告警 ${alertCount}`, `慢查询 ${slowQueryCount}`],
      }}
      actions={<>
        <button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredRows.length} 条数据库记录`, "info")}><Download size={15} /> 导出</button>
        <button className="primary" type="button" onClick={() => setDrawer({ type: "create" })}><Plus size={15} /> 创建数据库</button>
      </>}
      filters={<>
        <ModuleSearch value={search} placeholder="搜索数据库、主机、负责人或权限" onChange={setSearch} />
        <FieldSelect label="类型" value={typeFilter} options={["全部", "PostgreSQL", "MySQL"]} onChange={setTypeFilter} />
        <FieldSelect label="状态" value={statusFilter} options={["全部", "正常", "告警"]} onChange={setStatusFilter} />
        <FieldSelect label="主机" value={hostFilter} options={hostOptions} onChange={setHostFilter} />
      </>}
      metrics={<>
        <MetricTile icon={Database} label="PostgreSQL" value={`${postgresCount}`} tone="blue" />
        <MetricTile icon={Database} label="MySQL" value={`${mysqlCount}`} tone="blue" />
        <MetricTile icon={Activity} label="运行中" value={`${healthyCount}`} tone="green" />
        <MetricTile icon={Shield} label="告警" value={`${alertCount}`} tone={alertCount ? "orange" : "green"} />
        <BackupRateMetric value={backupSuccessRate} />
        <MetricTile icon={CircleAlert} label="慢查询" value={`${slowQueryCount}`} tone={slowQueryCount ? "orange" : "green"} />
      </>}
      side={drawer?.type === "create" ? (
        <CreateDatabaseDrawer notify={notify} onClose={() => setDrawer(null)} onCreate={createInstance} />
      ) : selectedInstance ? (
        <DetailDrawer
          className="database-instance-drawer"
          title="数据库详情"
          subtitle={selectedInstance.name}
          onClose={() => setDrawer(null)}
          actions={<>
            <button className="ghost" type="button" onClick={() => void copyConnection(selectedInstance)}><Copy size={15} /> 复制连接</button>
            <button className="primary" type="button" onClick={() => runBackup(selectedInstance)}><DatabaseBackup size={15} /> 立即备份</button>
          </>}
        >
          <DatabaseInstanceDetail
            instance={selectedInstance}
            actionFocus={drawer?.type === "detail" ? drawer.focus : undefined}
            onBackup={() => runBackup(selectedInstance)}
            onToggleReadOnly={() => toggleReadOnly(selectedInstance)}
            onClearSlowQueries={() => clearSlowQueries(selectedInstance)}
            onCopy={() => void copyConnection(selectedInstance)}
          />
        </DetailDrawer>
      ) : null}
    >
      <div className="database-instance-content">
        <DataTable
          columns={[
            { key: "name", label: "名称", width: "172px", sortValue: (row) => row.name, render: (row) => <button className="module-row-link database-instance-name" type="button" title={row.name} aria-label={`查看数据库 ${row.name}`} onClick={() => openDetail(row)}><Database size={15} aria-hidden="true" /><b>{row.name}</b></button> },
            { key: "engine", label: "类型", width: "126px", sortValue: (row) => row.engine, render: (row) => <span className="database-engine"><Database size={15} aria-hidden="true" /> {row.engine}</span> },
            { key: "endpoint", label: "主机 / 端口", width: "140px", sortValue: (row) => `${row.host}:${row.port}`, render: (row) => <code className="database-endpoint" title={`${row.host}:${row.port}`}>{row.host}:{row.port}</code> },
            { key: "health", label: "连接健康", width: "114px", sortValue: (row) => databaseLatency(row), render: (row) => <ConnectionStatus instance={row} /> },
            { key: "backup", label: "备份", width: "92px", sortValue: (row) => row.backupStatus, render: (row) => <BackupStatus status={row.backupStatus} /> },
            { key: "slow", label: "慢查询", width: "68px", sortValue: (row) => row.slowQueries, render: (row) => <b className={row.slowQueries > 0 ? "orange-text" : "green-text"}>{row.slowQueries}</b> },
            { key: "lastBackup", label: "最近备份", width: "130px", sortValue: (row) => row.lastBackup, render: (row) => row.lastBackup },
            { key: "access", label: "权限", width: "116px", render: (row) => <span className="database-pill-group"><span className={`pill ${row.access === "读写" ? "blue" : row.access === "只读" ? "gray" : "orange"}`}>{row.access}</span><span className="pill green">{row.owner}</span></span> },
            { key: "ops", label: "操作", width: "122px", render: (row) => <span className="table-icon-actions database-table-actions"><button type="button" title="查看详情" aria-label={`查看 ${row.name} 详情`} onClick={() => openDetail(row)}><Eye size={15} /></button><button type="button" title="立即备份" aria-label={`立即备份 ${row.name}`} onClick={() => runBackup(row)}><DatabaseBackup size={15} /></button><button type="button" title="更多操作" aria-label={`打开 ${row.name} 更多操作`} onClick={() => openDetail(row, "actions")}><MoreVertical size={15} /></button></span> },
          ]}
          rows={filteredRows}
          emptyText="没有匹配的数据库实例"
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
            <DatabaseMobileCard
              instance={row}
              onOpen={() => openDetail(row)}
              onBackup={() => runBackup(row)}
              onMore={() => openDetail(row, "actions")}
            />
          )}
        />
        {filteredRows.length ? (
          <section className="database-instance-lower">
            <PanelCard title="当前备份状态" action="查看备份计划" onAction={() => setPage("databases-backups", { message: "已打开数据库 / 备份计划", tone: "info" })}>
              <BackupSummary rows={filteredRows} />
            </PanelCard>
            <PanelCard title={`连接健康（${healthFocus?.name ?? "不可用"}）`} action={healthFocus ? "查看监控详情" : undefined} onAction={healthFocus ? () => openDatabaseDetailById(healthFocus.id) : undefined}>
              <HealthMini instance={healthFocus} />
            </PanelCard>
            <PanelCard title="慢查询实例" action="查看慢查询" onAction={() => setPage("databases-slow", { message: "已打开数据库 / 慢查询", tone: "info" })}>
              <SlowInstanceList rows={filteredRows} onOpen={openDatabaseDetailById} />
            </PanelCard>
            <PanelCard title="权限分布">
              <AccessSummary rows={filteredRows} />
            </PanelCard>
          </section>
        ) : (
          <p className="module-empty-card">调整搜索或筛选条件后，可继续查看备份、连接健康和慢查询概览。</p>
        )}
      </div>
    </ModulePageShell>
  );
}

function databaseLatency(instance: DatabaseInstance) {
  const value = Number.parseInt(instance.latency, 10);
  return Number.isFinite(value) ? value : 0;
}

function ConnectionStatus({ instance }: { instance: DatabaseInstance }) {
  const delayed = instance.connectionHealth.startsWith("延迟");
  const Icon = delayed ? CircleAlert : CircleCheck;
  return (
    <span className={`database-semantic-status ${databaseHealthTone(instance)}`}>
      <Icon size={15} aria-hidden="true" />
      <span>{instance.connectionHealth}</span>
    </span>
  );
}

function BackupStatus({ status }: { status: DatabaseInstance["backupStatus"] }) {
  const Icon = status === "成功" ? CircleCheck : status === "失败" ? CircleX : status === "运行中" ? Activity : CircleAlert;
  return (
    <span className={`database-semantic-status ${databaseBackupTone(status)}`}>
      <Icon size={15} aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}

function BackupRateMetric({ value }: { value: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const tone = value >= 95 ? "green" : "orange";
  return (
    <article className="database-rate-metric">
      <span className={`database-rate-ring ${tone}`} aria-label={`备份成功率 ${value}%`}>
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle className="database-rate-track" cx="22" cy="22" r={radius} />
          <circle
            className="database-rate-value"
            cx="22"
            cy="22"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
          />
        </svg>
        <DatabaseBackup size={16} aria-hidden="true" />
      </span>
      <span>备份成功率</span>
      <strong>{value}%</strong>
    </article>
  );
}

function DatabaseMobileCard({
  instance,
  onOpen,
  onBackup,
  onMore,
}: {
  instance: DatabaseInstance;
  onOpen: () => void;
  onBackup: () => void;
  onMore: () => void;
}) {
  return (
    <>
      <div className="module-card-head database-mobile-head">
        <button className="module-row-link database-mobile-name" type="button" title={instance.name} aria-label={`查看数据库 ${instance.name}`} onClick={onOpen}>
          <Database size={16} aria-hidden="true" />
          <b>{instance.name}</b>
        </button>
        <ConnectionStatus instance={instance} />
      </div>
      <code className="module-card-code">{instance.host}:{instance.port}</code>
      <div className="module-card-meta">
        <span><b>引擎</b><em>{instance.engine}</em></span>
        <span><b>备份</b><em><BackupStatus status={instance.backupStatus} /></em></span>
        <span><b>慢查询</b><em className={instance.slowQueries ? "orange-text" : "green-text"}>{instance.slowQueries} 条</em></span>
        <span><b>最近备份</b><em>{instance.lastBackup}</em></span>
        <span><b>权限</b><em>{instance.access} · {instance.owner}</em></span>
        <span><b>存储 / 连接</b><em>{instance.storage} · {instance.connections}</em></span>
      </div>
      <div className="module-card-footer database-mobile-actions">
        <button className="ghost small" type="button" aria-label={`查看 ${instance.name} 详情`} onClick={onOpen}><Eye size={14} /> 详情</button>
        <button className="ghost small" type="button" aria-label={`立即备份 ${instance.name}`} onClick={onBackup}><DatabaseBackup size={14} /> 备份</button>
        <button className="ghost small" type="button" aria-label={`打开 ${instance.name} 更多操作`} onClick={onMore}><MoreVertical size={14} /> 更多</button>
      </div>
    </>
  );
}

function DatabaseInstanceDetail({
  instance,
  actionFocus,
  onBackup,
  onToggleReadOnly,
  onClearSlowQueries,
  onCopy,
}: {
  instance: DatabaseInstance;
  actionFocus?: "actions";
  onBackup: () => void;
  onToggleReadOnly: () => void;
  onClearSlowQueries: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="database-detail">
      <div className="database-detail-grid">
        <p><span>引擎</span><b>{instance.engine}</b></p>
        <p><span>用户名</span><b>{instance.username ?? "默认管理员"}</b></p>
        <p><span>主机 / 端口</span><b>{instance.host}:{instance.port}</b></p>
        <p><span>连接健康</span><b><ConnectionStatus instance={instance} /></b></p>
        <p><span>备份状态</span><b><BackupStatus status={instance.backupStatus} /></b></p>
        <p><span>最近备份</span><b>{instance.lastBackup}</b></p>
        <p><span>慢查询</span><b className={instance.slowQueries ? "orange-text" : "green-text"}>{instance.slowQueries} 条</b></p>
        <p><span>权限范围</span><b>{instance.access} · {instance.owner}</b></p>
        <p><span>存储 / 连接</span><b>{instance.storage} · {instance.connections}</b></p>
        <p><span>区域</span><b>{instance.region}</b></p>
        <p><span>延迟</span><b>{instance.latency}</b></p>
        <p><span>自动备份</span><b>{instance.autoBackup ? "已启用" : "未启用"}</b></p>
        <p><span>远程连接</span><b>{instance.remoteAccess ? "允许白名单" : "未开放"}</b></p>
        <p><span>采集时间</span><b>不可用 · 本地会话数据</b></p>
      </div>
      <div className="database-detail-actions" data-focused={actionFocus === "actions" ? "true" : undefined}>
        <button type="button" onClick={onBackup}><DatabaseBackup size={14} /> 立即备份</button>
        <button
          type="button"
          disabled={instance.access === "仅备份"}
          title={instance.access === "仅备份" ? "仅备份实例不能切换读写权限" : undefined}
          onClick={onToggleReadOnly}
        >
          <Lock size={14} /> {instance.access === "仅备份" ? "权限锁定" : instance.access === "只读" ? "恢复读写" : "设为只读"}
        </button>
        <button type="button" onClick={onClearSlowQueries}><CheckCircle2 size={14} /> 清空慢查询</button>
        <button type="button" onClick={onCopy}><Copy size={14} /> 复制连接</button>
      </div>
      <div className={instance.backupStatus === "失败" ? "drawer-warning" : "drawer-tip"}>
        {instance.backupStatus === "失败"
          ? "最近一次备份失败，建议立即执行备份并确认备份计划。"
          : "实例操作会同步到当前视图，并保留在本次会话。"}
      </div>
    </div>
  );
}

function CreateDatabaseDrawer({
  notify,
  onClose,
  onCreate,
}: {
  notify: Notify;
  onClose: () => void;
  onCreate: (draft: { name: string; type: string; port: string; host: string; owner: string; username: string; password: string; access: DatabaseInstance["access"]; autoBackup: boolean; remoteAccess: boolean }) => void;
}) {
  const [name, setName] = useState("newdb_app");
  const [type, setType] = useState("PostgreSQL");
  const [host, setHost] = useState("10.0.12.24");
  const [port, setPort] = useState("5432");
  const [owner, setOwner] = useState("研发");
  const [username, setUsername] = useState("newdb_app");
  const [password, setPassword] = useState("ChangeMe-2026!");
  const [access, setAccess] = useState<DatabaseInstance["access"]>("读写");
  const [autoBackup, setAutoBackup] = useState(true);
  const [remote, setRemote] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; port?: string; username?: string; password?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const portRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const resetDraft = () => {
    setName("newdb_app");
    setType("PostgreSQL");
    setHost("10.0.12.24");
    setPort("5432");
    setOwner("研发");
    setUsername("newdb_app");
    setPassword("ChangeMe-2026!");
    setAccess("读写");
    setAutoBackup(true);
    setRemote(false);
    setErrors({});
  };
  const submit = () => {
    const portNumber = Number(port.trim());
    const nextErrors = {
      name: name.trim() ? undefined : "请输入数据库名",
      port: Number.isInteger(portNumber) && portNumber > 0 && portNumber <= 65535 ? undefined : "端口必须是 1-65535 的数字",
      username: username.trim() ? undefined : "请输入用户名",
      password: password.trim().length >= 8 ? undefined : "初始密码至少 8 位",
    };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.port || nextErrors.username || nextErrors.password) {
      notify("请完善数据库创建表单", "danger");
      window.requestAnimationFrame(() => {
        if (nextErrors.name) nameRef.current?.focus();
        else if (nextErrors.port) portRef.current?.focus();
        else if (nextErrors.username) usernameRef.current?.focus();
        else passwordRef.current?.focus();
      });
      return;
    }
    onCreate({ name: name.trim(), type, port: port.trim(), host, owner, username: username.trim(), password: password.trim(), access, autoBackup, remoteAccess: remote });
  };

  return (
    <DetailDrawer
      className="database-instance-drawer"
      title="创建数据库"
      subtitle="配置实例参数和初始化权限"
      onClose={onClose}
      actions={<><button className="ghost" type="button" onClick={resetDraft}>重置</button><button className="primary" type="button" onClick={submit}>创建数据库</button></>}
    >
      <div className="create-database-form">
        <FormLine label="数据库名" required value={name} inputRef={nameRef} error={errors.name} onChange={(value) => {
          const shouldSyncUsername = username === name || username === "newdb_app";
          setName(value);
          if (shouldSyncUsername) setUsername(value || "newdb_app");
          if (errors.name && value.trim()) setErrors((current) => ({ ...current, name: undefined }));
        }} />
        <FormSelectLine label="类型" required value={type} options={["PostgreSQL", "MySQL"]} onChange={(next) => {
          setType(next);
          setPort(next === "PostgreSQL" ? "5432" : "3306");
          setErrors((current) => ({ ...current, port: undefined }));
        }} icon={<Database size={14} />} />
        <FormSelectLine label="绑定主机" required value={host} options={["10.0.12.24", "10.0.12.31", "10.0.13.15", "10.0.14.18"]} onChange={setHost} />
        <FormLine label="端口" required value={port} inputRef={portRef} error={errors.port} onChange={(value) => {
          setPort(value);
          if (errors.port && Number.isInteger(Number(value.trim()))) setErrors((current) => ({ ...current, port: undefined }));
        }} hint={`默认 ${type === "PostgreSQL" ? "5432" : "3306"}`} />
        <FormSelectLine label="负责人" value={owner} options={["DBA", "研发", "运维", "仅团队"]} onChange={setOwner} />
        <FormLine label="用户名" required value={username} inputRef={usernameRef} error={errors.username} onChange={(value) => {
          setUsername(value);
          if (errors.username && value.trim()) setErrors((current) => ({ ...current, username: undefined }));
        }} />
        <FormLine label="初始密码" required value={password} inputRef={passwordRef} error={errors.password} inputType="password" strength onChange={(value) => {
          setPassword(value);
          if (errors.password && value.trim().length >= 8) setErrors((current) => ({ ...current, password: undefined }));
        }} />
        <FormSelectLine label="字符集" value="UTF8" />
        <FormSelectLine label="时区" value="Asia/Shanghai" />
        <FormSelectLine label="权限范围" required value={access} options={["读写", "只读", "仅备份"]} onChange={(value) => setAccess(value as DatabaseInstance["access"])} />
        <ToggleLine label="自动备份" active={autoBackup} onToggle={setAutoBackup} hint="每天 02:00 执行，备份保留 7 天" />
        <ToggleLine label="允许远程连接" active={remote} onToggle={setRemote} hint="仅允许白名单 IP 访问" />
        <div className="drawer-tip">创建后会进入实例列表顶部，并自动打开新实例详情。</div>
        <div className="drawer-warning">开启远程连接时请确认白名单和权限范围。</div>
      </div>
    </DetailDrawer>
  );
}

export { DatabasesPage, DatabaseInstanceDetail, CreateDatabaseDrawer };
