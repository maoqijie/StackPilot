# StackPilot

StackPilot 是面向新手站长的开源自托管多服务器总控台。当前仓库已落地前端 MVP 原型，前端参考 1Panel 的现代控制台结构，吸收宝塔的高频操作直达习惯和 MCSM 的多节点状态/日志反馈模型，但不复刻任何项目的视觉资产或品牌。

## 当前前端范围

- 总览：服务器健康摘要、服务器列表、待处理事项、最近审计。
- 服务器：Agent 安装命令、节点状态、资源占用、常用操作入口。
- 服务：systemd 服务列表、端口、健康状态、日志入口和 start/restart/stop 操作入口。
- 防火墙：ufw 规则查看、新增表单、表单校验、高风险标识和启停/删除入口。
- 发布：GitHub/GitLab 项目发布列表、阶段进度、失败原因、日志、重试和回滚入口。
- 审计日志：关键操作筛选、来源信息和详情追踪。
- 设置：中心地址、token 策略、主题偏好、通知偏好、安全配置和保存反馈。

## 本地运行

```bash
npm install
npm run dev
```

## 验证

```bash
npm run lint
npm run build
npm audit --audit-level=high
```
