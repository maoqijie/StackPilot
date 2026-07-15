import { CheckCircle2, CircleAlert, Eye, KeyRound, Plus, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CONTROLLER_FIREWALL_NODE_ID, PermissionSchema } from "@stackpilot/contracts";
import { createIdentityUser, listIdentityRoles, listIdentityUsers, reauthenticate, updateIdentityUser, type RoleRecord, type UserRecord } from "../../api/identityApi";
import { DetailDrawer } from "../../components/ui/DetailDrawer";
import type { Notify } from "../../types/app";

type UserFormState = {
  username: string;
  displayName: string;
  password: string;
  roleId: string;
  nodeIds: string;
  adminPassword: string;
};

type UserEditState = {
  roleId: string;
  nodeIds: string;
  disabled: boolean;
  adminPassword: string;
};

const emptyUserForm: UserFormState = {
  username: "",
  displayName: "",
  password: "",
  roleId: "",
  nodeIds: "all",
  adminPassword: "",
};

function nodeScopeFromInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "all" || trimmed === "全部节点") return "all" as const;
  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}

function formatNodeScope(scope: UserRecord["nodeScope"]) {
  return scope === "all" ? "全部节点" : `${scope.length} 个节点`;
}

function formatPermissions(permissions: RoleRecord["permissions"]) {
  return permissions.length === PermissionSchema.options.length ? "全部权限" : `${permissions.length} 项权限`;
}

