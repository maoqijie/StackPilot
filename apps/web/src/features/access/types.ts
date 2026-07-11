

type AclUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  enabled: boolean;
  mfa: "已启用" | "未启用" | "需重置";
  lastLogin: string;
};

type AclRole = {
  id: string;
  name: string;
  desc: string;
  permissions: string[];
};

type AclPolicy = {
  id: string;
  name: string;
  module: string;
  risk: "低" | "中" | "高";
  desc: string;
  roles: string[];
  lastUpdated: string;
};

export type { AclUser, AclRole, AclPolicy };
