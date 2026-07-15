import { KeyRound } from "lucide-react";
import { useState } from "react";
import { reauthenticate } from "../../api/identityApi";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";

export type ScheduleMutationConfirmation = {
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
  tone?: "danger" | "warning";
  execute: (proof: string) => Promise<void>;
};

export function ScheduleMutationDialog({ confirmation, onClose }: { confirmation: ScheduleMutationConfirmation; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const { proof } = await reauthenticate(password);
      await confirmation.execute(proof);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "定时任务操作失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      title={confirmation.title}
      message={confirmation.message}
      detail={confirmation.detail}
      confirmLabel={confirmation.confirmLabel}
      tone={confirmation.tone ?? "warning"}
      busy={busy}
      confirmDisabled={!password}
      onClose={onClose}
      onConfirm={() => void submit()}
      className="schedule-mutation-dialog"
    >
      <label className="terminal-reauth-field">
        <span><KeyRound size={15} />当前密码</span>
        <input data-confirm-initial type="password" autoComplete="current-password" value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </ConfirmDialog>
  );
}
