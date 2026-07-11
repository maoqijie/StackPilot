import { Edit3, Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { DetailDrawer } from "../../components/ui/DetailDrawer";
import type { GeneratedTokenSecret, TokenRow, TokenStatus } from "./types";

function TokenTable({
  rows,
  readOnly,
  onView,
  onUpdateStatus,
  onDelete,
  onBulkDisable,
}: {
  rows: TokenRow[];
  readOnly: boolean;
  onView: (token: TokenRow) => void;
  onUpdateStatus: (token: TokenRow, nextStatus: TokenStatus) => boolean;
  onDelete: (token: TokenRow) => void;
  onBulkDisable: (ids: string[]) => boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const selectedIds = selected.filter((id) => rows.some((row) => row.id === id));
  const selectedTokens = rows.filter((row) => selectedIds.includes(row.id));
  const selectedActiveCount = selectedTokens.filter((row) => row.status !== "已停用").length;
  const tokenDisplayStatus = (row: TokenRow) => {
    if (row.status === "已停用") return "已停用";
    if (row.risk === "即将过期") return "即将过期";
    if (row.access === "只读") return "仅只读";
    return "已启用";
  };
  const tokenStatusClass = (row: TokenRow) => {
    if (row.status === "已停用") return "off";
    if (row.risk === "即将过期") return "warn";
    if (row.access === "只读") return "readonly";
    return "on";
  };

  return (
    <div className="token-table-wrap">
      <div className="token-bulk-bar">
        <span>已选择 {selectedIds.length} 个令牌，{selectedActiveCount} 个可停用</span>
        <button type="button" disabled={readOnly || selectedActiveCount === 0} onClick={() => {
          const changed = onBulkDisable(selectedTokens.filter((token) => token.status !== "已停用").map((token) => token.id));
          if (changed) setSelected([]);
        }}>停用所选</button>
      </div>
      <table className="mini-table token-table">
        <thead><tr><th><span className="sr-only">选择</span></th><th>名称</th><th>令牌前缀</th><th>权限范围</th><th>创建时间</th><th>最近使用</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr className={selectedIds.includes(row.id) ? "is-selected" : ""} key={row.id}>
              <td><input aria-label={`选择令牌 ${row.name}`} type="checkbox" checked={selectedIds.includes(row.id)} onChange={(event) => {
                setSelected((current) => event.target.checked ? [...current, row.id] : current.filter((item) => item !== row.id));
              }} /></td>
              <td>{row.name}</td>
              <td>{row.prefix}</td>
              <td>{row.scope}</td>
              <td>{row.createdAt}</td>
              <td>{row.lastUsed}</td>
              <td><span className={`token-status ${tokenStatusClass(row)}`}>{tokenDisplayStatus(row)}</span></td>
              <td className="table-icon-actions">
                <button type="button" aria-label={`查看令牌 ${row.name}`} onClick={() => onView(row)}><Eye size={15} /></button>
                <button type="button" disabled={readOnly} aria-label={`${row.status === "已停用" ? "启用" : "停用"}令牌 ${row.name}`} onClick={() => {
                  const nextStatus = row.status === "已停用" ? "已启用" : "已停用";
                  onUpdateStatus(row, nextStatus);
                }}><Edit3 size={15} /></button>
                <button type="button" disabled={readOnly} aria-label={`删除令牌 ${row.name}`} onClick={() => {
                  setSelected((current) => current.filter((id) => id !== row.id));
                  onDelete(row);
                }}><Trash2 size={15} /></button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={8} className="token-empty">暂无访问令牌，请生成新令牌。</td></tr>
          )}
        </tbody>
      </table>
      <div className="token-card-list">
        {rows.map((row) => {
          const selectedRow = selectedIds.includes(row.id);
          return (
            <article className={`token-card ${selectedRow ? "is-selected" : ""}`} key={row.id}>
              <div className="token-card-head">
                <label>
                  <input aria-label={`选择令牌 ${row.name}`} type="checkbox" checked={selectedRow} onChange={(event) => {
                    setSelected((current) => event.target.checked ? [...current, row.id] : current.filter((item) => item !== row.id));
                  }} />
                  <span><b>{row.name}</b><em>{row.prefix}</em></span>
                </label>
                <span className={`token-status ${tokenStatusClass(row)}`}>{tokenDisplayStatus(row)}</span>
              </div>
              <p className="token-card-scope">{row.scope}</p>
              <div className="token-card-meta">
                <span><b>创建</b><em>{row.createdAt}</em></span>
                <span><b>最近使用</b><em>{row.lastUsed}</em></span>
                <span><b>权限</b><em>{row.access}</em></span>
                <span><b>风险</b><em>{row.risk}</em></span>
              </div>
              <div className="token-card-actions">
                <button type="button" aria-label={`查看令牌 ${row.name}`} onClick={() => onView(row)}>查看</button>
                <button type="button" disabled={readOnly} aria-label={`${row.status === "已停用" ? "启用" : "停用"}令牌 ${row.name}`} onClick={() => {
                  const nextStatus = row.status === "已停用" ? "已启用" : "已停用";
                  onUpdateStatus(row, nextStatus);
                }}>{row.status === "已停用" ? "启用" : "停用"}</button>
                <button type="button" disabled={readOnly} aria-label={`删除令牌 ${row.name}`} onClick={() => {
                  setSelected((current) => current.filter((id) => id !== row.id));
                  onDelete(row);
                }}>删除</button>
              </div>
            </article>
          );
        })}
        {rows.length === 0 && <div className="token-card-empty">暂无访问令牌，请生成新令牌。</div>}
      </div>
    </div>
  );
}

function TokenSecretDrawer({
  generated,
  onCopy,
  onClose,
}: {
  generated: GeneratedTokenSecret;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <DetailDrawer
      title="新访问令牌"
      subtitle={generated.token.name}
      onClose={onClose}
      className="settings-detail-drawer"
      modal
      actions={<><button className="primary" type="button" onClick={onCopy}>复制完整令牌</button><button className="ghost" type="button" onClick={onClose}>我已保存</button></>}
    >
      <div className="token-secret-drawer">
        <p><span>权限范围</span><b>{generated.token.scope}</b></p>
        <p><span>创建时间</span><b>{generated.token.createdAt}</b></p>
        <code>{generated.secret}</code>
        <em>完整令牌仅在此处展示一次，关闭后列表只保留前缀。</em>
      </div>
    </DetailDrawer>
  );
}

export { TokenTable, TokenSecretDrawer };
