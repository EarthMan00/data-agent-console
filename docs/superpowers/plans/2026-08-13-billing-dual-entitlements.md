# Alice 双权益套餐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Alice 套餐与账单 mock 从单一任务额度改为数据查询、调研报告两类独立权益。

**Architecture:** 在 `alice-shell.tsx` 的 mock 套餐配置中以 `PlanEntitlements` 表达两类次数；套餐选择与账单总览共用该结构。明细行新增权益类别，余额只表示所属类别的剩余次数。

**Tech Stack:** Next.js、React、TypeScript、Tailwind、Vitest、Testing Library。

## Global Constraints

- 基础版月付展示 80 次数据查询、8 次调研报告；高级版月付展示 220 次数据查询、22 次调研报告。
- 一期不展示 Linkfox 积分、“约可”或“任务额度”。
- 本次仅更改前端 mock，不接入支付或后台计费。
- 保留现有周付、月付、年付、订单、二维码支付交互。

---

### Task 1: 将套餐 mock 改为双权益结构

**Files:**
- Modify: `components/alice-shell.tsx:135-151`
- Test: `tests/component/alice-shell-layout.test.tsx:251-275`

**Interfaces:**
- Produces: `PlanEntitlements`，字段为 `dataQueries` 和 `researchReports`，供套餐选择与账单总览读取。

- [ ] **Step 1: 编写失败断言**

在费用弹窗打开后，断言月付基础版出现 `80 次数据查询` 与 `8 次调研报告`，高级版出现 `220 次数据查询` 与 `22 次调研报告`，并断言 `任务额度` 不存在。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/component/alice-shell-layout.test.tsx`

Expected: FAIL，因为套餐卡仍渲染单一 `Alice 任务额度`。

- [ ] **Step 3: 最小实现**

在 `BILLING_PLANS` 为各周期加入：

```ts
entitlements: {
  monthly: { dataQueries: 80, researchReports: 8 },
}
```

将套餐卡“包含”区改为两行：

```tsx
<p>{entitlements.dataQueries} 次数据查询</p>
<p>{entitlements.researchReports} 次调研报告</p>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/component/alice-shell-layout.test.tsx`

Expected: PASS。

### Task 2: 重做套餐与账单的双余额总览与明细

**Files:**
- Modify: `components/alice-shell.tsx:141-151,1929-1941`
- Test: `tests/component/alice-shell-layout.test.tsx:251-275`

**Interfaces:**
- Consumes: `PlanEntitlements`。
- Produces: 两类余额卡，以及带 `权益` 列的账单明细表。

- [ ] **Step 1: 编写失败断言**

断言套餐与账单总览同时存在 `数据查询剩余`、`调研报告剩余`、`已用 15 / 80`、`已用 1 / 8`。断言明细表头含 `权益`，并可见 `数据查询` 与 `调研报告`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/component/alice-shell-layout.test.tsx`

Expected: FAIL，因为当前只有“剩余任务额度”和单一余额列。

- [ ] **Step 3: 最小实现**

将总览单一大数字替换为两个并列余额卡；使用固定 mock：数据查询剩余 65 / 80、调研报告剩余 7 / 8。将 `BILLING_LEDGER` 行扩展为 `日期、权益、事项、类型、变动、该权益余额` 六列，并更新表头。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/component/alice-shell-layout.test.tsx`

Expected: PASS。

### Task 3: 回归验证与静态检查

**Files:**
- Modify: `components/alice-shell.tsx`
- Test: `tests/component/alice-shell-layout.test.tsx`, `tests/component/plan-billing-workspace.test.tsx`

**Interfaces:**
- Consumes: 已完成的双权益套餐与账单视图。

- [ ] **Step 1: 搜索遗留文案**

Run: `rg -n '任务额度|约可|Linkfox 积分' components/alice-shell.tsx`

Expected: 无面向用户的套餐与账单遗留匹配。

- [ ] **Step 2: 执行类型与组件测试**

Run: `npx tsc --noEmit && npx vitest run tests/component/alice-shell-layout.test.tsx tests/component/plan-billing-workspace.test.tsx && git diff --check`

Expected: 三项均成功。
