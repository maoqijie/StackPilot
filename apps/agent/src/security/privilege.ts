export function assertAgentPrivilegeBoundary(allowRoot: boolean, getUid: (() => number) | undefined = process.getuid) {
  if (typeof getUid === "function" && getUid() === 0 && !allowRoot) throw new Error("StackPilot Agent refuses to run as root; use a dedicated unprivileged user");
}
