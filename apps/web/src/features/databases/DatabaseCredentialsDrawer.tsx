import { Copy, KeyRound } from "lucide-react";
import { DetailDrawer } from "../../components/ui/DetailDrawer";

export function DatabaseCredentialsDrawer({ credentials, onClose }: { credentials: Record<string, string>; onClose: () => void }) {
  const copy = () => void navigator.clipboard.writeText(JSON.stringify(credentials, null, 2));
  return <DetailDrawer title="一次性连接凭据" subtitle="关闭后无法再次查看" modal onClose={onClose} actions={<button className="primary" type="button" onClick={copy}><Copy size={15} />复制凭据</button>}><div className="database-credentials"><p><KeyRound size={18} />凭据仅在当前浏览器内解密，请立即保存到安全的密码管理器。</p>{Object.entries(credentials).map(([key, value]) => <dl key={key}><dt>{key}</dt><dd><code>{value}</code></dd></dl>)}</div></DetailDrawer>;
}
