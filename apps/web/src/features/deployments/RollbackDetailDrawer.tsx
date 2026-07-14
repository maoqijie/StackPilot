import { RotateCcw } from "lucide-react";
import type { SiteRollbackRecord } from "../../api/deploymentsApi";
import { DetailDrawer } from "../../components/ui/DetailDrawer";
import { formatBackendDateTime } from "../../utils/time";
import { RollbackStatusBadge } from "./RollbackStatusBadge";

function RollbackDetailDrawer({
  row,
  operationStage,
  canExecute,
  busy,
  onClose,
  onExecute,
}: {
  row: SiteRollbackRecord;
  operationStage?: string | null;
  canExecute: boolean;
  busy: boolean;
  onClose: () => void;
  onExecute: (row: SiteRollbackRecord) => void;
}) {
  return (
    <DetailDrawer
      className="deploy-rollback-drawer"
      title={row.domain}
      subtitle={row.repositoryRef}
      modal
      onClose={onClose}
      actions={row.status === "available" && canExecute
        ? <button className="primary" type="button" disabled={busy} onClick={() => onExecute(row)}><RotateCcw size={15} /> 执行回滚</button>
        : undefined}
    >
      <section className="rollback-detail-section">
        <header><strong>执行状态</strong><RollbackStatusBadge status={row.status} /></header>
        <div className="rollback-progress" aria-label={`回滚进度 ${row.progressPercent}%`}>
          <span style={{ width: `${row.progressPercent}%` }} />
        </div>
        <dl>
          {operationStage && <div><dt>执行阶段</dt><dd>{operationStage}</dd></div>}
          <div><dt>进度</dt><dd>{row.progressPercent}%</dd></div>
          <div><dt>错误码</dt><dd>{row.errorCode ?? "无"}</dd></div>
          <div><dt>请求人</dt><dd>{row.requestedBy ?? "尚未执行"}</dd></div>
          <div><dt>执行原因</dt><dd>{row.reason ?? "尚未执行"}</dd></div>
          <div><dt>创建时间</dt><dd>{formatBackendDateTime(row.createdAt)}</dd></div>
          <div><dt>更新时间</dt><dd>{formatBackendDateTime(row.updatedAt)}</dd></div>
        </dl>
      </section>
      <section className="rollback-detail-section">
        <header><strong>目标版本</strong></header>
        <dl>
          <div><dt>当前 Release</dt><dd><code>{row.currentReleaseId}</code></dd></div>
          <div><dt>目标 Release</dt><dd><code>{row.targetReleaseId}</code></dd></div>
          <div><dt>目标 Plan</dt><dd><code>{row.targetPlanId}</code></dd></div>
          <div><dt>仓库引用</dt><dd><code>{row.repositoryRef}</code></dd></div>
          <div><dt>站点版本</dt><dd>{row.siteVersion}</dd></div>
          <div><dt>节点 ID</dt><dd><code>{row.nodeId}</code></dd></div>
        </dl>
      </section>
    </DetailDrawer>
  );
}

export { RollbackDetailDrawer };
