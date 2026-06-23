# StackPilot 帮助中心

StackPilot 是面向自托管服务器运维的控制台。本文档记录当前版本可用入口和本地排障方式。

## 本地访问

- 前端预览：`http://127.0.0.1:4873/`
- 集群状态：`http://127.0.0.1:4873/#overview-health`
- 后端健康检查：`http://127.0.0.1:8787/healthz`

## 集群状态

集群状态页通过 `/api/overview/health` 读取本机采集结果，展示节点名称、IP、环境、CPU、内存、更新状态和服务实例。

如果页面出现请求失败，先确认后端正在监听：

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
curl -i "http://127.0.0.1:8787/healthz"
curl -i "http://127.0.0.1:4873/api/overview/health"
```

## 常用验证

```bash
npm run lint
npm run build
npm audit --audit-level=high
```

## 反馈与问题

如果遇到功能问题、交互问题或文档缺口，请到 GitHub Issues 提交反馈：

https://github.com/maoqijie/StackPilot/issues
