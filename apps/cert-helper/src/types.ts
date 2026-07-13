export type RuntimeKind = "static" | "node20" | "node22";
export type LifecycleAction = "running" | "stopped" | "deleted" | "restored";

export type EnvironmentVariable = { name: string; value: string };
export type SiteManifest = {
  schemaVersion: 1;
  runtime: RuntimeKind;
  workingDirectory: string;
  buildScript: string | null;
  outputDirectory: string | null;
  startScript: string | null;
  healthCheckPath: string | null;
};

export type PreparedPlan = {
  planId: string;
  nodeId: string;
  domains: string[];
  repositoryUrl: string;
  repositoryRef: string;
  certificateEmail: string;
  certificateEnvironment: "staging" | "production";
  expectedPlanDigest: string;
  runtimePath: string | null;
  environmentVariables: EnvironmentVariable[];
  manifest: SiteManifest;
  commitSha: string;
  releaseId: string;
  preparedAt: string;
};

export type ManagedSite = {
  siteId: string;
  planId: string;
  domains: string[];
  manifest: SiteManifest;
  releaseId: string;
  port: number | null;
  desiredState: "running" | "stopped" | "deleted";
  protected: boolean;
  version: number;
  certificateName: string;
  runtimePath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HelperRequest =
  | { operation: "status" }
  | { operation: "renew"; certificateId: string }
  | { operation: "prepare"; requestId: string; planId: string; nodeId: string; domains: string[]; repositoryUrl: string; repositoryRef: string; certificateEmail: string; certificateEnvironment: "staging" | "production"; environmentVariables: EnvironmentVariable[]; expectedPlanDigest: string }
  | { operation: "activate"; requestId: string; planId: string; stagingId: string; expectedPlanDigest: string }
  | { operation: "lifecycle"; requestId: string; siteId: string; action: LifecycleAction; expectedVersion: number }
  | { operation: "logs"; requestId: string; siteId: string; since: string | null; limit: number };

export type HelperResponse = {
  ok: boolean;
  operation: HelperRequest["operation"];
  errorCode?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export class HelperError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "HelperError";
  }
}
