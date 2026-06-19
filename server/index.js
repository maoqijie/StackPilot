import { createServer } from "node:http";
import { URL } from "node:url";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

const nowTime = () => new Date().toLocaleString("zh-CN", { hour12: false });
const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const auditRows = [
  ["05-22 10:24:31", "10.0.0.55", "李敏", "部署应用", "/api (sg-web-02)", "成功", "a1b2c3d4e5f6"],
  ["05-22 10:23:11", "10.0.1.100", "王工", "更新防火墙", "panel-bj-02", "成功", "b2c3d4e5f6g7"],
  ["05-22 10:22:05", "10.0.0.11", "系统", "备份数据库", "shop_db", "成功", "c3d4e5f6g7h8"],
  ["05-22 10:18:42", "10.0.2.77", "王强", "重启服务", "nginx", "成功", "d4e5f6g7h8i9"],
  ["05-22 10:15:19", "10.0.0.55", "系统", "上传文件", "/var/www/html", "成功", "e5f6g7h8i9j0"],
  ["05-22 10:12:08", "10.0.1.23", "赵磊", "修改配置", "php.ini", "成功", "f6g7h8i9j0k1"],
  ["05-22 10:08:33", "10.0.2.88", "陈晨", "删除文件", "/tmp/old.log", "失败", "h8i9j0k1l2m3"],
];

const state = {
  selectedCluster: "panel-sg-01",
  lastRefresh: "2025-05-22 02:15",
  scannedAt: "2025-05-22 10:24:31",
  updateCheck: {
    lastCheckedAt: "2025-05-22 02:15",
    availableUpdates: 2,
    message: "2 个组件可更新",
  },
  nodes: [
    { id: "node-1", name: "panel-sg-01", ip: "10.0.0.11", env: "生产", status: "健康", latency: "38ms", cpu: "18%", memory: "42%", disk: "35%", version: "v2.8.1", uptime: "23 天 14 小时", backup: "今天 02:15", update: "已是最新", owner: "核心集群", services: ["nginx", "postgresql", "redis", "worker"] },
    { id: "node-2", name: "panel-bj-02", ip: "10.0.1.22", env: "预发", status: "健康", latency: "52ms", cpu: "27%", memory: "55%", disk: "62%", version: "v2.8.0", uptime: "18 天 9 小时", backup: "今天 02:20", update: "可更新 1", owner: "发布验证", services: ["nginx", "worker", "systemd-resolved"] },
    { id: "node-3", name: "panel-hk-03", ip: "10.0.2.33", env: "生产", status: "警告", latency: "126ms", cpu: "63%", memory: "78%", disk: "83%", version: "v2.8.0", uptime: "9 天 2 小时", backup: "昨天 02:18", update: "可更新 1", owner: "边缘站点", services: ["nginx", "mysql", "queue"] },
    { id: "node-4", name: "panel-dev-04", ip: "10.0.3.44", env: "开发", status: "维护", latency: "离线", cpu: "0%", memory: "0%", disk: "47%", version: "v2.7.9", uptime: "维护中", backup: "3 天前", update: "待检查", owner: "研发调试", services: ["docker", "node", "cron"] },
  ],
  tasks: [
    { id: "task-1", type: "部署", title: "部署 /api 服务 v2.8.1", target: "panel-sg-01", status: "成功", priority: "中", operator: "李敏", queuedAt: "2 分钟前", duration: "1分24秒", logs: ["拉取 release v2.8.1", "执行健康检查", "发布完成"] },
    { id: "task-2", type: "备份", title: "备份 shop_db", target: "prod-postgres-01", status: "成功", priority: "低", operator: "系统", queuedAt: "8 分钟前", duration: "32秒", logs: ["创建快照", "上传到 S3", "校验成功"] },
    { id: "task-3", type: "补丁", title: "更新防火墙规则", target: "panel-bj-02", status: "运行中", priority: "高", operator: "王工", queuedAt: "15 分钟前", duration: "18秒", logs: ["生成规则差异", "应用 TCP 3306 来源限制"] },
    { id: "task-4", type: "自动化", title: "每日快照", target: "全部生产主机", status: "等待", priority: "中", operator: "系统", queuedAt: "队列 #1", duration: "预计 12 分钟", logs: ["等待前序备份任务释放锁"] },
    { id: "task-5", type: "修复", title: "重启 mysql.service", target: "panel-hk-03", status: "失败", priority: "高", operator: "张工", queuedAt: "31 分钟前", duration: "7秒", logs: ["尝试重启服务", "systemd 返回 failed", "等待人工处理"] },
    { id: "task-6", type: "同步", title: "同步静态文件", target: "admin.example.com", status: "等待", priority: "低", operator: "CI", queuedAt: "队列 #2", duration: "预计 18 分钟", logs: ["等待部署窗口"] },
  ],
  risks: [
    { id: "risk-1", title: "SSH 密钥过期", level: "高危", status: "待处理", target: "panel-sg-01, panel-hk-03", owner: "安全组", impact: "2 台生产主机无法完成密钥轮换", detected: "10 分钟前", suggestion: "立即轮换 deploy key 并重新验证 SSH 登录链路", traceId: "risk-a1b2c3" },
    { id: "risk-2", title: "MySQL 端口暴露到公网", level: "高危", status: "待处理", target: "0.0.0.0/0:3306", owner: "数据库组", impact: "外部来源可探测数据库端口", detected: "18 分钟前", suggestion: "收敛来源到 10.0.12.0/24 并触发防火墙重载", traceId: "risk-b2c3d4" },
    { id: "risk-3", title: "站点证书即将过期", level: "中危", status: "待处理", target: "admin.example.com", owner: "应用组", impact: "4 天后 HTTPS 证书过期", detected: "今天 09:42", suggestion: "执行证书续期并检查 Nginx reload 结果", traceId: "risk-c3d4e5" },
    { id: "risk-4", title: "systemd 服务反复重启", level: "中危", status: "待处理", target: "mysql.service / panel-hk-03", owner: "运维组", impact: "最近 30 分钟重启 6 次", detected: "8 分钟前", suggestion: "查看服务日志，必要时切换只读副本", traceId: "risk-d4e5f6" },
    { id: "risk-5", title: "开发节点备份延迟", level: "低危", status: "已暂缓", target: "panel-dev-04", owner: "研发组", impact: "备份晚于策略 3 天", detected: "昨天 18:11", suggestion: "维护窗口结束后重新开启备份计划", traceId: "risk-e5f6g7" },
  ],
};

