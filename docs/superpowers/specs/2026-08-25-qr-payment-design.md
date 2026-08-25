# 扫码支付设计（支付宝 + 微信）

## 目标

将套餐购买的「线下转账 + 人工开通」改为真实扫码支付：支付宝当面付、微信 Native 支付，支付成功后自动开通套餐。

## 已确认决策

- 接入方式：直连官方渠道（支付宝开放平台「当面付预下单」、微信支付商户号「Native」）。先开发，后补资质。
- 支付成功后全自动开通：回调验签通过 → 订单 `paid` → 自动 `fulfill` 开周期，无人工环节。
- 不引入模拟渠道 / mock 回调。开发期支付宝用开放平台沙箱验证，微信无沙箱，待真实商户号到位后以 ¥0.01 真实支付验收。
- 未配置渠道密钥时支付功能直接报错，不降级、不吞错。

## 总体架构

### 后端（data-agent-server）新增

| 模块 | 文件 | 职责 |
|------|------|------|
| 支付编排服务 | `app/services/payment_service.py` | 下单（生成渠道预支付单）、关单、回调处理、渠道查单；支付成功后复用 `BillingService` 完成 paid → fulfill |
| 渠道适配层 | `app/services/payment_channels/base.py` + `alipay_channel.py` + `wechat_channel.py` | 统一 Channel 协议：`precreate`（拿二维码）/ `query`（查单）/ `verify_notify`（验签解密）。支付宝用 `alipay-sdk-python`，微信用官方 `wechatpayv3` |
| 用户侧支付路由 | `app/routers/api_payments.py` | `POST /api/payments/orders/{order_id}/pay`（body: channel）→ 返回 `qr_code_url`；订单支付状态沿用 `/api/billing/orders` 轮询 |
| 公开回调路由 | `app/routers/payment_notify.py` | `POST /api/payments/notify/alipay`、`/api/payments/notify/wechat`（无鉴权，靠渠道验签） |
| 配置 | `.env` 环境变量 | `ALIPAY_APP_ID/ALIPAY_PRIVATE_KEY/ALIPAY_PUBLIC_KEY/ALIPAY_GATEWAY_URL`（开发期指向沙箱网关 `openapi-sandbox.dl.alipaydev.com`，生产为 `openapi.alipay.com`）、`WECHAT_MCH_ID/WECHAT_APP_ID/WECHAT_API_V3_KEY/WECHAT_PRIVATE_KEY/WECHAT_SERIAL_NO`、`PAYMENT_NOTIFY_BASE_URL`（回调公网地址） |

### 前端（data-agent-console）变更

- `lib/agent-api/payments.ts`：新 API client（创建支付）
- `components/payment-qr-dialog.tsx`：扫码支付弹窗（新建）
- `components/alice-shell.tsx`：订单创建后弹窗从「线下转账」改为扫码支付弹窗
- `components/admin-orders-workspace.tsx`：配合全自动开通调整（见「运营后台」）

### 总体设计要点

- 密钥只存在于后端，前端不接触任何渠道密钥。
- 渠道适配层只做渠道协议（签名/验签/字段映射），业务状态机全在 `PaymentService` + `BillingService`，新增渠道只需加 adapter。
- `BillingService.fulfill` 原样复用（已具备幂等性），支付模块不复制开周期逻辑。

## 数据模型

### 新增迁移 `039_payments.sql`

```sql
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  channel VARCHAR(8) NOT NULL CHECK (channel IN ('alipay', 'wechat')),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'closed')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  out_trade_no VARCHAR(64) NOT NULL,      -- 发给渠道的商户订单号
  channel_trade_no VARCHAR(64),           -- 渠道返回的交易号（支付成功后回填）
  qr_code_url TEXT,
  paid_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  raw_notify JSONB,                       -- 最近一次回调原文（对账排查用）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, out_trade_no)
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id, created_at DESC);
```

### orders 表变更

- `payment_method` 现有 `VARCHAR(16)` 够用，取值改为 `alipay` / `wechat`。
- 新增 `expires_at TIMESTAMPTZ`：二维码有效期（下单时 = created_at + 2 小时，与两家渠道默认有效期对齐），用于前端倒计时和过期判定。
- `status` 状态机不变：`created → paid → fulfilled` / `created → closed`（渠道支付单状态独立记录在 payments 表）。

### 数据模型设计要点

- 一笔订单可对应多笔支付单：二维码过期后用户点「重新生成」时，关闭旧的 pending 支付单、新建一笔。因此 `payments` 是独立表而不是 `orders` 加列。
- `out_trade_no` 生成规则：首笔 = `orders.order_no`（24 字符，两家渠道长度上限 64/32 都满足）；重下时 = `order_no` 截短 + 序号后缀，保证唯一。
- `raw_notify` 存回调原文：支付对账排查的底线数据，不用于业务判断（业务判断只看验签后的字段）。

## 支付流程

### 下单（用户侧）

1. 用户创建订单（现有 `POST /api/billing/orders` 不变）→ `orders.status = created`。
2. 前端在扫码弹窗中调 `POST /api/payments/orders/{order_id}/pay`，body `{channel}`。
3. 后端幂等逻辑：
   - 该订单 + 该渠道已有 `pending` 且未过期的支付单 → 直接返回其 `qr_code_url`。
   - 过期或已关闭 → 关闭旧单（若仍 pending），用新 `out_trade_no` 调渠道 `precreate`，写入新 payments 行。
4. 渠道返回 `qr_code_url` → 落库 → 响应前端；同时回填 `orders.expires_at = now + 2h`。

### 回调（渠道 → 后端）