function IdentityManagement({ notify, search }: { notify: Notify; search: string }) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyUserForm);
  const [editForm, setEditForm] = useState<UserEditState>({ roleId: "", nodeIds: "all", disabled: false, adminPassword: "" });
  const [submitting, setSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const [userResult, roleResult] = await Promise.all([listIdentityUsers(), listIdentityRoles()]);
      setUsers(userResult.users);
      setRoles(roleResult.roles);
      setError("");
      setSelectedUser((current) => current ? userResult.users.find((user) => user.id === current.id) ?? null : null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "身份数据加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const loadFrame = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(loadFrame);
  }, [load]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => `${user.username} ${user.displayName} ${user.roles.join(" ")}`.toLowerCase().includes(query));
  }, [search, users]);

  const enabledCount = users.filter((user) => !user.disabled).length;
  const disabledCount = users.length - enabledCount;
  const createRoleId = form.roleId || roles[0]?.id || "";
  const closeCreate = () => {
    if (submitting) return;
    setCreateOpen(false);
    setError("");
  };

  const submitCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const proof = await reauthenticate(form.adminPassword);
      await createIdentityUser({
        username: form.username.trim(),
        displayName: form.displayName.trim(),
        password: form.password,
        roleIds: [createRoleId],
        nodeScope: nodeScopeFromInput(form.nodeIds),
      }, proof.proof);
      notify("用户已创建", "success");
      setForm({ ...emptyUserForm, roleId: roles[0]?.id ?? "" });
      setCreateOpen(false);
      await load(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "用户创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser) return;
    setEditSubmitting(true);
    setError("");
    try {
      const proof = await reauthenticate(editForm.adminPassword);
      await updateIdentityUser(selectedUser.id, {
        roleIds: [editForm.roleId],
        nodeScope: nodeScopeFromInput(editForm.nodeIds),
        disabled: editForm.disabled,
      }, proof.proof);
      notify("用户权限已更新", editForm.disabled ? "warning" : "success");
      setSelectedUser(null);
      await load(true);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "用户权限更新失败");
    } finally {
      setEditSubmitting(false);
    }
  };

  const openUser = (user: UserRecord) => {
    setError("");
    setEditForm({
      roleId: roles.find((role) => user.roles.includes(role.id))?.id ?? roles[0]?.id ?? "",
      nodeIds: user.nodeScope === "all" ? "all" : user.nodeScope.join(", "),
      disabled: user.disabled,
      adminPassword: "",
    });
    setSelectedUser(user);
  };

  return (
    <section className="identity-management" aria-labelledby="identity-management-title">
      <header className="identity-management-head">
        <div>
          <span className="acl-overline">Controller 身份目录</span>
          <h2 id="identity-management-title">用户访问</h2>
          <p>用户、角色和节点范围由 Controller 统一校验。</p>
        </div>
        <div className="identity-management-actions">
          <button className="ghost small" type="button" onClick={() => void load(true)} disabled={loading || refreshing}>
            <RefreshCw size={15} aria-hidden="true" />
            {refreshing ? "加载中" : "重新加载"}
          </button>
          <button className="primary" type="button" onClick={() => { setError(""); setCreateOpen(true); }} disabled={loading || roles.length === 0}>
            <Plus size={16} aria-hidden="true" />
            创建用户
          </button>
        </div>
      </header>

      {error && !selectedUser && <div className="identity-error" role="alert"><CircleAlert size={17} aria-hidden="true" /><span>{error}</span></div>}

      <div className="identity-summary" aria-label="用户状态摘要">
        <div><UserRound size={18} aria-hidden="true" /><span>用户总数</span><strong>{loading ? "--" : users.length}</strong></div>
        <div><CheckCircle2 size={18} aria-hidden="true" /><span>已启用</span><strong>{loading ? "--" : enabledCount}</strong></div>
        <div><CircleAlert size={18} aria-hidden="true" /><span>已禁用</span><strong>{loading ? "--" : disabledCount}</strong></div>
      </div>

      <div className="identity-user-list" aria-label="服务端用户列表">
        <div className="identity-user-list-head" aria-hidden="true"><span>身份</span><span>角色与范围</span><span>状态</span><span>操作</span></div>
        {loading ? <div className="identity-list-state" role="status">正在加载身份数据</div> : filteredUsers.length === 0 ? <div className="identity-list-state" role="status">没有匹配的用户</div> : filteredUsers.map((user) => (
          <button className="identity-user-row" key={user.id} type="button" onClick={() => openUser(user)} aria-label={`查看用户 ${user.displayName}`}>
            <span className="identity-user-primary"><span className="identity-user-avatar"><UserRound size={17} aria-hidden="true" /></span><span><strong>{user.displayName}</strong><code>{user.username}</code></span></span>
            <span className="identity-user-access"><strong>{user.roles.join("、") || "未分配角色"}</strong><small>{formatNodeScope(user.nodeScope)}</small></span>
            <span className={`identity-user-status ${user.disabled ? "disabled" : "enabled"}`}><span className="status-light" aria-hidden="true" />{user.disabled ? "已禁用" : "已启用"}</span>
            <span className="identity-user-action"><Eye size={16} aria-hidden="true" />查看详情</span>
          </button>
        ))}
      </div>

      {createOpen && (
        <DetailDrawer title="创建用户" subtitle="新用户需要至少一个角色和一次管理员重新认证。" className="acl-user-create-modal" modal onClose={closeCreate} closeLabel="关闭创建用户弹窗" scrimCloseLabel="点击关闭创建用户弹窗" actions={<><button className="ghost" type="button" onClick={closeCreate} disabled={submitting}>取消</button><button className="primary" type="submit" form="acl-create-user-form" disabled={submitting || !createRoleId || !form.username.trim() || !form.displayName.trim() || form.password.length < 12 || !form.adminPassword}>{submitting ? "创建中" : "创建用户"}</button></>}>
          <form id="acl-create-user-form" className="identity-form" onSubmit={submitCreate}>
            <div className="identity-form-intro"><KeyRound size={18} aria-hidden="true" /><span>创建后可在用户详情中调整角色、节点范围和启用状态。</span></div>
            <label><span>用户名</span><input autoFocus value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="例如 ops-reader" autoComplete="username" /></label>
            <label><span>显示名称</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="例如 运维只读" /></label>
            <label><span>初始密码</span><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="至少 12 个字符" autoComplete="new-password" /><small>密码仅用于首次登录，不会显示在用户列表中。</small></label>
            <label><span>角色</span><select value={createRoleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}{role.builtin ? "（内置）" : ""}</option>)}</select></label>
            <label><span>节点范围</span><input value={form.nodeIds} onChange={(event) => setForm({ ...form, nodeIds: event.target.value })} placeholder="all 或 UUID，逗号分隔" /><small>全部节点用 all；Controller 本机防火墙用 {CONTROLLER_FIREWALL_NODE_ID}。</small></label>
            <label><span>当前管理员密码</span><input type="password" value={form.adminPassword} onChange={(event) => setForm({ ...form, adminPassword: event.target.value })} placeholder="用于确认本次敏感操作" autoComplete="current-password" /></label>
            {error && <p className="identity-form-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{error}</p>}
          </form>
        </DetailDrawer>
      )}

      {selectedUser && (
        <DetailDrawer title={selectedUser.displayName} subtitle={selectedUser.username} className="acl-user-detail-drawer" onClose={() => { if (!editSubmitting) { setSelectedUser(null); setError(""); } }} closeLabel="关闭用户详情" scrimCloseLabel="点击关闭用户详情" actions={<><button className="ghost" type="button" onClick={() => setSelectedUser(null)} disabled={editSubmitting}>取消</button><button className="primary" type="submit" form="acl-edit-user-form" disabled={editSubmitting || !editForm.roleId || !editForm.adminPassword}>{editSubmitting ? "保存中" : "保存访问设置"}</button></>}>
          <form id="acl-edit-user-form" className="identity-form identity-edit-form" onSubmit={submitEdit}>
            <div className="identity-detail-banner"><ShieldCheck size={20} aria-hidden="true" /><div><strong>{selectedUser.displayName}</strong><code>{selectedUser.username}</code></div><span className={`pill ${selectedUser.disabled ? "red" : "green"}`}>{selectedUser.disabled ? "已禁用" : "已启用"}</span></div>
            <div className="identity-detail-grid"><p><span>用户 ID</span><code>{selectedUser.id}</code></p><p><span>当前角色</span><strong>{selectedUser.roles.join("、") || "未分配角色"}</strong></p><p><span>节点范围</span><strong>{formatNodeScope(selectedUser.nodeScope)}</strong></p></div>
            <fieldset><legend>访问设置</legend><label><span>角色</span><select value={editForm.roleId} onChange={(event) => setEditForm({ ...editForm, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name} · {formatPermissions(role.permissions)}</option>)}</select></label><label><span>节点范围</span><input value={editForm.nodeIds} onChange={(event) => setEditForm({ ...editForm, nodeIds: event.target.value })} placeholder="all 或 UUID，逗号分隔" /><small>Controller 本机防火墙：{CONTROLLER_FIREWALL_NODE_ID}</small></label><label className="identity-checkbox"><input type="checkbox" checked={editForm.disabled} onChange={(event) => setEditForm({ ...editForm, disabled: event.target.checked })} /><span>禁用该用户</span><small>禁用后会撤销该用户的现有会话。</small></label></fieldset>
            <label><span>当前管理员密码</span><input type="password" value={editForm.adminPassword} onChange={(event) => setEditForm({ ...editForm, adminPassword: event.target.value })} placeholder="用于确认本次敏感操作" autoComplete="current-password" /></label>
            {error && <p className="identity-form-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{error}</p>}
          </form>
        </DetailDrawer>
      )}
    </section>
  );
}

export { IdentityManagement };
