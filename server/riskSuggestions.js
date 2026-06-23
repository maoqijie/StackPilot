const fallbackSteps = [
  "定位：确认风险来源、目标服务和最近一次扫描时间，避免把旧状态当成当前问题。",
  "处置：只处理当前风险对应的进程、目录或配置，不合并无关变更。",
  "复验：处理后重新扫描风险中心，确认同一风险项消失或降级。",
];

const suggestionSteps = {
  cpuCritical: (context) => [
    `定位：在 ${context.target} 执行 ps -axo pid,pcpu,pmem,comm -r | head，按 CPU 排序确认持续高占用进程。`,
    "处置：如果高占用来自 build、Playwright、Vite 或重复扫描任务，先停止非当前验收必需的进程，保留 API 与前端 dev server。",
    "复验：间隔 1 分钟重新扫描两次，CPU 都低于 70% 后再继续发布、构建或批量页面验收。",
  ],
  cpuWarning: (context) => [
    `定位：当前 CPU 为 ${context.percent}，先确认是否是构建、测试、浏览器截图或开发服务器短时拉高。`,
    "处置：若 5 分钟后仍高于 70%，按进程排序关闭无关任务，避免同时跑 build、截图和多页面扫描。",
    "复验：重新扫描风险中心，确认 CPU 回落且页面交互没有明显卡顿。",
  ],
  memoryCritical: (context) => [
    `定位：在 ${context.target} 执行 ps -axo pid,rss,pmem,comm -m | head，重点看 Chrome、Playwright、Node/Vite 和长驻服务。`,
    "处置：关闭旧浏览器标签、过期 Playwright 会话和不再使用的 Node 进程，保留当前 StackPilot API 与 dev server。",
    "复验：重新扫描后确认内存低于 76%；否则先释放内存再跑 build、截图或批量页面验收。",
  ],
  memoryWarning: (context) => [
    `定位：当前内存为 ${context.percent}，先检查是否存在旧浏览器验收窗口、Playwright 进程或多余终端服务。`,
    "处置：只保留当前验证窗口和必要服务，暂停会额外占用内存的批量截图、构建或导出任务。",
    "复验：重新扫描并观察 3-5 分钟，确认内存压力不再持续上升。",
  ],
  diskCritical: (context) => [
    `定位：仓库所在卷使用率 ${context.percent}，先执行 du -sh output dist .playwright-cli node_modules 2>/dev/null 定位可重建占用。`,
    "处置：优先清理 dist、旧截图、临时 Playwright 产物和过期导出包；不要删除源码、配置、未提交文件或当前验收证据。",
    "复验：释放空间后重新扫描，并确认 build、export 仍能写入 output 目录。",
  ],
  diskWarning: (context) => [
    `定位：仓库所在卷使用率 ${context.percent}，先盘点 output、artifacts、dist 和依赖缓存最近是否异常增长。`,
    "处置：归档或删除已确认无用的截图、导出 JSON、旧构建产物，保留当前任务证据和未提交源码。",
    "复验：重新扫描后确认磁盘趋势稳定，再继续大文件导出或批量截图。",
  ],
  gitDirty: (context) => [
    `定位：执行 git status --short，逐项核对 ${context.count} 个变更属于当前任务、历史遗留还是本地验证产物。`,
    "处置：源码变更跑 npm run lint 和 npm run build；临时目录加入忽略或保留在工作区，不要混入提交。",
    "复验：提交前再看 git diff --stat 和 git status --short，确认提交范围只包含本次风险中心修复。",
  ],
  gitBehind: (context) => [
    `定位：当前分支 ${context.branch} 落后远端 ${context.behind} 个提交，先确认本地工作区是否干净。`,
    "处置：合并远端更新前记录当前页面验证结果；合并时保留本地修复和远端更新，不做 rebase。",
    "复验：合并后重新运行 lint/build 和风险中心页面检查，再继续交付。",
  ],
  apiLatency: (context) => [
    `定位：检查 API 健康探测目标 ${context.target}，确认 server/index.js 进程监听 8787 且 /healthz 返回 200。`,
    "处置：如果只有前端可访问但 API 不健康，先重启 API 服务，再刷新风险中心；不要仅凭页面打开判断后端已恢复。",
    "复验：重新扫描后确认延迟恢复为健康，并检查依赖真实后端数据的页面能正常刷新。",
  ],
  backup: (context) => [
    `定位：当前备份状态为 ${context.detail}，确认 STACKPILOT_BACKUP_DIRS 是否指向真实备份目录。`,
    "处置：目录不存在就补配置并重启 API；目录存在但没有近期文件就补跑备份任务或检查落盘权限。",
    "复验：最近备份时间进入 48 小时内，且风险中心不再提示备份缺失。",
  ],
  service: (context) => [
    `定位：检查 ${context.name} 的目标 ${context.target}，确认监听进程、端口和 HTTP 健康探测结果。`,
    `处置：当前详情是 ${context.detail}；未监听就启动对应服务，HTTP 异常就先看服务日志和端口占用。`,
    "复验：服务恢复后重新扫描风险中心，并确认集群状态页对应节点回到健康。",
  ],
  scripts: () => [
    "定位：检查 package.json 是否同时包含 lint 与 build 脚本，并确认命令能在本机稳定执行。",
    "处置：补齐缺失脚本，把 TypeScript 编译、Vite 构建或 ESLint 纳入统一验证路径。",
    "复验：提交前至少运行 npm run lint 和 npm run build，避免页面改动只能靠人工截图判断。",
  ],
};

export function riskSuggestion(kind, context = {}) {
  return (suggestionSteps[kind]?.(context) ?? fallbackSteps).join("\n");
}
