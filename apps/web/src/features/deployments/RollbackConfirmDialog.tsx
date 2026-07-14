import type { SiteRollbackRecord } from "../../api/deploymentsApi";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";

function RollbackConfirmDialog({
  row,
  reason,
  password,
  busy,
  error,
  onReasonChange,
  onPasswordChange,
  onConfirm,
  onClose,
}: {
  row: SiteRollbackRecord;
  reason: string;
  password: string;
  busy: boolean;
  error: string | null;
  onReasonChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      className="rollback-confirm-dialog"
      title="确认执行站点回滚"
      message={`将 ${row.domain} 原子切换到指定历史 Release，并执行健康检查。`}
      detail={`${row.currentReleaseId} -> ${row.targetReleaseId}`}
      confirmLabel="执行回滚"
      tone="warning"
      busy={busy}
      confirmDisabled={!reason.trim() || !password}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <label className="rollback-confirm-field">
        <span>回滚原因</span>
        <textarea autoFocus maxLength={240} rows={3} value={reason} disabled={busy} onChange={(event) => onReasonChange(event.target.value)} />
      </label>
      <label className="rollback-confirm-field">
        <span>当前密码</span>
        <input type="password" autoComplete="current-password" value={password} disabled={busy} onChange={(event) => onPasswordChange(event.target.value)} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </ConfirmDialog>
  );
}

export { RollbackConfirmDialog };
