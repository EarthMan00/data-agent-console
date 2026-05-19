# More Data Agent 前端 Console

## 这是什么

这是 `取数 Agent Console` 的前端工程，对接 `data-agent-server` 真实 API，用于跨境运营助手的产品交互。

## 代码位置

- 工程目录：`data-agent-console/`

## 当前能力

- `Next.js` 应用：首页 `/`、会话 `/agent`、报告 `/report`、定时任务 `/schedules`、报告中心 `/artifacts`
- 用户登录/注册（短信、邮箱、密码）
- 首页推荐提示词、分享页（`GET /api/public/shares/{shareId}`）
- 平台 Agent 任务执行与 WebSocket/HTTP 轮询
- 反馈后台 `/admin/login`、`/admin/feedback`（Supabase）

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

需配置 `NEXT_PUBLIC_AGENT_API_ORIGIN`（或开发代理）指向后端。

## 反馈功能配置

```bash
cp .env.example .env.local
```

填写 `NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`。

## 数据约定（见仓库根目录 `readme.txt`）

- 控制台仅使用后端真实数据，不包含本地 mock 数据集或示例回放兜底
- 接口失败时展示明确错误，不做静默降级或占位表格
