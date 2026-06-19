import { createServer } from "node:http";
import { URL } from "node:url";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

const nowTime = () => new Date().toLocaleString("zh-CN", { hour12: false });
const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const state = {
  lastRefresh: "2025-05-22 02:15",
  updateCheck: {
    lastCheckedAt: "2025-05-22 02:15",
    availableUpdates: 2,
    message: "2 个组件可更新",
  },
  healthNodes: [
    { id: "node-1", name: "demo-sg-01", ip: "10.0.0.11", env: "生产", status: "健康", latency: "38ms", cpu: "18%", memory: "42%", disk: "35%", version: "v2.8.1", uptime: "23 天 14 小时", backup: "今天 02:15", update: "已是最新", owner: "核心集群", services: ["nginx", "postgresql", "redis", "worker"] },
    { id: "node-2", name: "panel-bj-02", ip: "10.0.1.22", env: "预发", status: "健康", latency: "52ms", cpu: "27%", memory: "55%", disk: "62%", version: "v2.8.0", uptime: "18 天 9 小时", backup: "今天 02:20", update: "可更新 1", owner: "发布验证", services: ["nginx", "worker", "systemd-resolved"] },
    { id: "node-3", name: "panel-hk-03", ip: "10.0.2.33", env: "生产", status: "警告", latency: "126ms", cpu: "63%", memory: "78%", disk: "83%", version: "v2.8.0", uptime: "9 天 2 小时", backup: "昨天 02:18", update: "可更新 1", owner: "边缘站点", services: ["nginx", "mysql", "queue"] },
    { id: "node-4", name: "panel-dev-04", ip: "10.0.3.44", env: "开发", status: "维护", latency: "离线", cpu: "0%", memory: "0%", disk: "47%", version: "v2.7.9", uptime: "维护中", backup: "3 天前", update: "待检查", owner: "研发调试", services: ["docker", "node", "cron"] },
  ],
  tasks: [
    { id: "task-1", type: "部署", title: "部署 /api 服务 v2.8.1", target: "demo-sg-01", status: "成功", priority: "中", operator: "李敏", queuedAt: "2 分钟前", duration: "1分24秒", logs: ["拉取 release v2.8.1", "执行健康检查", "发布完成"] },
    { id: "task-2", type: "备份", title: "备份 shop_db", target: "prod-postgres-01", status: "成功", priority: "低", operator: "系统", queuedAt: "8 分钟前", duration: "32秒", logs: ["创建快照", "上传到 S3", "校验成功"] },
    { id: "task-3", type: "补丁", title: "更新防火墙规则", target: "panel-bj-02", status: "运行中", priority: "高", operator: "王工", queuedAt: "15 分钟前", duration: "18秒", logs: ["生成规则差异", "应用 TCP 3306 来源限制"] },
    { id: "task-4", type: "自动化", title: "每日快照", target: "全部生产主机", status: "等待", priority: "中", operator: "系统", queuedAt: "队列 #1", duration: "预计 12 分钟", logs: ["等待前序备份任务释放锁"] },
    { id: "task-5", type: "修复", title: "重启 mysql.service", target: "panel-hk-03", status: "失败", priority: "高", operator: "张工", queuedAt: "31 分钟前", duration: "7秒", logs: ["尝试重启服务", "systemd 返回 failed", "等待人工处理"] },
    { id: "task-6", type: "同步", title: "同步静态文件", target: "admin.example.com", status: "等待", priority: "低", operator: "CI", queuedAt: "队列 #2", duration: "预计 18 分钟", logs: ["等待部署窗口"] },
  ],
  risks: [
    { id: "risk-1", title: "SSH 密钥过期", level: "高危", status: "待处理", target: "demo-sg-01, panel-hk-03", owner: "安全组", impact: "2 台生产主机无法完成密钥轮换", detected: "10 分钟前", suggestion: "立即轮换 deploy key 并重新验证 SSH 登录链路", traceId: "risk-a1b2c3" },
    { id: "risk-2", title: "MySQL 端口暴露到公网", level: "高危", status: "待处理", target: "0.0.0.0/0:3306", owner: "数据库组", impact: "外部来源可探测数据库端口", detected: "18 分钟前", suggestion: "收敛来源到 10.0.12.0/24 并触发防火墙重载", traceId: "risk-b2c3d4" },
    { id: "risk-3", title: "站点证书即将过期", level: "中危", status: "待处理", target: "admin.example.com", owner: "应用组", impact: "4 天后 HTTPS 证书过期", detected: "今天 09:42", suggestion: "执行证书续期并检查 Nginx reload 结果", traceId: "risk-c3d4e5" },
    { id: "risk-4", title: "systemd 服务反复重启", level: "中危", status: "待处理", target: "mysql.service / panel-hk-03", owner: "运维组", impact: "最近 30 分钟重启 6 次", detected: "8 分钟前", suggestion: "查看服务日志，必要时切换只读副本", traceId: "risk-d4e5f6" },
    { id: "risk-5", title: "开发节点备份延迟", level: "低危", status: "已暂缓", target: "panel-dev-04", owner: "研发组", impact: "备份晚于策略 3 天", detected: "昨天 18:11", suggestion: "维护窗口结束后重新开启备份计划", traceId: "risk-e5f6g7" },
  ],
};

