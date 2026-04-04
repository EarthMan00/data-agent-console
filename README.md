# More Data Agent 前端 Demo

## 这是什么

这是 `取数 Agent Console` 的前端演示工程，目标是用 `Next.js` 做一个可本地运行的 `More Data Agent` 产品 Demo。当前重点是验证：

- 保留现有成熟业务表达下的产品交互闭环
- 在现有骨架上完成 `More Data Agent` 品牌收口和视觉精修

这不是生产代码，也不是完整业务系统，当前阶段主要用于：

- 产品方向讨论
- 页面与交互打样
- 本地演示
- 后续真实开发的 UI 参考

## 代码位置

- 工程目录：`/Users/sensen/Desktop/codex/取数-agent-console/app-demo`

## 当前实现到什么程度

已完成：

- `Next.js 16` 工程骨架
- 首页 `/`
- 会话页 `/agent`
- 结果页 `/report`
- 任务指令库 `/templates`
- 定时任务 `/schedules`
- 报告中心 `/artifacts`
- 反馈后台 `/admin/login`、`/admin/feedback`
- 本地 mock 数据
- 部分基础交互：
  - 输入跳转
  - 卡片点击
  - 平台能力切换
  - 页面间跳转
  - 问题反馈提交

未完成：

- 真实后端接口
- 真实任务执行
- 真实数据平台接入
- 前台用户登录体系
- 稳定部署
- 完整视觉定稿

## 运行方式

开发模式：

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

生产构建：

```bash
npm run build
npm run start
```

本地访问：

- [http://localhost:3000](http://localhost:3000)
- [http://10.20.2.125:3000](http://10.20.2.125:3000)

## 反馈功能配置

反馈功能默认写入 `Supabase`，需要先配置：

```bash
cp .env.example .env.local
```

并填写：

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

建表 SQL 在：

- `/Users/sensen/Desktop/取数-agent-console/app-demo/supabase/feedback_entries.sql`

站内查看页：

- `/admin/login`
- `/admin/feedback`

## 当前限制

- 目前仍是高保真 Demo，不是可交付业务前端
- 首页视觉仍在迭代，和目标参考图还没有完全收敛
- 样式系统中还有一部分 hardcode 颜色，后续需要整理成统一 token
- 部分页面是“结构先到位、细节再打磨”的状态

## 相关文档

- 项目总览：[README.md](/Users/sensen/Desktop/codex/取数-agent-console/README.md)
- PRD：[docs/prd.md](/Users/sensen/Desktop/codex/取数-agent-console/docs/prd.md)
- 开发交接：[docs/claude-code-handoff.md](/Users/sensen/Desktop/codex/取数-agent-console/docs/claude-code-handoff.md)