function buildResources(tab) {
  const multiplier = tab === "近30天" ? 1.18 : tab === "近7天" ? 1.08 : 1;
  return [
    { label: "CPU 使用率", value: `${Math.round(18 * multiplier)}%`, delta: tab === "今天" ? "+3%" : "+6%", values: [18, 16, 20, 14, 26, 17, 23, 15, 21, 18] },
    { label: "内存使用率", value: `${Math.round(52 * multiplier)}%`, delta: tab === "今天" ? "+4%" : "+7%", values: [42, 48, 45, 52, 47, 55, 48, 52, 49, 57] },
    { label: "磁盘使用率", value: `${Math.round(61 * multiplier)}%`, delta: tab === "今天" ? "+1%" : "+3%", values: [59, 61, 58, 63, 57, 62, 56, 61, 58, 64] },
    { label: "网络流量", value: tab === "今天" ? "1.2 TB" : tab === "近7天" ? "8.9 TB" : "34.6 TB", delta: tab === "今天" ? "+8%" : "+13%", values: [20, 16, 26, 18, 30, 23, 19, 24, 21, 28] },
  ];
}

function selectedNode() {
  return state.nodes.find((node) => node.name === state.selectedCluster) ?? state.nodes[0];
}

function overviewPayload() {
  const node = selectedNode();
  const healthyNodes = state.nodes.filter((item) => item.status === "健康");
  const queuedTasks = state.tasks.filter((task) => ["运行中", "等待"].includes(task.status));
  const openRisks = state.risks.filter((risk) => risk.status === "待处理");
  const failedTasks = state.tasks.filter((task) => task.status === "失败");
  const pendingUpdates = state.nodes.filter((item) => item.update !== "已是最新").length;

  return {
    lastRefresh: state.lastRefresh,
    cluster: {
      current: node?.name ?? "",
      health: node?.status ?? "维护",
      latency: node?.latency ?? "-",
      version: node?.version ?? "-",
      uptime: node?.uptime ?? "-",
      lastBackup: node?.backup ?? state.lastRefresh,
      pendingUpdates,
    },
    metrics: [
      { label: "在线主机", value: String(healthyNodes.length), suffix: `/ ${state.nodes.length}`, delta: `${Math.round((healthyNodes.length / Math.max(state.nodes.length, 1)) * 100)}% 在线`, icon: "server", tone: "blue", line: [14, 20, 17, 24, 22, 31, 27, 29, 25, 30, 27, 29] },
      { label: "网站", value: "48", suffix: "", delta: "12% 较昨日", icon: "globe", tone: "blue", line: [12, 13, 13, 13, 20, 28, 24, 21, 32, 22, 26, 24] },
      { label: "数据库", value: "19", suffix: "", delta: "5% 较昨日", icon: "database", tone: "blue", line: [12, 13, 12, 14, 14, 26, 25, 31, 21, 33, 34, 36] },
      { label: "待执行任务", value: String(queuedTasks.length), suffix: "", delta: `${queuedTasks.length} 队列中`, icon: "calendar", tone: "gray", line: [26, 31, 24, 16, 22, 28, 36, 18, 34, 25, 16, 12] },
      { label: "风险项", value: String(openRisks.length), suffix: "", delta: `${openRisks.filter((risk) => risk.level === "高危").length} 高危`, icon: "shield", tone: "orange", line: [10, 20, 21, 35, 16, 25, 22, 27, 23, 12, 12, 12] },
      { label: "今日告警", value: String(failedTasks.length), suffix: "", delta: `${failedTasks.length} 失败任务`, icon: "bell", tone: failedTasks.length ? "red" : "blue", line: [14, 28, 16, 34, 20, 27, 35, 30, 24, 18, 46, 14] },
    ],
    nodes: state.nodes,
    tasks: state.tasks,
    audits: auditRows,
    risks: state.risks,
    resources: {
      今天: buildResources("今天"),
      "近7天": buildResources("近7天"),
      "近30天": buildResources("近30天"),
    },
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("请求体必须是合法 JSON");
    error.statusCode = 400;
    throw error;
  }
}

