const collectedAt = "2026/07/11 10:00:00";

function fakeNode() {
  return {
    id: "node-local", name: "fake-host", ip: "127.0.0.1", env: "测试", status: "健康",
    source: "controller", collectedAt: new Date().toISOString(), freshness: "current",
    availability: { cpu: true, memory: true, disk: true, latency: true, backup: true, update: true, services: true },
    latency: "1ms", latencyStatus: "健康", cpu: "12%", memory: "34%", disk: "80%",
    version: "v0.1.0", uptime: "1 小时", backup: "测试备份正常", backupStatus: "健康",
    update: "已同步", owner: "test",
    services: [{ id: "stackpilot-api", name: "StackPilot API", target: "127.0.0.1:8787", status: "健康", detail: "HTTP 200", latencyMs: 1 }],
  };
}

export class FakePlatformAdapter {
  nodeId = "node-local";
  calls = { collectSnapshot: 0, collectDeviceTasks: 0, readCrontab: 0, writeCrontab: 0, runScheduledCommand: 0, restartNode: 0, readiness: 0 };
  crontab = "";
  ready = true;
  failSnapshot = false;

  async collectSnapshot() {
    this.calls.collectSnapshot += 1;
    if (this.failSnapshot) throw new Error("sensitive fake platform failure");
    return {
      physicalHostId: "ph_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      node: fakeNode(), cpuPercent: 12, memoryPercent: 34, diskPercent: 80, loadPercent: 10,
      changedFiles: [], branch: "main", commit: "abc1234", behind: 0, version: "0.1.0",
      cpuCorePercents: [10, 14], loadAverages: [0.1, 0.2, 0.3],
      totalMemoryBytes: 16 * 1024 ** 3, availableMemoryBytes: 10 * 1024 ** 3,
      disks: [
        { label: "C:", mount: "C:\\", totalBytes: 200 * 1024 ** 3, freeBytes: 80 * 1024 ** 3, usedBytes: 120 * 1024 ** 3, percent: 60 },
        { label: "D:", mount: "D:\\", totalBytes: 300 * 1024 ** 3, freeBytes: 20 * 1024 ** 3, usedBytes: 280 * 1024 ** 3, percent: 93 },
      ],
      platformLabel: "test 1.0",
      auditRows: [[collectedAt, "git", "tester", "test commit", "main", "成功", "abc1234"]],
    };
  }

  async collectDeviceTasks(_snapshot, timestamp) {
    this.calls.collectDeviceTasks += 1;
    return [{ id: "task-test", type: "服务", title: "检查测试服务", target: "fake-host", status: "成功", priority: "低", operator: "fake", queuedAt: timestamp, duration: "1ms", source: "fake platform", actionLabel: "检查", collectedAt: timestamp, logs: ["测试采集成功"] }];
  }

  async readCrontab() { this.calls.readCrontab += 1; return this.crontab; }
  async writeCrontab(content) { this.calls.writeCrontab += 1; this.crontab = content; }
  async runScheduledCommand(_command) { this.calls.runScheduledCommand += 1; return { ok: true, stdout: "", stderr: "", elapsedMs: 1 }; }
  async restartNode() { this.calls.restartNode += 1; return { ok: true, status: 200, message: "测试节点已重启" }; }
  async readiness() { this.calls.readiness += 1; return this.ready; }
}
