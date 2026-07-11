import type { NodeScope, Permission, PublicUser } from "@stackpilot/contracts";

export type Principal = {
  type: "session" | "api-token";
  id: string;
  userId: string;
  permissions: ReadonlySet<Permission>;
  nodeScope: NodeScope;
  user: PublicUser;
  csrfDigest?: string;
};