function patchById(collection, id, patch) {
  const index = collection.findIndex((item) => item.id === id);
  if (index === -1) return null;
  collection[index] = { ...collection[index], ...patch, id };
  return collection[index];
}

function createNode(payload = {}) {
  const id = makeId("node");
  const node = {
    id,
    name: payload.name ?? `panel-new-${state.nodes.length + 1}`,
    ip: payload.ip ?? `10.0.9.${state.nodes.length + 10}`,
    env: payload.env ?? "生产",
    status: payload.status ?? "健康",
    latency: payload.latency ?? "44ms",
    cpu: payload.cpu ?? "11%",
    memory: payload.memory ?? "31%",
    disk: payload.disk ?? "24%",
    version: payload.version ?? "v2.8.1",
    uptime: payload.uptime ?? "刚刚接入",
    backup: payload.backup ?? state.lastRefresh,
    update: payload.update ?? "已是最新",
    owner: payload.owner ?? "未分配",
    services: payload.services ?? ["nginx", "worker"],
  };
  state.nodes.unshift(node);
  state.selectedCluster = node.name;
  return node;
}

function createTask(payload = {}) {
  const task = {
    id: payload.id ?? makeId("task"),
    type: payload.type ?? "巡检",
    title: payload.title ?? "手动触发集群巡检",
    target: payload.target ?? "全部主机",
    status: payload.status ?? "运行中",
    priority: payload.priority ?? "中",
    operator: payload.operator ?? "管理员",
    queuedAt: payload.queuedAt ?? "刚刚",
    duration: payload.duration ?? "运行中",
    logs: payload.logs ?? ["创建巡检任务", "正在采集节点状态"],
  };
  state.tasks.unshift(task);
  return task;
}

function createRisk(payload = {}) {
  const risk = {
    id: payload.id ?? makeId("risk"),
    title: payload.title ?? "新风险项",
    level: payload.level ?? "中危",
    status: payload.status ?? "待处理",
    target: payload.target ?? "未指定对象",
    owner: payload.owner ?? "安全组",
    impact: payload.impact ?? "等待后续评估",
    detected: payload.detected ?? "刚刚",
    suggestion: payload.suggestion ?? "查看详情并制定处理方案",
    traceId: payload.traceId ?? makeId("risk-trace"),
  };
  state.risks.unshift(risk);
  return risk;
}

function sendRecordOr404(response, key, record, message = "记录不存在") {
  if (!record) {
    sendError(response, 404, message);
    return false;
  }
  sendJson(response, 200, record);
  return true;
}

async function handleOverviewRoute(request, response, parts) {
  if (request.method === "GET" && parts.length === 2) {
    sendJson(response, 200, overviewPayload());
    return;
  }

  if (request.method === "POST" && parts[2] === "refresh" && parts.length === 3) {
    state.lastRefresh = nowTime();
    sendJson(response, 200, overviewPayload());
    return;
  }

  if (request.method === "POST" && parts[2] === "cluster" && parts.length === 3) {
    const payload = await readJson(request);
    const node = state.nodes.find((item) => item.name === payload.cluster);
    if (!node) {
      sendError(response, 404, "集群节点不存在");
      return;
    }
    state.selectedCluster = node.name;
    sendJson(response, 200, overviewPayload());
    return;
  }

  if (request.method === "POST" && parts[2] === "check-updates" && parts.length === 3) {
    state.updateCheck = {
      lastCheckedAt: nowTime(),
      availableUpdates: state.nodes.filter((node) => node.update !== "已是最新").length,
      message: "检查完成",
    };
    sendJson(response, 200, {
      message: `检查完成：${state.updateCheck.availableUpdates} 个组件可更新`,
      tone: state.updateCheck.availableUpdates ? "warning" : "success",
      overview: overviewPayload(),
    });
    return;
  }

  sendError(response, 404, "总览接口不存在");
}

