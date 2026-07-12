# StackPilot 帮助中心

StackPilot 是面向自托管服务器运维的控制台。本文档记录当前版本可用入口和本地排障方式。

从仓库根目录运行 `npm run dev` 会同时启动 `apps/controller` 和 `apps/web`。也可分别执行 `npm run dev:controller` 与 `npm run dev:web`。

## 本地访问

- 前端开发服务器：`http://127.0.0.1:5173/`
- 集群状态：`http://127.0.0.1:5173/#overview-health`
- 后端健康检查：`http://127.0.0.1:8787/healthz`
- Agent HTTPS API：默认关闭；配置本地证书后为 `https://127.0.0.1:9443/healthz`

## 集群状态

集群状态页通过 `/api/overview/health` 聚合 Controller 本机和当前用户节点范围内的 Agent。新版 Agent 会随心跳上报 CPU、内存、负载、全部磁盘卷、主 IP 与运行时间；未采集的备份、服务和更新状态显示为“暂不可用”，旧版 Agent 在升级前显示为“等待遥测”。

如果页面出现请求失败，先确认后端正在监听：

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
curl -i "http://127.0.0.1:8787/healthz"
curl -i "http://127.0.0.1:5173/api/overview/health"
curl -i "http://127.0.0.1:5173/api/hosts"
```

Agent 排障先确认 Controller显式配置了 TLS 证书和私钥，Agent URL 使用 `https://`，且 Agent显式信任正确 CA/开发证书。不要通过关闭 TLS 验证解决证书错误。注册 Token 一次使用后失效；节点撤销后必须由管理员创建新的 enrollment，不能复用旧身份。

## 常用验证

```bash
npm run lint
npm test
npm run build
npm audit --audit-level=high
```

## 反馈与问题

如果遇到功能问题、交互问题或文档缺口，请到 GitHub Issues 提交反馈：

https://github.com/maoqijie/StackPilot/issues
