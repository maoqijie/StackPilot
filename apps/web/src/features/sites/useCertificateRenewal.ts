import { useCallback, useState } from "react";
import type { CertificateRenewalBatch } from "../../api/sitesApi";
import { createCertificateRenewal, fetchCertificateRenewal } from "../../api/sitesApi";
import { reauthenticate } from "../../api/identityApi";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import type { Notify } from "../../types/app";
import { createLocalId } from "../../utils/time";
import { batchIsTerminal } from "./certificateModel";
import type { CertificateRenewalSelection } from "./types";

function useCertificateRenewal(notify: Notify) {
  const [selection, setSelection] = useState<CertificateRenewalSelection | null>(null);
  const [password, setPassword] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<CertificateRenewalBatch | null>(null);

  const open = useCallback((next: CertificateRenewalSelection) => {
    setSelection(next);
    setIdempotencyKey(createLocalId("cert-renewal"));
    setPassword("");
    setError(null);
  }, []);
  const close = useCallback(() => {
    if (submitting) return;
    setSelection(null);
    setPassword("");
    setError(null);
  }, [submitting]);

  const submit = useCallback(async () => {
    if (!selection || !password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const proof = await reauthenticate(password);
      const nextBatch = await createCertificateRenewal({
        siteIds: selection.siteIds,
        idempotencyKey,
      }, proof.proof);
      setBatch(nextBatch);
      setSelection(null);
      setPassword("");
      notify(`证书续期批次已创建，共 ${selection.executeCount} 个站点`, "info");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "证书续期提交失败");
    } finally {
      setSubmitting(false);
    }
  }, [idempotencyKey, notify, password, selection, submitting]);

  const refreshBatch = useCallback(async (signal: AbortSignal) => {
    if (!batch || batchIsTerminal(batch)) return;
    const nextBatch = await fetchCertificateRenewal(batch.batchId, signal);
    setBatch(nextBatch);
  }, [batch]);
  useAutoRefresh(refreshBatch, undefined, Boolean(batch && !batchIsTerminal(batch)));

  return { batch, close, error, open, password, selection, setPassword, submit, submitting };
}

export { useCertificateRenewal };