async function handleHealthRoute(request, response, parts) {
  if (request.method === "GET" && parts.length === 3) {
    sendJson(response, 200, { nodes: state.nodes, lastRefresh: state.lastRefresh });
    return;
  }

  if (request.method === "POST" && parts[3] === "refresh" && parts.length === 4) {
    state.lastRefresh = nowTime();
    sendJson(response, 200, { nodes: state.nodes, lastRefresh: state.lastRefresh });
    return;
  }

  if (request.method === "POST" && parts[3] === "nodes" && parts.length === 4) {
    createNode(await readJson(request));
    sendJson(response, 201, {
      nodes: state.nodes,
      lastRefresh: state.lastRefresh,
      message: "新增节点已接入",
      tone: "info",
    });
    return;
  }

  if (request.method === "PATCH" && parts[3] === "nodes" && parts.length === 5) {
    const node = patchById(state.nodes, parts[4], await readJson(request));
    sendRecordOr404(response, "node", node ? { node, message: `${node.name} 已更新` } : null);
    return;
  }

  if (request.method === "POST" && parts[3] === "nodes" && parts[5] === "restart" && parts.length === 6) {
    const node = state.nodes.find((item) => item.id === parts[4]);
    if (!node) {
      sendError(response, 404, "节点不存在");
      return;
    }
    node.uptime = "刚刚重启";
    sendJson(response, 200, { message: `${node.name} 服务已重启`, tone: "info" });
    return;
  }

  sendError(response, 404, "集群状态接口不存在");
}

async function handleTasksRoute(request, response, parts) {
  if (request.method === "GET" && parts.length === 3) {
    sendJson(response, 200, { tasks: state.tasks });
    return;
  }

  if (request.method === "POST" && parts.length === 3) {
    createTask(await readJson(request));
    sendJson(response, 201, { tasks: state.tasks, message: "已创建巡检任务", tone: "info" });
    return;
  }

  if (request.method === "POST" && parts[3] === "export" && parts.length === 4) {
    sendJson(response, 200, { message: "已复制当前任务流摘要", tone: "info" });
    return;
  }

  if (request.method === "PATCH" && parts.length === 4) {
    const task = patchById(state.tasks, parts[3], await readJson(request));
    sendRecordOr404(response, "task", task ? { task, message: `${task.title} 已更新` } : null);
    return;
  }

  sendError(response, 404, "任务流接口不存在");
}

async function handleRisksRoute(request, response, parts) {
  if (request.method === "GET" && parts.length === 3) {
    sendJson(response, 200, { risks: state.risks, scannedAt: state.scannedAt });
    return;
  }

  if (request.method === "POST" && parts.length === 3) {
    createRisk(await readJson(request));
    sendJson(response, 201, { risks: state.risks, scannedAt: state.scannedAt, message: "风险已创建", tone: "info" });
    return;
  }

  if (request.method === "POST" && parts[3] === "scan" && parts.length === 4) {
    state.scannedAt = nowTime();
    sendJson(response, 200, { risks: state.risks, scannedAt: state.scannedAt, message: "已触发风险重新扫描", tone: "info" });
    return;
  }

  if (request.method === "POST" && parts[3] === "export" && parts.length === 4) {
    sendJson(response, 200, { message: "风险报告已导出", tone: "info" });
    return;
  }

  if (request.method === "PATCH" && parts.length === 4) {
    const risk = patchById(state.risks, parts[3], await readJson(request));
    sendRecordOr404(response, "risk", risk ? { risk, message: `${risk.title} 已更新` } : null);
    return;
  }

  sendError(response, 404, "风险中心接口不存在");
}

async function handleRequest(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/healthz") {
    sendJson(response, 200, { ok: true, service: "stackpilot-api", time: nowTime() });
    return;
  }

  if (parts[0] !== "api" || parts[1] !== "overview") {
    sendError(response, 404, "接口不存在");
    return;
  }

  if (parts[2] === "health") {
    await handleHealthRoute(request, response, parts);
    return;
  }

  if (parts[2] === "tasks") {
    await handleTasksRoute(request, response, parts);
    return;
  }

  if (parts[2] === "risks") {
    await handleRisksRoute(request, response, parts);
    return;
  }

  await handleOverviewRoute(request, response, parts);
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    sendError(response, error.statusCode ?? 500, error.message || "服务内部错误");
  });
});

server.listen(port, host, () => {
  console.log(`StackPilot API listening on http://${host}:${port}`);
});
