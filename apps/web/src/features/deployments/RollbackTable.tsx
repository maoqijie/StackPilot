import { Eye, RotateCcw } from "lucide-react";
import type { SiteRollbackRecord } from "../../api/deploymentsApi";
import { DataTable } from "../../components/ui/DataTable";
import type { TableColumn } from "../../components/ui/DataTable";
import { formatBackendDateTime } from "../../utils/time";
import { RollbackStatusBadge } from "./RollbackStatusBadge";

function RollbackTable({
  rows,
  emptyText,
  canExecute,
  busyId,
  onOpen,
  onExecute,
}: {
  rows: SiteRollbackRecord[];
  emptyText: string;
  canExecute: boolean;
  busyId: string | null;
  onOpen: (id: string) => void;
  onExecute: (row: SiteRollbackRecord) => void;
}) {
  const actions = (row: SiteRollbackRecord) => <span className="table-actions rollback-table-actions">
    <button type="button" title="查看详情" aria-label={`查看 ${row.domain} 回滚详情`} onClick={() => onOpen(row.id)}><Eye size={15} /></button>
    {row.status === "available" && canExecute && <button type="button" disabled={Boolean(busyId)} onClick={() => onExecute(row)}><RotateCcw size={15} /> 执行</button>}
  </span>;
  const columns: Array<TableColumn<SiteRollbackRecord>> = [
    { key: "domain", label: "站点", width: "190px", render: (row) => <button className="rollback-domain" type="button" title={row.domain} onClick={() => onOpen(row.id)}>{row.domain}</button> },
    { key: "current", label: "当前 Release", width: "170px", render: (row) => <code className="rollback-id" title={row.currentReleaseId}>{row.currentReleaseId}</code> },
    { key: "target", label: "目标 Release", width: "170px", render: (row) => <code className="rollback-id" title={row.targetReleaseId}>{row.targetReleaseId}</code> },
    { key: "ref", label: "仓库引用", width: "150px", render: (row) => <code className="rollback-id" title={row.repositoryRef}>{row.repositoryRef}</code> },
    { key: "status", label: "状态", width: "108px", render: (row) => <RollbackStatusBadge status={row.status} /> },
    { key: "progress", label: "进度", width: "64px", sortValue: (row) => row.progressPercent, render: (row) => `${row.progressPercent}%` },
    { key: "updated", label: "更新时间", width: "154px", sortValue: (row) => row.updatedAt, render: (row) => formatBackendDateTime(row.updatedAt) },
    { key: "ops", label: "操作", width: "128px", render: actions },
  ];
  return <DataTable columns={columns} rows={rows} emptyText={emptyText} getRowKey={(row) => row.id} mobileCard={(row) => <>
    <div className="module-card-head"><button className="module-card-title rollback-domain" type="button" title={row.domain} onClick={() => onOpen(row.id)}><RotateCcw size={15} /><b>{row.domain}</b></button><RollbackStatusBadge status={row.status} /></div>
    <code className="module-card-code">{row.repositoryRef}</code>
    <div className="module-card-meta"><span><b>目标 Release</b><em title={row.targetReleaseId}>{row.targetReleaseId}</em></span><span><b>进度</b><em>{row.progressPercent}%</em></span><span><b>站点版本</b><em>{row.siteVersion}</em></span><span><b>更新时间</b><em>{formatBackendDateTime(row.updatedAt)}</em></span></div>
    <div className="module-card-footer">{actions(row)}</div>
  </>} />;
}

export { RollbackTable };
