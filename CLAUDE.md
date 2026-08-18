@AGENTS.md

# data-agent-console 补充说明

## Alice 一期相关

- **报告模式**：`TaskComposer` 的模式为 `"普通模式" | "报告模式"`（模式 Popover 已启用）。`platform-session-agent-workspace` / 首页 / 定时任务试跑均把模式透传为 round 的 `execution_mode`（normal/report）。报告模式提交的 round 在计划提交阶段扣减调研报告权益。
- **费用与个人中心**：`components/alice-shell.tsx` 承载账户菜单余额、费用面板（`/api/billing/*`）、订单创建弹窗、个人资料（`/api/user/profile`）、问题反馈（`/api/feedback`）。`/plans?billing=1` 可直接打开费用弹窗。
- **权益不足引导**：round 快照出现 `entitlement_insufficient` 时展示引导 banner 与「购买或升级套餐」入口。
- **API&Skills**：`components/api-key-settings-workspace.tsx` 创建 Key 弹窗含一次性明文展示与「测试连通」（`OPEN_API_BASE_URL` 为组件内硬编码，连通测试从浏览器直连）。
- **订单管理**：`app/(admin)/admin/orders/` + `components/admin-orders-workspace.tsx`，运营「确认收款 → 开通」，开通幂等。
- **E2E**：`tests/e2e/alice-phase1.spec.ts` 覆盖 PRD §11 验收（注册体验额度、Key 连通、报告模式扣减、外部 API 402、人工开通、资料持久化、反馈定位信息）。注册类场景要求后端 `EMAIL_OTP_DEV_ECHO_CODE=1` 回显 `X-Debug-Email-Code`。
