# StackPilot

StackPilot 是面向新手站长的开源自托管多服务器总控台。当前仓库已落地前端控制台实现，前端参考 1Panel 的现代控制台结构，吸收宝塔的高频操作直达习惯和 MCSM 的多节点状态/日志反馈模型，但不复刻任何项目的视觉资产或品牌。

## 当前前端范围

- 总览：服务器健康摘要、服务器列表、待处理事项、最近审计。
- 服务器：Agent 安装命令、节点状态、资源占用、常用操作入口。
- 服务：systemd 服务列表、端口、健康状态、日志入口和 start/restart/stop 操作入口。
- 防火墙：ufw 规则查看、新增表单、表单校验、高风险标识和启停/删除入口。
- 发布：GitHub/GitLab 项目发布列表、阶段进度、失败原因、日志、重试和回滚入口。
- 审计日志：关键操作筛选、来源信息和详情追踪。
- 设置：中心地址、token 策略、主题偏好、通知偏好、安全配置和保存反馈。

## 本地运行

要求 Node.js 20 或更高版本。安装依赖后，在两个终端中分别启动 API 和前端：

PowerShell：

```powershell
npm install
$env:STACKPILOT_API_TOKEN = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npm run api
```

```powershell
npm run dev
```

前端默认访问 `http://127.0.0.1:5173`，API 默认监听 `http://127.0.0.1:8787`。`npm run dev` 和 `npm run preview` 都只绑定 `127.0.0.1`。确实需要局域网访问开发前端时，必须显式执行：

```bash
npm run dev -- --host 0.0.0.0
```

这只改变前端监听地址，不会放宽 API 认证、CORS 或危险能力开关。公开监听前应先配置防火墙和精确来源白名单。

## 安全配置

`.env.example` 是配置参考，不包含可用令牌。当前 API 直接读取启动进程的环境变量，不会自动加载 `.env` 文件。不要使用 `VITE_` 前缀保存服务端令牌，因为该前缀会把值暴露给浏览器构建。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | API 监听地址；监听地址不参与身份认证。 |
| `PORT` | `8787` | API 端口。 |
| `STACKPILOT_API_TOKEN` | 未配置 | 所有 `POST`、`PATCH`、`DELETE` 的 Bearer Token。未配置时写操作关闭。 |
| `STACKPILOT_ALLOWED_ORIGINS` | 本机 `5173`/`4173` 的 `localhost` 与 `127.0.0.1` 来源 | 逗号分隔的精确 HTTP(S) 来源；不允许 `*` 或带路径的 URL。设为空字符串可禁止所有跨域来源。 |
| `STACKPILOT_JSON_BODY_LIMIT_BYTES` | `65536` | JSON 请求体字节上限，超限返回 `413`。 |
| `STACKPILOT_ENABLE_CRONTAB_WRITE` | `0` | 危险开关；只有精确设置为 `1` 才允许 crontab 写入、修改、删除和立即执行。 |

所有写请求都必须显式发送请求头：

```text
Authorization: Bearer <STACKPILOT_API_TOKEN>
```

令牌不会写入前端源码、浏览器存储、日志或 Vite 代理配置。现有前端的只读页面可以正常加载；需要写操作的按钮在未提供服务端凭据时会收到 `401`/`503`，不能作为权限边界。Vite `/api` 代理不会自动添加令牌，因此不能绕过服务端认证。

服务端不使用 `Origin`、客户端 IP、监听地址、`Host` 或客户端直接提供的 `X-Forwarded-*` 头判断身份。当前阶段也不信任反向代理传递的客户端地址；生产可信代理模型属于后续部署步骤。

## 危险能力开关

即使 Bearer Token 正确，crontab 创建、修改、删除和立即执行默认仍返回 `403`。只有在理解任意计划命令及立即执行可获得当前 API 进程用户权限后，才应在 API 进程环境中设置：

```powershell
$env:STACKPILOT_ENABLE_CRONTAB_WRITE = "1"
npm run api
```

认证令牌和危险开关是两道独立的服务端检查；前端隐藏或禁用按钮不能替代它们。

## 验证

```bash
npm run lint
npm run build
npm test
npm audit --audit-level=high
```