function overviewPayload() {
  const openRisks = state.risks.filter((risk) => risk.status === "待处理");
  const queuedTasks = state.tasks.filter((task) => ["运行中", "等待"].includes(task.status));
  const healthyNodes = state.healthNodes.filter((node) => node.status === "健康");

  return {
    lastRefresh: state.lastRefresh,
    updateCheck: state.updateCheck,
    cluster: {
      current: state.healthNodes[0]?.name ?? "",
      status: openRisks.some((risk) => risk.level === "高危") ? "警告" : "健康",
      latency: state.healthNodes[0]?.latency ?? "-",
      version: state.healthNodes[0]?.version ?? "-",
      uptime: state.healthNodes[0]?.uptime ?? "-",
      pendingUpdates: state.healthNodes.filter((node) => node.update !== "已是最新").length,
    },
    metrics: [
      { label: "在线主机", value: String(healthyNodes.length), suffix: `/ ${state.healthNodes.length}`, delta: `${Math.round((healthyNodes.length / state.healthNodes.length) * 100)}% 在线`, tone: "blue", line: [14, 20, 17, 24, 22, 31, 27, 29, 25, 30, 27, 29] },
      { label: "待执行任务", value: String(queuedTasks.length), suffix: "", delta: `${queuedTasks.length} 队列中`, tone: "gray", line: [26, 31, 24, 16, 22, 28, 36, 18, 34, 25, 16, 12] },
      { label: "风险项", value: String(openRisks.length), suffix: "", delta: `${openRisks.filter((risk) => risk.level === "高危").length} 高危`, tone: "orange", line: [10, 20, 21, 35, 16, 25, 22, 27, 23, 12, 12, 12] },
    ],
    healthNodes: state.healthNodes,
    tasks: state.tasks,
    risks: state.risks,
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

function upsert(collection, prefix, payload) {
  const record = { id: payload.id ?? makeId(prefix), ...payload };
  const index = collection.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    collection[index] = { ...collection[index], ...record };
    return collection[index];
  }
  collection.unshift(record);
  return record;
}

function patchById(collection, id, patch) {
  const index = collection.findIndex((item) => item.id === id);
  if (index === -1) return null;
  collection[index] = { ...collection[index], ...patch, id };
  return collection[index];
}

function listResource(name) {
  if (name === "tasks") return state.tasks;
  if (name === "health") return state.healthNodes;
  if (name === "risks") return state.risks;
  return null;
}

function prefixFor(name) {
  if (name === "tasks") return "task";
  if (name === "health") return "node";
  return "risk";
}

function validateCreate(name, payload) {
  if (name === "tasks" && !payload.title) return "任务 title 不能为空";
  if (name === "health" && (!payload.name || !payload.ip)) return "健康节点 name 和 ip 不能为空";
  if (name === "risks" && !payload.title) return "风险 title 不能为空";
  return null;
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

  if (request.method === "GET" && parts.length === 2) {
    sendJson(response, 200, overviewPayload());
    return;
  }

  if (request.method === "POST" && parts[2] === "refresh" && parts.length === 3) {
    state.lastRefresh = nowTime();
    sendJson(response, 200, overviewPayload());
    return;
  }

  if (request.method === "POST" && parts[2] === "check-updates" && parts.length === 3) {
    state.updateCheck = {
      lastCheckedAt: nowTime(),
      availableUpdates: state.healthNodes.filter((node) => node.update !== "已是最新").length,
      message: "检查完成",
    };
    sendJson(response, 200, state.updateCheck);
    return;
  }

  const resourceName = parts[2];
  const collection = listResource(resourceName);
  if (!collection) {
    sendError(response, 404, "资源不存在");
    return;
  }

  if (request.method === "GET" && parts.length === 3) {
    sendJson(response, 200, collection);
    return;
  }

  if (request.method === "POST" && parts.length === 3) {
    const payload = await readJson(request);
    const validationError = validateCreate(resourceName, payload);
    if (validationError) {
      sendError(response, 400, validationError);
      return;
    }
    sendJson(response, 201, upsert(collection, prefixFor(resourceName), payload));
    return;
  }

  if (request.method === "PATCH" && parts.length === 4) {
    const patched = patchById(collection, parts[3], await readJson(request));
    if (!patched) {
      sendError(response, 404, "记录不存在");
      return;
    }
    sendJson(response, 200, patched);
    return;
  }

  sendError(response, 405, "方法不支持");
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    sendError(response, error.statusCode ?? 500, error.message || "服务内部错误");
  });
});

server.listen(port, host, () => {
  console.log(`StackPilot API listening on http://${host}:${port}`);
});