```text
POST /api/payments/notify/{channel}
  → 渠道验签（支付宝 RSA2 验签；微信平台证书验签 + APIv3 解密）
  → 按 (channel, out_trade_no) 查 payments
  → 幂等检查：已 paid → 直接返回成功应答
  → 校验金额一致（防篡改）
  → 事务内：payments.status=paid + 回填 channel_trade_no
          → orders.status=paid + payment_method + paid_at
          → 执行 fulfill（复用 BillingService，开周期）
  → 返回渠道要求格式的成功应答（支付宝 "success" / 微信 200+SUCCESS）
```

### 关单与补偿

- 前端轮询：弹窗内每 2s 轮询 `/api/billing/orders`，发现 `paid/fulfilled` 即展示成功态（前端不直连渠道）。
- 过期关单：`expires_at` 已过且 `pending` 时，后端在「重新生成」或「向渠道查单」时先 `query` 渠道确认——若渠道侧实际已支付（回调丢失的极端情况），按支付成功流程补上；否则关闭支付单。不做定时轮询补偿（渠道回调本身有重试机制，25 小时内多重重试，丢失概率极低，避免过度兜底）。
- 验签失败：拒绝并记 error 日志，不落库（渠道会重试）。
- 金额不符：拒绝并记 error 日志，标记对账异常。

### 状态机总结

```text
orders:  created ──扫码支付成功──→ paid ──自动──→ fulfilled
              └── 超时/重新生成 ──→ closed（仅当无 pending 支付单）
payments: pending ──回调验签通过──→ paid
                 └── 过期/渠道查单确认未付 ──→ closed
```

## 前端交互

### 扫码支付弹窗（`payment-qr-dialog.tsx`）

订单创建成功后，原「线下转账」弹窗替换为扫码支付弹窗：

- 顶部 tab 切换：支付宝 / 微信（默认支付宝），切换时若该渠道还没有支付单则调 `/pay` 获取二维码。
- 二维码展示：`qrcode.react` 渲染 `qr_code_url`，展示订单金额与套餐名。
- 倒计时：显示 `expires_at` 剩余时间（2 小时）；过期后展示「二维码已过期」遮罩 + 「重新生成」按钮。
- 轮询：每 2s 轮询订单状态；`paid/fulfilled` → 展示成功态 → 用户关闭后自动刷新费用面板（权益 + 订单记录）。
- 「我已完成支付」按钮：立即触发一次状态查询。
- 轮询在弹窗关闭时停止（`useEffect` cleanup）。

### 订单记录（alice-shell 费用面板）

- 状态文案：`created` → 「待支付」，`paid` → 「已支付」，`fulfilled` → 「已开通」，`closed` → 「已关闭」。
- 待支付且未过期的订单：显示「继续支付」按钮 → 重新打开扫码弹窗（幂等返回原二维码）。
- 移除「线下转账」相关文案。

### 错误处理

- `/pay` 失败（渠道异常/密钥未配）展示报错文案并允许重试，不吞错。
- 支付成功后费用面板顶部余额/权益数据整体刷新（复用现有 `loadBillingData`）。

## 测试策略

### 渠道环境

| 渠道 | 开发期 | 联调期 |
|------|--------|--------|
| 支付宝 | 开放平台沙箱（沙箱 appid/密钥 + 沙箱版支付宝 App 真实扫码） | 拿到真实资质后，¥0.01 真实支付验证 |
| 微信支付 | 无沙箱，开发期以官方文档样例报文做验签单测 | 拿到真实商户号后，¥0.01 真实支付验证 |

### 明确不做的事

- 不做模拟渠道 / mock 回调端点：全部走真实渠道协议。未配置渠道密钥时，支付功能直接报错（`payment_channel_not_configured`），前端「购买」创建订单后 `/pay` 返回明确错误，不吞错、不降级。

### 测试计划

- 后端单测：渠道适配层用官方文档样例报文验证签名/验签正确性；`PaymentService` 幂等（重复回调）、关单、金额校验、回调 → fulfill 全链路（含重复回调幂等）。
- 前端组件测试：扫码弹窗 tab 切换、轮询状态流转、过期遮罩、报错展示。
- E2E：支付宝沙箱跑通「创建订单 → 扫码 → 回调 → 权益到账」全链路；微信待资质到位后用 ¥0.01 真实支付人工验收。

## 运营后台与异常处理

### admin-orders-workspace 调整

- 移除「确认收款」和「开通」按钮及对应交互（订单 `paid`/`fulfilled` 由支付回调自动完成）。
- 保留列表展示（订单号、用户、套餐、金额、支付方式、状态、时间）。
- 新增「向渠道查单」按钮：调渠道 `query` 接口核对渠道侧实际支付状态。仅用于回调异常的排查对账（如用户反馈已扣款但未到账），不做自动定时轮询。

### 异常处理

| 场景 | 处理 |
|------|------|
| 回调验签失败 | 拒绝 + error 日志（渠道自动重试） |
| 回调金额与订单不符 | 拒绝 + error 日志，支付单保持 pending，等人工查单处理 |
| 回调到达但支付单已 closed（超时关单后渠道又扣款） | 查单确认后按支付成功补 fulfill |
| 渠道下单失败（密钥未配/网络异常/金额超限） | 后端返回明确错误码，前端弹窗展示报错 + 重试按钮 |
| 重复回调 | 幂等返回成功应答 |
| fulfill 失败（如权益冲突） | 订单保持 paid 不回滚支付，报错日志 + 后台查单界面可见，人工介入 |

### 上线前置条件（资质到位后）

- 配置全部渠道密钥 + `PAYMENT_NOTIFY_BASE_URL`（公网可达，需 HTTPS）。
- 支付宝开放平台 / 微信商户平台配置回调地址为 `{BASE}/api/payments/notify/alipay`、`/wechat`。
- 微信商户平台确认 Native 支付产品已开通、APIv3 密钥与证书就位。
