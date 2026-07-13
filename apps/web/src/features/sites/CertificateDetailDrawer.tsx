import { CalendarClock, RefreshCw, Shield, ShieldAlert } from "lucide-react";
import { DetailDrawer } from "../../components/ui/DetailDrawer";
import { formatBackendDateTime } from "../../utils/time";
import {
  certificateRemainingLabel, certificateRiskLabel, certificateRiskTone, formatFingerprint,
  freshnessLabel, renewalModeLabel, renewalStatusLabel,
} from "./certificateModel";
import { canRenewSiteCertificate } from "./model";
import type { SiteRuntimeView } from "./types";

function CertificateDetailDrawer({ site, canRenew, onClose, onRenew }: { site: SiteRuntimeView; canRenew: boolean; onClose: () => void; onRenew: () => void }) {
  return <DetailDrawer
    className="cert-detail-drawer"
    title={site.domain}
    subtitle={`${site.host} · ${site.nodeId}`}
    onClose={onClose}
    actions={canRenew ? <button className="primary" type="button" disabled={!canRenewSiteCertificate(site)} title={site.certificate.unavailableReason ?? undefined} onClick={onRenew}><RefreshCw size={15} /> 续期证书</button> : undefined}
  >
    <div className={`cert-detail-status ${certificateRiskTone(site)}`}><ShieldAlert size={22} /><div><strong>{certificateRiskLabel(site)} · {certificateRemainingLabel(site)}</strong><span>{freshnessLabel(site)} · 采集于 {formatBackendDateTime(site.collectedAt)}</span></div></div>
    <section className="runtime-detail-section"><header><Shield size={17} /><strong>证书信息</strong></header><div className="detail-kv cert-detail-kv"><p><span>有效期开始</span><b>{formatBackendDateTime(site.certificate.notBefore, "暂不可用")}</b></p><p><span>有效期结束</span><b>{formatBackendDateTime(site.certificate.expiresAt, "暂不可用")}</b></p><p><span>签发方</span><b>{site.certificate.issuer ?? "暂不可用"}</b></p><p><span>续期方式</span><b>{renewalModeLabel(site)}</b></p><p><span>可续期</span><b>{site.certificate.renewable ? "是" : "否"}</b></p><p><span>最新任务</span><b>{renewalStatusLabel(site.renewal.status)}</b></p></div></section>
    {!site.certificate.renewable && <div className="cert-unavailable-reason"><ShieldAlert size={16} /><span><strong>当前不可续期</strong><small>{site.certificate.unavailableReason ?? "后端未提供不可续期原因"}</small></span></div>}
    <section className="runtime-detail-section"><header><CalendarClock size={17} /><strong>证书标识</strong></header><div className="cert-identity-detail"><span><b>SAN</b><em>{site.certificate.subjectAlternativeNames.length ? site.certificate.subjectAlternativeNames.join("、") : "暂不可用"}</em></span><span><b>SHA-256 指纹</b><code>{formatFingerprint(site.certificate.fingerprintSha256)}</code></span></div></section>
    {site.renewal.message && <div className="cert-renewal-message" role="status"><strong>任务结果</strong><span>{site.renewal.message}</span><small>{formatBackendDateTime(site.renewal.updatedAt, "尚未更新")}</small></div>}
  </DetailDrawer>;
}

export { CertificateDetailDrawer };
