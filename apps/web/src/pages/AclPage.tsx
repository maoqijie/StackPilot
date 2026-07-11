import { Lock, Shield, UserRound } from "lucide-react";
import { useState } from "react";
import { aclPagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch, PanelCard } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { FieldSelect } from "../components/ui/FormControls";
import type { AclPolicy, AclRole, AclUser } from "../features/access/types";
import { initialAclPolicies, initialAclRoles, initialAclUsers, permissionOptions } from "../mocks/demoData";
import type { Notify, PageKey, SetPage } from "../types/app";
import { currentClock } from "../utils/time";
import { IdentityManagement } from "../features/access/IdentityManagement";

function AclPage({ page, setPage, notify }: { page: PageKey; setPage: SetPage; notify: Notify }) {
  const aclPreset = aclPagePreset(page);
  const tab = aclPreset.tab;
  const [users, setUsers] = useState(initialAclUsers);
  const [roles, setRoles] = useState(initialAclRoles);
  const [policies, setPolicies] = useState(initialAclPolicies);
  const [savedRoleIds, setSavedRoleIds] = useState(() => new Set(initialAclRoles.map((role) => role.id)));
  const [savedPolicyIds, setSavedPolicyIds] = useState(() => new Set(initialAclPolicies.map((policy) => policy.id)));
  const [userSearch, setUserSearch] = useState("");
  const [policySearch, setPolicySearch] = useState("");
  const [policyModule, setPolicyModule] = useState("全部");
  const [policyRisk, setPolicyRisk] = useState("全部");
  const [selectedPolicyId, setSelectedPolicyId] = useState(initialAclPolicies[0].id);
  const [roleId, setRoleId] = useState(initialAclRoles[0].id);
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const filteredUsers = users.filter((user) => !userSearch.trim() || `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(userSearch.trim().toLowerCase()));
  const filteredPolicies = policies.filter((policy) => {
    const query = policySearch.trim().toLowerCase();
    const matchSearch = !query || `${policy.name} ${policy.module} ${policy.desc} ${policy.roles.join(" ")}`.toLowerCase().includes(query);
    const matchModule = policyModule === "全部" || policy.module === policyModule;
    const matchRisk = policyRisk === "全部" || policy.risk === policyRisk;
    return matchSearch && matchModule && matchRisk;
  });
  const selectedPolicy = filteredPolicies.find((policy) => policy.id === selectedPolicyId) ?? filteredPolicies[0] ?? null;
  const policyModules = ["全部", ...Array.from(new Set(policies.map((policy) => policy.module)))];
  const dirtyRoles = roles.filter((role) => !savedRoleIds.has(role.id)).length;
  const dirtyPolicies = policies.filter((policy) => !savedPolicyIds.has(policy.id)).length;
  const roleIsDirty = (role: AclRole) => !savedRoleIds.has(role.id);
  const policyIsDirty = (policy: AclPolicy) => !savedPolicyIds.has(policy.id);
  const setAclTab = (nextTab: "users" | "roles" | "policies") => {
    const pageForTab = nextTab === "roles" ? "acl-roles" : nextTab === "policies" ? "acl-policies" : "acl-users";
    if (nextTab !== "policies") {
      setPolicyModule("全部");
      setPolicyRisk("全部");
    }
    setPage(pageForTab, { message: `已切换到${nextTab === "users" ? "用户" : nextTab === "roles" ? "角色" : "权限项"}视图`, tone: "info" });
  };
  const saveRole = (role: AclRole) => {
    setSavedRoleIds((current) => new Set(current).add(role.id));
    notify(`${role.name} 权限已保存`);
  };
  const savePolicy = (policy: AclPolicy) => {
    setSavedPolicyIds((current) => new Set(current).add(policy.id));
    notify(`${policy.name} 关联角色已保存`);
  };
  const saveAllRoles = () => {
    setSavedRoleIds(new Set(roles.map((role) => role.id)));
    setSavedPolicyIds(new Set(policies.map((policy) => policy.id)));
    notify(`已保存 ${dirtyRoles + dirtyPolicies} 个角色与权限绑定变更`);
  };
  const saveAllPolicies = () => {
    setSavedPolicyIds(new Set(policies.map((policy) => policy.id)));
    notify(`已保存 ${dirtyPolicies} 个权限项变更`);
  };
  const togglePermission = (permission: string) => {
    const nextAllowed = !selectedRole.permissions.includes(permission);
    const policy = policies.find((item) => item.name === permission);
    setRoles((current) => current.map((role) => {
      if (role.id !== selectedRole.id) return role;
      return nextAllowed
        ? { ...role, permissions: [...role.permissions, permission] }
        : { ...role, permissions: role.permissions.filter((item) => item !== permission) };
    }));
    setPolicies((current) => current.map((item) => {
      if (item.name !== permission) return item;
      const nextRoles = nextAllowed
        ? Array.from(new Set([...item.roles, selectedRole.name]))
        : item.roles.filter((roleName) => roleName !== selectedRole.name);
      return { ...item, roles: nextRoles, lastUpdated: currentClock() };
    }));
    setSavedRoleIds((current) => {
      const next = new Set(current);
      next.delete(selectedRole.id);
      return next;
    });
    setSavedPolicyIds((current) => {
      if (!policy) return current;
      const next = new Set(current);
      next.delete(policy.id);
      return next;
    });
  };
  const togglePolicyRole = (policy: AclPolicy, role: AclRole) => {
    const checked = policy.roles.includes(role.name);
    setPolicies((current) => current.map((item) => item.id === policy.id ? {
      ...item,
      roles: checked ? item.roles.filter((name) => name !== role.name) : [...item.roles, role.name],
      lastUpdated: currentClock(),
    } : item));
    setRoles((current) => current.map((item) => {
      if (item.id !== role.id) return item;
      const hasPermission = item.permissions.includes(policy.name);
      return hasPermission
        ? { ...item, permissions: item.permissions.filter((permission) => permission !== policy.name) }
        : { ...item, permissions: [...item.permissions, policy.name] };
    }));
    setSavedPolicyIds((current) => {
      const next = new Set(current);
      next.delete(policy.id);
      return next;
    });
    setSavedRoleIds((current) => {
      const next = new Set(current);
      next.delete(role.id);
      return next;
    });
    notify(`${role.name} 已${checked ? "移除" : "关联"} ${policy.name}`, checked ? "warning" : "info");
  };
  const resetUserMfa = (user: AclUser) => {
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, mfa: "需重置" } : item));
    notify(`${user.name} MFA 已重置`, "warning");
  };
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={aclPreset.subtitle}
      page={page}
      actions={tab === "roles" ? <button className={dirtyRoles + dirtyPolicies > 0 ? "primary" : "ghost"} type="button" disabled={dirtyRoles + dirtyPolicies === 0} onClick={saveAllRoles}>{dirtyRoles + dirtyPolicies > 0 ? `保存全部 ACL 变更 (${dirtyRoles + dirtyPolicies})` : "角色权限已保存"}</button> : tab === "policies" && selectedPolicy ? <button className={dirtyPolicies > 0 ? "primary" : "ghost"} type="button" disabled={dirtyPolicies === 0} onClick={saveAllPolicies}>{dirtyPolicies > 0 ? `保存全部权限变更 (${dirtyPolicies})` : "权限项已保存"}</button> : undefined}
      filters={<><nav className="deploy-tabs" aria-label="权限视图"><button className={tab === "users" ? "active" : ""} type="button" aria-current={tab === "users" ? "page" : undefined} onClick={() => setAclTab("users")}>用户</button><button className={tab === "roles" ? "active" : ""} type="button" aria-current={tab === "roles" ? "page" : undefined} onClick={() => setAclTab("roles")}>角色</button><button className={tab === "policies" ? "active" : ""} type="button" aria-current={tab === "policies" ? "page" : undefined} onClick={() => setAclTab("policies")}>权限项</button></nav>{tab === "users" && <ModuleSearch value={userSearch} placeholder="搜索用户、邮箱或角色" onChange={setUserSearch} />}{tab === "policies" && <><ModuleSearch value={policySearch} placeholder="搜索权限项、模块或角色" onChange={setPolicySearch} /><FieldSelect label="模块" value={policyModule} options={policyModules} onChange={setPolicyModule} /><FieldSelect label="风险" value={policyRisk} options={["全部", "高", "中", "低"]} onChange={setPolicyRisk} /></>}</>}
      metrics={<><MetricTile icon={UserRound} label="用户" value={`${users.length}`} tone="blue" /><MetricTile icon={Lock} label="未保存" value={`${dirtyRoles + dirtyPolicies}`} tone={dirtyRoles + dirtyPolicies > 0 ? "orange" : "purple"} /><MetricTile icon={Shield} label="高风险权限" value={`${policies.filter((policy) => policy.risk === "高").length}`} tone="orange" /></>}
    >
      {tab === "users" && <IdentityManagement notify={notify} />}
      {tab === "users" && <p className="acl-demo-label">以下为既有界面演示数据，不参与服务端授权</p>}
      {tab === "users" ? (
        <DataTable
          columns={[
            { key: "name", label: "用户", width: "180px", render: (row) => <b>{row.name}</b> },
            { key: "email", label: "邮箱", render: (row) => row.email },
            { key: "role", label: "角色", render: (row) => <span className="pill blue">{row.role}</span> },
            { key: "enabled", label: "状态", render: (row) => <span className={`pill ${row.enabled ? "green" : "red"}`}>{row.enabled ? "启用" : "禁用"}</span> },
            { key: "mfa", label: "MFA", render: (row) => <span className={row.mfa === "已启用" ? "green-text" : "orange-text"}>{row.mfa}</span> },
            { key: "last", label: "最近登录", render: (row) => row.lastLogin },
            { key: "ops", label: "操作", width: "180px", render: (row) => <span className="table-actions"><button type="button" onClick={() => { setUsers((current) => current.map((item) => item.id === row.id ? { ...item, enabled: !item.enabled } : item)); notify(`${row.name} 已${row.enabled ? "禁用" : "启用"}`); }}>{row.enabled ? "禁用" : "启用"}</button><button type="button" onClick={() => resetUserMfa(row)}>重置 MFA</button></span> },
          ]}
          rows={filteredUsers}
          emptyText="没有匹配的用户"
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
            <>
              <div className="module-card-head">
                <span className="module-card-title"><UserRound size={15} /><b>{row.name}</b></span>
                <span className={`pill ${row.enabled ? "green" : "red"}`}>{row.enabled ? "启用" : "禁用"}</span>
              </div>
              <code className="module-card-code">{row.email}</code>
              <div className="module-card-meta">
                <span><b>角色</b><em>{row.role}</em></span>
                <span><b>MFA</b><em className={row.mfa === "已启用" ? "green-text" : "orange-text"}>{row.mfa}</em></span>
                <span><b>最近登录</b><em>{row.lastLogin}</em></span>
                <span><b>状态</b><em>{row.enabled ? "启用" : "禁用"}</em></span>
              </div>
              <div className="module-card-footer">
                <div className="table-actions actions-2">
                  <button type="button" aria-label={`${row.enabled ? "禁用" : "启用"}用户 ${row.name}`} onClick={() => { setUsers((current) => current.map((item) => item.id === row.id ? { ...item, enabled: !item.enabled } : item)); notify(`${row.name} 已${row.enabled ? "禁用" : "启用"}`); }}>{row.enabled ? "禁用" : "启用"}</button>
                  <button type="button" aria-label={`重置用户 ${row.name} MFA`} onClick={() => resetUserMfa(row)}>重置 MFA</button>
                </div>
              </div>
            </>
          )}
        />
      ) : tab === "roles" ? (
        <div className="acl-role-layout">
          <PanelCard title="角色列表">
            <div className="role-list" aria-label="角色列表">
              {roles.map((role) => <button key={role.id} className={role.id === roleId ? "active" : ""} type="button" aria-current={role.id === roleId ? "true" : undefined} onClick={() => setRoleId(role.id)}><strong>{role.name}</strong><span>{role.desc}</span></button>)}
            </div>
          </PanelCard>
          <PanelCard title={`${selectedRole.name} 权限项`} action={roleIsDirty(selectedRole) ? "保存当前角色" : undefined} onAction={() => saveRole(selectedRole)}>
            <div className="permission-grid">
              {permissionOptions.map((permission) => (
                <button key={permission} className={selectedRole.permissions.includes(permission) ? "checked" : ""} type="button" aria-pressed={selectedRole.permissions.includes(permission)} onClick={() => togglePermission(permission)}>
                  <span>{permission}</span>
                  <i>{selectedRole.permissions.includes(permission) ? "已允许" : "未允许"}</i>
                </button>
              ))}
            </div>
          </PanelCard>
        </div>
      ) : (
        <div className="acl-policy-layout">
          <div className="policy-catalog" aria-label="权限项目录">
            {filteredPolicies.map((policy) => (
              <button key={policy.id} className={policy.id === selectedPolicy?.id ? "active" : ""} type="button" aria-current={policy.id === selectedPolicy?.id ? "true" : undefined} onClick={() => setSelectedPolicyId(policy.id)}>
                <span><b>{policy.name}</b><i>{policy.module}</i></span>
                <em className={policy.risk === "高" ? "red-text" : policy.risk === "中" ? "orange-text" : "blue-text"}>{policy.risk}风险</em>
                <small>{policy.desc}</small>
              </button>
            ))}
            {filteredPolicies.length === 0 && <p className="module-empty-card">没有匹配的权限项</p>}
          </div>
          {selectedPolicy ? (
            <PanelCard title={`${selectedPolicy.name} 关联角色`} action={policyIsDirty(selectedPolicy) ? "保存当前权限项" : undefined} onAction={() => savePolicy(selectedPolicy)}>
              <div className="policy-detail">
                <p><span>模块</span><b>{selectedPolicy.module}</b></p>
                <p><span>风险级别</span><b>{selectedPolicy.risk}风险</b></p>
                <p><span>最近更新</span><b>{selectedPolicy.lastUpdated}</b></p>
                <p><span>说明</span><b>{selectedPolicy.desc}</b></p>
              </div>
              <div className="policy-role-list">
                {roles.map((role) => {
                  const checked = selectedPolicy.roles.includes(role.name);
                  return (
                    <button key={role.id} className={checked ? "checked" : ""} type="button" aria-pressed={checked} onClick={() => togglePolicyRole(selectedPolicy, role)}>
                      <span>{role.name}</span>
                      <i>{checked ? "已关联" : "未关联"}</i>
                    </button>
                  );
                })}
              </div>
            </PanelCard>
          ) : (
            <PanelCard title="权限项详情">
              <p className="module-empty-card">没有可展示的权限项详情</p>
            </PanelCard>
          )}
        </div>
      )}
    </ModulePageShell>
  );
}

export { AclPage };
