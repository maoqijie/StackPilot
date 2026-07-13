import {
  ArchiveRestore,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  FileArchive,
  HardDrive,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import type { DatabaseBackupRecord } from "@stackpilot/contracts";
import { useEffect, useMemo, useState } from "react";
import { createDatabaseBackup, drillDatabaseBackup, verifyDatabaseBackup } from "../api/databaseBackupsApi";
import { reauthenticate } from "../api/identityApi";
import { resolvePageMeta } from "../app/navigation";
import { databasePagePreset } from "../app/pagePresets";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { ModuleSearch } from "../components/ui/Cards";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { useDatabaseBackups } from "../features/databases/useDatabaseBackups";
import type { Notify, PageKey } from "../types/app";
import { formatBackendDateTime } from "../utils/time";

type PendingAction = { type: "create" } | { type: "verify" | "drill"; backup: DatabaseBackupRecord };
type BackupTone = "green" | "orange" | "red" | "gray";

function DatabaseBackupsPage({ page, notify, canManage = true }: { page: PageKey; notify: Notify; canManage?: boolean }) {
  const preset = databasePagePreset(page);
  const { payload, loading, error, retry, refresh } = useDatabaseBackups();
  const [search, setSearch] = useState("");
  const [verificationFilter, setVerificationFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const backups = useMemo(() => payload?.backups ?? [], [payload]);
  const selected = selectedId ? backups.find((backup) => backup.id === selectedId) ?? null : null;
  const verifiedCount = backups.filter((backup) => backup.checksumStatus === "verified").length;
  const drilledCount = backups.filter((backup) => backup.drillStatus === "succeeded").length;
  const latest = backups[0] ?? null;
  const filtered = backups.filter((backup) => {
    const keyword = search.trim().toLowerCase();
    const matchesSearch = !keyword || `${backup.fileName} ${backup.storage}`.toLowerCase().includes(keyword);
    const matchesVerification = verificationFilter === "全部"
      || (verificationFilter === "已校验" ? backup.checksumStatus === "verified" : backup.checksumStatus === "pending");
    return matchesSearch && matchesVerification;
  });

  useEffect(() => {
    if (!selectedId || !payload || backups.some((backup) => backup.id === selectedId)) return;
    queueMicrotask(() => setSelectedId((current) => current === selectedId ? null : current));
  }, [backups, payload, selectedId]);

  const closePending = () => {
    if (submitting) return;
    setPending(null);
    setPassword("");
    setMutationError(null);
  };

  const submit = async () => {
    if (!pending || !password || submitting) return;
    setSubmitting(true);
    setMutationError(null);
    try {
      const proof = await reauthenticate(password);
      const result = pending.type === "create"
        ? await createDatabaseBackup({ idempotencyKey: crypto.randomUUID() }, proof.proof)
        : pending.type === "verify"
          ? await verifyDatabaseBackup(pending.backup.id, proof.proof)
          : await drillDatabaseBackup(pending.backup.id, proof.proof);
      notify(result.message, result.tone === "danger" ? "danger" : result.tone);
      setSelectedId(result.backup.id);
      setPending(null);
      setPassword("");
      await refresh();
    } catch (reason) {
      setMutationError(reason instanceof Error ? reason.message : "数据库备份操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const begin = (action: PendingAction) => {
    setMutationError(null);
    setPassword("");
    setPending(action);
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={preset.subtitle}
      page={page}
      viewContext={{
        eyebrow: "数据库 / 备份与恢复",
        title: "Controller 数据库保护",
        chips: [payload?.source.engine ?? "等待采集", `备份 ${backups.length}`, `已演练 ${drilledCount}`],
      }}
      actions={canManage ? <button className="primary" type="button" disabled={loading || submitting || !payload} onClick={() => begin({ type: "create" })}><FileArchive size={15} /> 创建在线备份</button> : undefined}
      filters={<><ModuleSearch value={search} placeholder="搜索备份文件或存储位置" onChange={setSearch} /><FieldSelect label="校验状态" value={verificationFilter} options={["全部", "已校验", "待校验"]} onChange={setVerificationFilter} /></>}
      metrics={payload ? <BackupMetrics
        databaseSize={payload.source.sizeBytes}
        backupCount={backups.length}
        verifiedCount={verifiedCount}
        latestAt={latest?.createdAt ?? null}
        collectedAt={payload.collectedAt}
      /> : undefined}
      side={selected && <BackupDrawer backup={selected} canManage={canManage} onClose={() => setSelectedId(null)} onVerify={() => begin({ type: "verify", backup: selected })} onDrill={() => begin({ type: "drill", backup: selected })} />}
    >
      {loading && !payload ? <PageState icon={LoaderCircle} title="正在读取真实备份目录" detail="Controller 正在检查 SQLite 数据库与已配置的备份目录。" busy />
        : error && !payload ? <PageState icon={CircleAlert} title="数据库备份数据加载失败" detail={error} action="重试" onAction={() => void retry()} />
          : payload ? <div className="database-backup-content">
              {payload.warnings.length > 0 && <div className="backup-source-warning" role="status"><CircleAlert size={18} /><span>{payload.warnings.join("；")}</span></div>}
              <section className="backup-workspace" aria-labelledby="database-backups-title">
                <WorkspaceHeader title="真实备份文件" meta={`显示 ${filtered.length} / ${backups.length} 个文件`} />
                <DataTable
                  columns={[
                    { key: "file", label: "备份文件", width: "32%", render: (backup) => <button className="backup-plan-link" type="button" title={backup.fileName} aria-label={`查看备份 ${backup.fileName}`} onClick={() => setSelectedId(backup.id)}><b>{backup.fileName}</b><span>{formatBackendDateTime(backup.createdAt)}</span></button> },
                    { key: "storage", label: "存储", width: "18%", render: (backup) => <span>{backup.storage}</span> },
                    { key: "size", label: "大小", width: "14%", render: (backup) => <strong>{formatBytes(backup.sizeBytes)}</strong> },
                    { key: "checksum", label: "完整性", width: "16%", render: (backup) => <BackupStatus {...checksumStatus(backup)} compact /> },
                    { key: "drill", label: "恢复演练", width: "20%", render: (backup) => <BackupStatus {...drillStatus(backup)} compact /> },
                  ]}
                  rows={filtered}
                  emptyText={backups.length ? "没有匹配的备份文件" : "尚无备份文件，创建在线备份后会显示在这里"}
                  getRowKey={(backup) => backup.id}
                  mobileCard={(backup) => <BackupCard backup={backup} onOpen={() => setSelectedId(backup.id)} />}
                />
              </section>
            </div> : null}
      {pending && <ConfirmDialog
        className="database-backup-confirm"
        title={pending.type === "create" ? "创建在线备份" : pending.type === "verify" ? "校验备份" : "执行隔离恢复演练"}
        message={pending.type === "create" ? "将使用 SQLite 在线备份 API 写入配置的备份目录，不会停止 Controller。" : pending.type === "verify" ? "将读取备份并执行完整性检查，同时写入 SHA-256 校验文件。" : "将把备份复制到临时隔离目录验证，演练结束后删除临时文件，不会覆盖生产数据库。"}
        detail={pending.type === "create" ? payload?.source.name : pending.backup.fileName}
        confirmLabel={submitting ? "执行中..." : pending.type === "create" ? "确认备份" : pending.type === "verify" ? "确认校验" : "确认演练"}
        tone="warning"
        confirmDisabled={!password || submitting}
        onClose={closePending}
        onConfirm={() => void submit()}
      >
        <label className="cert-reauth-field"><span>当前密码</span><input autoFocus type="password" autoComplete="current-password" value={password} disabled={submitting} onChange={(event) => setPassword(event.target.value)} /></label>
        {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
      </ConfirmDialog>}
    </ModulePageShell>
  );
}

function BackupMetrics({ databaseSize, backupCount, verifiedCount, latestAt, collectedAt }: { databaseSize: number; backupCount: number; verifiedCount: number; latestAt: string | null; collectedAt: string }) {
  return <>
    <Metric icon={Database} label="数据库大小" value={formatBytes(databaseSize)} detail="Controller SQLite" tone="blue" />
    <Metric icon={HardDrive} label="备份文件" value={`${backupCount}`} detail={`${verifiedCount} 个已校验`} tone="green" />
    <Metric icon={ArchiveRestore} label="最近备份" value={latestAt ? formatShortDateTime(latestAt) : "尚无备份"} detail="来自真实文件时间" tone="purple" />
    <Metric icon={Clock3} label="采集时间" value={formatShortDateTime(collectedAt)} detail="后端提供的时间戳" tone="blue" />
  </>;
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Database; label: string; value: string; detail: string; tone: string }) {
  return <article className="backup-metric-summary"><Icon className={tone} size={26} /><span>{label}</span><strong className="backup-freshness-value">{value}</strong><em>{detail}</em></article>;
}

function WorkspaceHeader({ title, meta }: { title: string; meta: string }) {
  return <header className="backup-workspace-head"><span><FileArchive size={20} /><span><strong id="database-backups-title">{title}</strong><em>{meta}</em></span></span></header>;
}

function BackupDrawer({ backup, canManage, onClose, onVerify, onDrill }: { backup: DatabaseBackupRecord; canManage: boolean; onClose: () => void; onVerify: () => void; onDrill: () => void }) {
  return <DetailDrawer className="backup-detail-drawer" title="备份文件详情" subtitle={backup.fileName} onClose={onClose} actions={canManage ? <><button className="ghost" type="button" onClick={onVerify}>校验</button><button className="primary" type="button" onClick={onDrill}>隔离恢复演练</button></> : undefined}>
    <div className="backup-drawer-body">
      <BackupStatus {...checksumStatus(backup)} />
      <dl>
        <div><dt>文件</dt><dd><code>{backup.fileName}</code></dd></div>
        <div><dt>存储位置</dt><dd>{backup.storage}</dd></div>
        <div><dt>创建时间</dt><dd>{formatBackendDateTime(backup.createdAt)}</dd></div>
        <div><dt>文件大小</dt><dd>{formatBytes(backup.sizeBytes)}</dd></div>
        <div><dt>完整性校验</dt><dd>{checksumStatus(backup).label}</dd></div>
        <div><dt>恢复演练</dt><dd>{drillStatus(backup).label}</dd></div>
        {backup.drilledAt && <div><dt>最近演练</dt><dd>{formatBackendDateTime(backup.drilledAt)}</dd></div>}
      </dl>
      <div className="drawer-tip">界面只返回脱敏后的文件名与目录标签，不暴露服务器绝对路径。</div>
    </div>
  </DetailDrawer>;
}

function BackupCard({ backup, onOpen }: { backup: DatabaseBackupRecord; onOpen: () => void }) {
  return <div className="backup-plan-card"><header><button type="button" title={backup.fileName} aria-label={`查看备份 ${backup.fileName}`} onClick={onOpen}><strong>{backup.fileName}</strong><code>{backup.storage}</code></button><BackupStatus {...checksumStatus(backup)} compact /></header><dl><div><dt>大小</dt><dd>{formatBytes(backup.sizeBytes)}</dd></div><div><dt>创建时间</dt><dd>{formatBackendDateTime(backup.createdAt)}</dd></div><div><dt>恢复演练</dt><dd>{drillStatus(backup).label}</dd></div></dl></div>;
}

function PageState({ icon: Icon, title, detail, busy, action, onAction }: { icon: typeof CircleAlert; title: string; detail: string; busy?: boolean; action?: string; onAction?: () => void }) {
  return <section className="backup-page-state" role={busy ? "status" : "alert"}><Icon className={busy ? "backup-spin" : ""} size={24} /><strong>{title}</strong><p>{detail}</p>{action && <button className="primary" type="button" onClick={onAction}>{action}</button>}</section>;
}

function BackupStatus({ icon: Icon, label, tone, compact = false }: { icon: typeof ShieldCheck; label: string; tone: BackupTone; compact?: boolean }) {
  return <span className={`backup-status ${tone} ${compact ? "compact" : ""}`}><Icon size={compact ? 14 : 16} aria-hidden="true" /><span>{label}</span></span>;
}

function checksumStatus(backup: DatabaseBackupRecord) {
  return backup.checksumStatus === "verified"
    ? { icon: ShieldCheck, label: "已校验", tone: "green" as const }
    : { icon: CircleAlert, label: "待校验", tone: "orange" as const };
}

function drillStatus(backup: DatabaseBackupRecord) {
  return backup.drillStatus === "succeeded"
    ? { icon: CheckCircle2, label: "演练通过", tone: "green" as const }
    : { icon: ArchiveRestore, label: "尚未演练", tone: "gray" as const };
}

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit < 2 ? 0 : 1)} ${units[unit]}`;
}

function formatShortDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export { DatabaseBackupsPage };
