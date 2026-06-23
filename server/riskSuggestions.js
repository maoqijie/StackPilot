const fallbackSteps = [
  "定位：确认风险来源、目标服务和最近一次扫描时间，避免把旧状态当成当前问题。",
  "处置：只处理当前风险对应的进程、目录或配置，不合并无关变更。",
  "复验：处理后重新扫描风险中心，确认同一风险项消失或降级。",
];

function valueList(evidence, label) {
  return evidence.filter((item) => item.label === label).map((item) => item.value);
}

function firstValue(evidence, label, fallback = "暂无明细") {
  return valueList(evidence, label)[0] ?? fallback;
}

function topValues(evidence, label, count = 2) {
  return valueList(evidence, label).slice(0, count).join("；") || "暂无明细";
}

const suggestionSteps = {
  cpuCritical: ({ percent, evidence }) => [
    `定位：当前 CPU ${percent}，采样最高进程是 ${topValues(evidence, "高 CPU 进程")}。`,
    "处置：优先暂停上面列出的非必要构建、浏览器验收或重复扫描进程；如果是 StackPilot API/Vite，先确认是否正在服务当前验收再决定是否重启。",
    "复验：重新扫描两次，CPU 都低于 70% 且最高进程不再持续占用后，再继续发布、构建或批量截图。",
  ],
  cpuWarning: ({ percent, evidence }) => [
    `定位：当前 CPU ${percent}，先看最高进程：${topValues(evidence, "高 CPU 进程")}。`,
    "处置：如果高占用来自短时构建或截图任务，等待任务结束；如果同一 PID 持续 5 分钟以上，再关闭无关任务。",
    "复验：重新扫描后确认 CPU 回落，并检查页面交互没有明显卡顿。",
  ],
  memoryCritical: ({ percent, evidence }) => [
    `定位：当前内存 ${percent}，采样最高内存进程是 ${topValues(evidence, "高内存进程")}。`,
    "处置：关闭上面列出的旧浏览器标签、过期 Playwright 会话或不再使用的 Node 进程；保留当前 API 与 dev server。",
    "复验：重新扫描后确认内存低于 76%；否则先释放内存再跑 build、截图或批量页面验收。",
  ],
  memoryWarning: ({ percent, evidence }) => [
    `定位：当前内存 ${percent}，优先核对 ${topValues(evidence, "高内存进程")} 是否属于当前任务。`,
    "处置：只保留当前验证窗口和必要服务，暂停会额外占内存的批量截图、构建或导出任务。",
    "复验：重新扫描并观察 3-5 分钟，确认内存压力不再持续上升。",
  ],
  diskCritical: ({ percent, evidence }) => [
    `定位：仓库卷使用率 ${percent}，当前主要占用是 ${topValues(evidence, "目录占用", 4)}。`,
    "处置：优先清理可重建目录中的旧截图、dist、临时 Playwright 产物或过期导出包；不要删除源码、配置、未提交文件。",
    "复验：释放空间后重新扫描，并确认 build、export 仍能写入 output 目录。",
  ],
  diskWarning: ({ percent, evidence }) => [
    `定位：仓库卷使用率 ${percent}，先核对目录占用：${topValues(evidence, "目录占用", 4)}。`,
    "处置：归档或删除已确认无用的截图、导出 JSON、旧构建产物，保留当前验收证据和未提交源码。",
    "复验：重新扫描后确认磁盘趋势稳定，再继续大文件导出或批量截图。",
  ],
  gitDirty: ({ count, evidence }) => [
    `定位：当前有 ${count} 个工作区变更，示例文件是 ${topValues(evidence, "变更文件", 4)}。`,
    "处置：只提交当前任务相关源码和样式；对 output、dist、node_modules、.playwright-cli 这类产物保持忽略或留在工作区外。",
    "复验：提交前检查 git diff --stat 和 git status --short，确认范围只包含本次修复。",
  ],
  gitBehind: ({ branch, behind }) => [
    `定位：当前分支 ${branch} 落后远端 ${behind} 个提交，先确认本地工作区是否干净。`,
    "处置：合并远端更新前记录当前页面验证结果；合并时保留本地修复和远端更新，不做 rebase。",
    "复验：合并后重新运行 lint/build 和风险中心页面检查，再继续交付。",
  ],
  apiLatency: ({ evidence }) => [
    `定位：API 探测结果是 ${firstValue(evidence, "健康探测")}，目标是 ${firstValue(evidence, "目标")}。`,
    "处置：如果未监听就启动 npm run api；如果 HTTP 异常，先看 server/index.js 进程日志和 8787 端口占用。",
    "复验：/healthz 返回 200 后重新扫描风险中心，并确认真实后端数据页面能刷新。",
  ],
  backup: ({ evidence }) => [
    `定位：备份目录检查结果是 ${topValues(evidence, "备份目录", 4)}。`,
    "处置：不存在的目录先补配置或创建；存在但没有近期文件时，补跑备份任务并检查落盘权限。",
    "复验：最近备份时间进入 48 小时内，且风险中心不再提示备份缺失。",
  ],
  service: ({ evidence }) => [
    `定位：服务探测结果是 ${firstValue(evidence, "健康探测")}，目标是 ${firstValue(evidence, "目标")}。`,
    `处置：若监听进程为 ${firstValue(evidence, "监听进程", "未发现监听进程")}，先确认该进程是否为预期服务；未监听就启动对应服务，HTTP 异常就查日志。`,
    "复验：服务恢复后重新扫描风险中心，并确认集群状态页对应节点回到健康。",
  ],
  scripts: () => [
    "定位：检查 package.json 是否同时包含 lint 与 build 脚本，并确认命令能在本机稳定执行。",
    "处置：补齐缺失脚本，把 TypeScript 编译、Vite 构建或 ESLint 纳入统一验证路径。",
    "复验：提交前至少运行 npm run lint 和 npm run build，避免页面改动只能靠人工截图判断。",
  ],
};

export function riskSuggestion(kind, context = {}) {
  return (suggestionSteps[kind]?.({ ...context, evidence: context.evidence ?? [] }) ?? fallbackSteps).join("\n");
}
