export function assertRootHelper(getUid: (() => number) | undefined = process.getuid) {
  if (typeof getUid !== "function" || getUid() !== 0) throw new Error("database-helper 必须以 root 运行");
}
