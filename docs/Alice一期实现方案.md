# Alice 一期实现方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 PRD v1.2（[Alice-API-Skills-费用与个人中心一期PRD.md](Alice-API-Skills-费用与个人中心一期PRD.md)）实现 Alice 一期：权益账本与套餐周期、外部 API 结构化计费、个人中心持久化、问题反馈连通、后台人工开通工作台。

**Architecture:** 后端在现有 FastAPI + ServiceContainer 上新增 EntitlementService / BillingService（双模式：内存 + PostgreSQL，遵循 PlanService 既有模式）；执行链在 `round_executor` 的 plan 提交与终态处挂载权益预留/结算；外部 API 请求改为结构化字段并由服务端拼装 prompt；前端 alice-shell 的 mock 费用数据全部替换为真实 API。

**Tech Stack:** Python 3 / FastAPI / psycopg / pytest；Next.js App Router / TypeScript / vitest / Playwright。

**前置约定：**
- 后端单测在内存模式 ServiceContainer 下运行（`DATABASE_URL` 置空，见 tests/conftest.py），新服务必须支持无 pool 的内存模式。
- 后端测试命令：`cd data-agent-server && python -m pytest tests/test_xxx.py -v`；集成测试：`python -m pytest tests/integration/test_xxx.py -v`。
- 前端测试命令：`cd data-agent-console && npm run test:unit` / `npm run test:component` / `npm run test:e2e`。
- 每个子仓库独立 git，提交在对应子目录执行。

---

## 0. 关键设计决策（执行前必读）

1. **RBAC 已移除**：migrations/014_rbac.sql 与 020_rbac_models.sql 均为 no-op（"RBAC has been removed from the product"）。后台鉴权只用 `require_admin`（users.role == 'admin'）与前端 RequirePlatformAdmin。**CLAUDE.md 中 RBAC 章节已过时，勿按其实现。** 新增后台页面只需放入 `app/(admin)/admin/` 路由组。
2. **plans 表扩展而非重建**：`RoundPlanEntitlement`（services/container.py:64-82）与 `Plan.can_call`（service_support/domain_models.py:22）依赖 `plans.can_use_tools`/`features` 做执行链能力 gating。扩展 plans 表时**保留 can_use_tools 列**，新套餐（basic/advanced）置 true、free 置 false。
3. **权益预留/结算挂载点**（已核实）：
   - Web 预留：`services/round_executor.py:1837` `persist_plan` 调用之前（`_commit_plan` 内）。预留失败 → `_fail_round`，不持久化计划；persist 失败 → 补偿 release。
   - Web 结算：`_fail_round`（round_executor.py:2568）、`finalize_cancellation` 调用点（1888）、SUCCEEDED/PARTIAL_SUCCESS 的 `guarded_transition`（1902、2529、2554）。统一加 `_closeout_entitlement` 出口。
   - 外部 API 预留：`external_api_service.create_run`（返回 202 之前）；结算同 Web 终态出口，但类别按产物判定（见决策 4）。
4. **扣减类别判定**（PRD v1.2 §5.5.1）：
   - Web：`round.execution_mode == "report"` → research_report，否则 data_query；结算不回判。
   - 外部 API：创建时按 `task_type` 预留；结算按产物判定——round steps 中存在 `report.generate` capability 且该 step 成功 → 扣 research_report，否则扣 data_query。类别与预留不一致时：release 原预留 + consume 目标类别；目标类别余额不足时允许透支（余额为负，记 `adjust` 流水，后台订单/流水页可见异常）。
5. **懒触发周期维护**：到期 expire 与 scheduled 激活不新增定时器，在余额查询与每次 reserve 时懒触发（与 PlanService 懒解析策略一致）。
6. **体验额度**：`identity_service.create_user`（3 个注册入口的统一收口）成功后发放 trial 周期。
7. **报告模式前端**：TaskComposer 的 `ComposerMode` 现为 `"普通模式" | "深度模式"`（task-composer.tsx:35），模式切换 Popover 被注释（3277 行）。一期改为 `"普通模式" | "报告模式"` 并启用 Popover。
8. **反馈端点为认证端点**：由服务端自动附 user_id / user_uuid / 提交时间；page_path / client_version 由前端采集提交（用户无需手填）。
9. **订单人工开通**：orders 状态机 `created → paid → fulfilled`；运营在后台确认收款（paid）后执行开通（fulfilled）；重复开通幂等。

---

## 阶段 P1：数据层与权益账本核心（Task 1-8）

### Task 1: 迁移脚本 031 —— subscription_cycles + entitlement_ledger

**Files:**
- Create: `data-agent-server/migrations/031_subscription_cycles_entitlements.sql`

- [ ] **Step 1: 编写迁移文件**

```sql
-- 031_subscription_cycles_entitlements.sql
-- 套餐周期（含体验周期）与不可变权益流水

CREATE TABLE IF NOT EXISTS subscription_cycles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  plan_snapshot JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'scheduled', 'ended', 'revoked')),
  kind VARCHAR(16) NOT NULL DEFAULT 'purchased'
    CHECK (kind IN ('purchased', 'trial')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  data_query_remaining INT NOT NULL CHECK (data_query_remaining >= 0),
  research_report_remaining INT NOT NULL CHECK (research_report_remaining >= 0),
  activated_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_cycle_ends_after_starts CHECK (ends_at > starts_at)
);

-- 同一用户最多一个 active 与一个 scheduled（PRD §6.4）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cycles_user_active
  ON subscription_cycles (user_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cycles_user_scheduled
  ON subscription_cycles (user_id) WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_cycles_user_status
  ON subscription_cycles (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS entitlement_ledger (
  id UUID PRIMARY KEY,
  cycle_id UUID NOT NULL REFERENCES subscription_cycles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement_type VARCHAR(32) NOT NULL
    CHECK (entitlement_type IN ('data_query', 'research_report')),
  delta INT NOT NULL CHECK (delta != 0),
  source VARCHAR(24) NOT NULL CHECK (source IN ('web', 'api')),
  event_type VARCHAR(24) NOT NULL
    CHECK (event_type IN ('grant', 'reserve', 'consume', 'release', 'expire', 'adjust')),
  status VARCHAR(16) NOT NULL DEFAULT 'final'
    CHECK (status IN ('reserved', 'final')),
  task_id UUID,
  task_kind VARCHAR(64),
  idempotency_key VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ
);

-- 幂等：同一用户 + 幂等键唯一
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_idempotency
  ON entitlement_ledger (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 同一 cycle 同一任务同一类别最多一条未结算预留
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_reserved
  ON entitlement_ledger (cycle_id, task_id, entitlement_type)
  WHERE status = 'reserved';

CREATE INDEX IF NOT EXISTS idx_ledger_user_time
  ON entitlement_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_cycle
  ON entitlement_ledger (cycle_id, created_at DESC);
```

- [ ] **Step 2: 应用迁移**

Run: `cd data-agent-server/scripts && powershell -File apply-migrations.ps1`
Expected: `031_subscription_cycles_entitlements.sql` 执行成功，无报错。

- [ ] **Step 3: 同步迁移清单并验证**

**必须同步两个清单**（否则集成测试不会建新表）：
1. `tests/integration/conftest.py` 的 `MIGRATION_ORDER`（约 15-47 行）末尾追加 `"031_subscription_cycles_entitlements.sql",`（032/033/034 在各自 Task 应用时追加）。
2. `tests/test_migration_scripts.py` 若枚举迁移文件清单，同样追加。

Run: `cd data-agent-server && python -m pytest tests/test_migration_scripts.py -v`
Expected: 全部 PASS。

- [ ] **Step 4: Commit**

```bash
cd data-agent-server
git add migrations/031_subscription_cycles_entitlements.sql
git commit -m "feat: add subscription_cycles and entitlement_ledger tables"
```

---

### Task 2: 迁移脚本 032 —— users 资料字段 + feedback 扩展

**Files:**
- Create: `data-agent-server/migrations/032_user_profile_feedback.sql`

- [ ] **Step 1: 编写迁移文件**

```sql
-- 032_user_profile_feedback.sql
-- 个人资料持久化字段 + 反馈表账户定位字段

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(64),
  ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(16);

ALTER TABLE feedback_entries
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_uuid UUID;

-- app_version 语义即客户端版本，重命名为 PRD 术语（项目未上线，无兼容负担）
ALTER TABLE feedback_entries
  RENAME COLUMN app_version TO client_version;

CREATE INDEX IF NOT EXISTS idx_feedback_user
  ON feedback_entries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_user_uuid
  ON feedback_entries (user_uuid);
```

- [ ] **Step 2: 应用迁移**

Run: `cd data-agent-server/scripts && powershell -File apply-migrations.ps1`
Expected: 执行成功无报错。

- [ ] **Step 3: 验证**

Run: `cd data-agent-server && python -m pytest tests/test_migration_scripts.py -v`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
cd data-agent-server
git add migrations/032_user_profile_feedback.sql
git commit -m "feat: add user profile columns and feedback account columns"
```

---

### Task 3: 迁移脚本 033 —— orders + plans 计费字段

**Files:**
- Create: `data-agent-server/migrations/033_orders_plan_pricing.sql`

- [ ] **Step 1: 编写迁移文件**

```sql
-- 033_orders_plan_pricing.sql
-- 订单表（人工开通模式）+ plans 计费字段扩展
-- 注意：保留 can_use_tools（执行链能力 gating 依赖，见方案决策 2）

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  order_no VARCHAR(40) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_type VARCHAR(16) NOT NULL CHECK (order_type IN ('new', 'renew', 'upgrade')),
  plan_snapshot JSONB NOT NULL,
  prev_plan_snapshot JSONB,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  original_amount_cents BIGINT CHECK (
    original_amount_cents IS NULL OR original_amount_cents >= 0
  ),
  campaign_label VARCHAR(32),
  billing_cycle VARCHAR(8) NOT NULL CHECK (billing_cycle IN ('weekly', 'monthly', 'yearly')),
  payment_method VARCHAR(16),
  status VARCHAR(16) NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'paid', 'fulfilled', 'closed')),
  idempotency_key VARCHAR(128) UNIQUE NOT NULL,
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_time
  ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_time
  ON orders (status, created_at DESC);

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(8)
    CHECK (billing_cycle IS NULL OR billing_cycle IN ('weekly', 'monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS catalog_price_cents BIGINT
    CHECK (catalog_price_cents IS NULL OR catalog_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS sale_price_cents BIGINT
    CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS campaign_label VARCHAR(32),
  ADD COLUMN IF NOT EXISTS data_query_quota INT
    CHECK (data_query_quota IS NULL OR data_query_quota >= 0),
  ADD COLUMN IF NOT EXISTS research_report_quota INT
    CHECK (research_report_quota IS NULL OR research_report_quota >= 0),
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;

-- 套餐种子：月付两档（PRD §6.1 目录价）。周付/年付由运营在后台配置。
UPDATE plans SET
  billing_cycle = 'monthly',
  catalog_price_cents = 19900,
  sale_price_cents = 19900,
  data_query_quota = 80,
  research_report_quota = 8,
  is_visible = true
WHERE code = 'paid_basic';

UPDATE plans SET
  billing_cycle = 'monthly',
  catalog_price_cents = 54900,
  sale_price_cents = 54900,
  data_query_quota = 220,
  research_report_quota = 22,
  is_visible = true
WHERE code = 'paid_advanced';
```

- [ ] **Step 2: 应用迁移**

Run: `cd data-agent-server/scripts && powershell -File apply-migrations.ps1`
Expected: 执行成功无报错。

- [ ] **Step 3: 验证种子数据**

Run: `cd data-agent-server && python -m pytest tests/test_migration_scripts.py -v`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
cd data-agent-server
git add migrations/033_orders_plan_pricing.sql
git commit -m "feat: add orders table and plan pricing columns"
```

---

### Task 4: 迁移脚本 034 —— linkfox_daily_costs

**Files:**
- Create: `data-agent-server/migrations/034_linkfox_daily_costs.sql`
- Create: `data-agent-server/scripts/import-linkfox-costs.py`

- [ ] **Step 1: 编写迁移文件**

```sql
-- 034_linkfox_daily_costs.sql
-- 每日 Linkfox 总消耗导入，仅供内部成本监控（PRD §6.2）

CREATE TABLE IF NOT EXISTS linkfox_daily_costs (
  id UUID PRIMARY KEY,
  cost_date DATE NOT NULL,
  account_scope VARCHAR(32) NOT NULL,
  points_consumed BIGINT NOT NULL CHECK (points_consumed >= 0),
  voucher_ref TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (cost_date, account_scope)
);
```

- [ ] **Step 2: 编写导入脚本（运营手动执行）**

```python
# data-agent-server/scripts/import-linkfox-costs.py
"""导入 Linkfox 每日总消耗。用法:
python scripts/import-linkfox-costs.py --date 2026-08-14 --scope all --points 18450 --voucher "linkfox-console-20260814.csv"
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()

from data_agent_server.app.db.pool import get_pool, is_database_enabled


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="YYYY-MM-DD")
    parser.add_argument("--scope", required=True, help="账号范围标识，如 all / 子账号 ID")
    parser.add_argument("--points", required=True, type=int, help="当日消耗积分")
    parser.add_argument("--voucher", default=None, help="原始凭证引用（文件路径或链接）")
    args = parser.parse_args()

    if not is_database_enabled():
        print("database not configured", file=sys.stderr)
        return 1
    cost_date = date.fromisoformat(args.date)
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO linkfox_daily_costs (id, cost_date, account_scope, points_consumed, voucher_ref)
                VALUES (gen_random_uuid(), %s, %s, %s, %s)
                ON CONFLICT (cost_date, account_scope)
                DO UPDATE SET points_consumed = EXCLUDED.points_consumed,
                              voucher_ref = EXCLUDED.voucher_ref,
                              imported_at = NOW()
                """,
                (cost_date, args.scope, args.points, args.voucher),
            )
        conn.commit()
    print(f"imported {args.date} scope={args.scope} points={args.points}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: 应用迁移**

Run: `cd data-agent-server/scripts && powershell -File apply-migrations.ps1`
Expected: 执行成功无报错。

- [ ] **Step 4: Commit**

```bash
cd data-agent-server
git add migrations/034_linkfox_daily_costs.sql scripts/import-linkfox-costs.py
git commit -m "feat: add linkfox daily cost import table and script"
```

---

### Task 5: EntitlementService 内存模式核心

**Files:**
- Create: `data-agent-server/data_agent_server/app/services/entitlement_service.py`
- Create: `data-agent-server/tests/test_entitlement_service.py`

- [ ] **Step 1: 写失败测试（reserve 余额充足）**

```python
# data-agent-server/tests/test_entitlement_service.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from data_agent_server.app.services.entitlement_service import (
    EntitlementInsufficientError,
    EntitlementService,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@pytest.fixture
def service() -> EntitlementService:
    return EntitlementService()


@pytest.fixture
def active_user(service: EntitlementService):
    user_id = uuid4()
    service.open_cycle(
        user_id=user_id,
        plan_code="paid_basic",
        plan_name="基础版",
        data_query_quota=80,
        research_report_quota=8,
        starts_at=_utcnow() - timedelta(days=1),
        ends_at=_utcnow() + timedelta(days=29),
        kind="purchased",
        status="active",
    )
    return user_id


def test_reserve_decrements_remaining(service: EntitlementService, active_user):
    ledger_id = service.reserve(
        user_id=active_user,
        entitlement_type="data_query",
        task_id=uuid4(),
        task_kind="standard_query",
        source="web",
        idempotency_key="round-1",
    )
    summary = service.current_entitlements(user_id=active_user)
    assert summary["data_query_remaining"] == 79
    entry = service.get_ledger_entry(ledger_id)
    assert entry["status"] == "reserved"
    assert entry["delta"] == -1
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_entitlement_service.py -v`
Expected: FAIL（`ModuleNotFoundError: ... entitlement_service`）

- [ ] **Step 3: 写不足/幂等/结算/过期测试（同文件追加）**

```python
def test_reserve_insufficient_raises(service: EntitlementService, active_user):
    user_id = active_user
    for i in range(80):
        service.reserve(
            user_id=user_id,
            entitlement_type="data_query",
            task_id=uuid4(),
            task_kind="standard_query",
            source="web",
            idempotency_key=f"round-{i}",
        )
    with pytest.raises(EntitlementInsufficientError):
        service.reserve(
            user_id=user_id,
            entitlement_type="data_query",
            task_id=uuid4(),
            task_kind="standard_query",
            source="web",
            idempotency_key="round-over",
        )
    summary = service.current_entitlements(user_id=user_id)
    assert summary["data_query_remaining"] == 0


def test_reserve_idempotent_by_key(service: EntitlementService, active_user):
    task_id = uuid4()
    first = service.reserve(
        user_id=active_user,
        entitlement_type="research_report",
        task_id=task_id,
        task_kind="research_report",
        source="api",
        idempotency_key="external-round-1",
    )
    second = service.reserve(
        user_id=active_user,
        entitlement_type="research_report",
        task_id=task_id,
        task_kind="research_report",
        source="api",
        idempotency_key="external-round-1",
    )
    assert first == second
    summary = service.current_entitlements(user_id=active_user)
    assert summary["research_report_remaining"] == 7


def test_consume_finalizes_reserved(service: EntitlementService, active_user):
    task_id = uuid4()
    service.reserve(
        user_id=active_user,
        entitlement_type="data_query",
        task_id=task_id,
        task_kind="standard_query",
        source="web",
        idempotency_key="round-consume",
    )
    service.consume(user_id=active_user, task_id=task_id, entitlement_type="data_query")
    summary = service.current_entitlements(user_id=active_user)
    assert summary["data_query_remaining"] == 79


def test_release_returns_remaining(service: EntitlementService, active_user):
    task_id = uuid4()
    service.reserve(
        user_id=active_user,
        entitlement_type="data_query",
        task_id=task_id,
        task_kind="standard_query",
        source="web",
        idempotency_key="round-release",
    )
    service.release(user_id=active_user, task_id=task_id, entitlement_type="data_query")
    summary = service.current_entitlements(user_id=active_user)
    assert summary["data_query_remaining"] == 80


def test_expire_due_cycles_writes_expire_entries(service: EntitlementService):
    user_id = uuid4()
    service.open_cycle(
        user_id=user_id,
        plan_code="trial",
        plan_name="体验",
        data_query_quota=5,
        research_report_quota=1,
        starts_at=_utcnow() - timedelta(days=8),
        ends_at=_utcnow() - timedelta(days=1),
        kind="trial",
        status="active",
    )
    expired = service.expire_due_cycles(now=_utcnow())
    assert expired == 1
    summary = service.current_entitlements(user_id=user_id)
    assert summary["data_query_remaining"] == 0
    assert summary["research_report_remaining"] == 0
    assert summary["cycle_status"] == "ended"


def test_activate_due_scheduled(service: EntitlementService):
    user_id = uuid4()
    service.open_cycle(
        user_id=user_id,
        plan_code="paid_basic",
        plan_name="基础版",
        data_query_quota=80,
        research_report_quota=8,
        starts_at=_utcnow() - timedelta(days=2),
        ends_at=_utcnow() + timedelta(days=28),
        kind="purchased",
        status="active",
    )
    service.open_cycle(
        user_id=user_id,
        plan_code="paid_basic",
        plan_name="基础版",
        data_query_quota=80,
        research_report_quota=8,
        starts_at=_utcnow() - timedelta(days=1),
        ends_at=_utcnow() + timedelta(days=29),
        kind="purchased",
        status="scheduled",
    )
    activated = service.activate_due_scheduled(now=_utcnow())
    assert activated == 1
    summary = service.current_entitlements(user_id=user_id)
    assert summary["cycle_status"] == "active"
    assert summary["data_query_remaining"] == 80
```

- [ ] **Step 4: 运行确认全部失败**

Run: `cd data-agent-server && python -m pytest tests/test_entitlement_service.py -v`
Expected: FAIL（模块不存在）

- [ ] **Step 5: 实现 EntitlementService（内存模式）**

```python
# data-agent-server/data_agent_server/app/services/entitlement_service.py
"""权益账本：预留/结算/过期状态机。内存与 PostgreSQL 双模式（遵循 PlanService 模式）。"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from ..service_support.time_and_tier import ensure_utc_aware, utc_now


class EntitlementError(Exception):
    pass


class EntitlementInsufficientError(EntitlementError):
    def __init__(self, entitlement_type: str, remaining: int) -> None:
        super().__init__(f"{entitlement_type} insufficient, remaining={remaining}")
        self.entitlement_type = entitlement_type
        self.remaining = remaining


class NoActiveCycleError(EntitlementError):
    pass


class LedgerStateError(EntitlementError):
    pass


@dataclass
class _Cycle:
    id: UUID
    user_id: UUID
    plan_code: str
    plan_name: str
    status: str
    kind: str
    starts_at: datetime
    ends_at: datetime
    data_query_remaining: int
    research_report_remaining: int
    sale_price_cents: int = 0
    activated_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class _LedgerEntry:
    id: UUID
    cycle_id: UUID
    user_id: UUID
    entitlement_type: str
    delta: int
    source: str
    event_type: str
    status: str
    task_id: UUID | None
    task_kind: str | None
    idempotency_key: str | None
    created_at: datetime = field(default_factory=utc_now)
    finalized_at: datetime | None = None


class EntitlementService:
    def __init__(self, pool: Any | None = None) -> None:
        self._pool = pool
        self._lock = threading.Lock()
        self._cycles_by_user: dict[UUID, list[_Cycle]] = {}
        self._cycles_by_id: dict[UUID, _Cycle] = {}
        self._ledger_by_id: dict[UUID, _LedgerEntry] = {}
        self._ledger_by_idem: dict[tuple[UUID, str], UUID] = {}
        self._ledger_by_user: dict[UUID, list[UUID]] = {}

    # ---------- 周期管理 ----------

    def open_cycle(
        self,
        *,
        user_id: UUID,
        plan_code: str,
        plan_name: str,
        data_query_quota: int,
        research_report_quota: int,
        starts_at: datetime,
        ends_at: datetime,
        kind: str = "purchased",
        status: str = "active",
        sale_price_cents: int = 0,
    ) -> UUID:
        """创建周期（内存模式）。PG 模式下由 BillingService 走持久化路径。"""
        if self._pool:
            raise EntitlementError("open_cycle is only available in memory mode")
        cycle = _Cycle(
            id=uuid4(),
            user_id=user_id,
            plan_code=plan_code,
            plan_name=plan_name,
            status=status,
            kind=kind,
            starts_at=ensure_utc_aware(starts_at),
            ends_at=ensure_utc_aware(ends_at),
            data_query_remaining=data_query_quota,
            research_report_remaining=research_report_quota,
            sale_price_cents=sale_price_cents,
        )
        with self._lock:
            self._cycles_by_user.setdefault(user_id, []).append(cycle)
            self._cycles_by_id[cycle.id] = cycle
        return cycle.id

    def _active_cycle_locked(self, user_id: UUID) -> _Cycle | None:
        self.expire_due_cycles_locked()
        self.activate_due_scheduled_locked()
        for cycle in self._cycles_by_user.get(user_id, []):
            if cycle.status == "active":
                return cycle
        return None

    # ---------- 查询 ----------

    def current_entitlements(self, *, user_id: UUID) -> dict[str, Any]:
        with self._lock:
            self.expire_due_cycles_locked()
            self.activate_due_scheduled_locked()
            cycle = next(
                (c for c in self._cycles_by_user.get(user_id, []) if c.status == "active"),
                None,
            )
        if cycle is None:
            return {
                "has_active_cycle": False,
                "plan_code": None,
                "plan_name": None,
                "cycle_status": None,
                "kind": None,
                "starts_at": None,
                "ends_at": None,
                "data_query_remaining": 0,
                "research_report_remaining": 0,
            }
        return {
            "has_active_cycle": True,
            "plan_code": cycle.plan_code,
            "plan_name": cycle.plan_name,
            "plan_snapshot": {
                "code": cycle.plan_code,
                "name": cycle.plan_name,
                "sale_price_cents": cycle.sale_price_cents,
            },
            "cycle_status": cycle.status,
            "kind": cycle.kind,
            "starts_at": cycle.starts_at,
            "ends_at": cycle.ends_at,
            "data_query_remaining": cycle.data_query_remaining,
            "research_report_remaining": cycle.research_report_remaining,
        }

    def get_ledger_entry(self, ledger_id: UUID) -> dict[str, Any] | None:
        with self._lock:
            entry = self._ledger_by_id.get(ledger_id)
        if entry is None:
            return None
        return {
            "id": entry.id,
            "cycle_id": entry.cycle_id,
            "entitlement_type": entry.entitlement_type,
            "delta": entry.delta,
            "event_type": entry.event_type,
            "status": entry.status,
            "task_id": entry.task_id,
        }

    def list_ledger(
        self,
        *,
        user_id: UUID,
        entitlement_type: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[dict[str, Any]], int]:
        with self._lock:
            ids = list(self._ledger_by_user.get(user_id, []))
            rows = [self._ledger_by_id[i] for i in ids]
        rows.sort(key=lambda e: e.created_at, reverse=True)
        if entitlement_type:
            rows = [e for e in rows if e.entitlement_type == entitlement_type]
        total = len(rows)
        start = (page - 1) * page_size
        page_rows = rows[start : start + page_size]
        items = [
            {
                "id": e.id,
                "entitlement_type": e.entitlement_type,
                "delta": e.delta,
                "source": e.source,
                "event_type": e.event_type,
                "task_kind": e.task_kind,
                "created_at": e.created_at,
            }
            for e in page_rows
        ]
        return items, total

    # ---------- 预留/结算 ----------

    def reserve(
        self,
        *,
        user_id: UUID,
        entitlement_type: str,
        task_id: UUID | None,
        task_kind: str | None,
        source: str,
        idempotency_key: str | None = None,
    ) -> UUID:
        if idempotency_key:
            with self._lock:
                existing = self._ledger_by_idem.get((user_id, idempotency_key))
                if existing is not None:
                    return existing
        with self._lock:
            cycle = self._active_cycle_locked(user_id)
            if cycle is None:
                raise NoActiveCycleError("user has no active subscription cycle")
            if entitlement_type == "data_query":
                if cycle.data_query_remaining <= 0:
                    raise EntitlementInsufficientError(
                        "data_query", cycle.data_query_remaining
                    )
                cycle.data_query_remaining -= 1
            elif entitlement_type == "research_report":
                if cycle.research_report_remaining <= 0:
                    raise EntitlementInsufficientError(
                        "research_report", cycle.research_report_remaining
                    )
                cycle.research_report_remaining -= 1
            else:
                raise EntitlementError(f"unknown entitlement_type {entitlement_type}")
            entry = _LedgerEntry(
                id=uuid4(),
                cycle_id=cycle.id,
                user_id=user_id,
                entitlement_type=entitlement_type,
                delta=-1,
                source=source,
                event_type="reserve",
                status="reserved",
                task_id=task_id,
                task_kind=task_kind,
                idempotency_key=idempotency_key,
            )
            self._ledger_by_id[entry.id] = entry
            self._ledger_by_user.setdefault(user_id, []).append(entry.id)
            if idempotency_key:
                self._ledger_by_idem[(user_id, idempotency_key)] = entry.id
            return entry.id

    def _finalize_locked(
        self,
        *,
        user_id: UUID,
        task_id: UUID,
        entitlement_type: str,
        event_type: str,
        delta: int,
    ) -> None:
        cycle = next(
            (c for c in self._cycles_by_user.get(user_id, []) if c.status in ("active", "ended")),
            None,
        )
        if cycle is None:
            raise NoActiveCycleError("user has no subscription cycle")
        reserved = next(
            (
                e
                for e in self._ledger_by_user.get(user_id, [])
                if (entry := self._ledger_by_id.get(e)) is not None
                and entry.status == "reserved"
                and entry.task_id == task_id
                and entry.entitlement_type == entitlement_type
            ),
            None,
        )
        if reserved is None:
            raise LedgerStateError(
                f"no reserved ledger entry for task {task_id} type {entitlement_type}"
            )
        reserved.status = "final"
        reserved.event_type = event_type
        reserved.finalized_at = utc_now()
        if delta > 0:
            if entitlement_type == "data_query":
                cycle.data_query_remaining += delta
            else:
                cycle.research_report_remaining += delta

    def consume(self, *, user_id: UUID, task_id: UUID, entitlement_type: str) -> None:
        with self._lock:
            self._finalize_locked(
                user_id=user_id,
                task_id=task_id,
                entitlement_type=entitlement_type,
                event_type="consume",
                delta=0,
            )

    def release(self, *, user_id: UUID, task_id: UUID, entitlement_type: str) -> None:
        with self._lock:
            self._finalize_locked(
                user_id=user_id,
                task_id=task_id,
                entitlement_type=entitlement_type,
                event_type="release",
                delta=1,
            )

    def convert(
        self,
        *,
        user_id: UUID,
        task_id: UUID,
        reserved_type: str,
        target_type: str,
    ) -> None:
        """外部 API 产物判定结算：release 原预留类别，直接 consume 目标类别（不足透支，记 adjust）。"""
        self.release(user_id=user_id, task_id=task_id, entitlement_type=reserved_type)
        with self._lock:
            cycle = self._active_cycle_locked(user_id)
            if cycle is None:
                raise NoActiveCycleError("user has no active subscription cycle")
            if target_type == "data_query":
                cycle.data_query_remaining -= 1
            else:
                cycle.research_report_remaining -= 1
            entry = _LedgerEntry(
                id=uuid4(),
                cycle_id=cycle.id,
                user_id=user_id,
                entitlement_type=target_type,
                delta=-1,
                source="api",
                event_type="adjust",
                status="final",
                task_id=task_id,
                task_kind="product_adjudication",
                idempotency_key=None,
                finalized_at=utc_now(),
            )
            self._ledger_by_id[entry.id] = entry
            self._ledger_by_user.setdefault(user_id, []).append(entry.id)

    # ---------- 周期维护（懒触发） ----------

    def expire_due_cycles_locked(self) -> None:
        now = utc_now()
        for cycles in self._cycles_by_user.values():
            for cycle in cycles:
                if cycle.status == "active" and cycle.ends_at <= now:
                    cycle.status = "ended"
                    cycle.ended_at = now
                    if cycle.data_query_remaining > 0:
                        entry = _LedgerEntry(
                            id=uuid4(),
                            cycle_id=cycle.id,
                            user_id=cycle.user_id,
                            entitlement_type="data_query",
                            delta=-cycle.data_query_remaining,
                            source="web",
                            event_type="expire",
                            status="final",
                            task_id=None,
                            task_kind="cycle_expiry",
                            idempotency_key=None,
                            finalized_at=now,
                        )
                        self._ledger_by_id[entry.id] = entry
                        self._ledger_by_user.setdefault(cycle.user_id, []).append(entry.id)
                        cycle.data_query_remaining = 0
                    if cycle.research_report_remaining > 0:
                        entry = _LedgerEntry(
                            id=uuid4(),
                            cycle_id=cycle.id,
                            user_id=cycle.user_id,
                            entitlement_type="research_report",
                            delta=-cycle.research_report_remaining,
                            source="web",
                            event_type="expire",
                            status="final",
                            task_id=None,
                            task_kind="cycle_expiry",
                            idempotency_key=None,
                            finalized_at=now,
                        )
                        self._ledger_by_id[entry.id] = entry
                        self._ledger_by_user.setdefault(cycle.user_id, []).append(entry.id)
                        cycle.research_report_remaining = 0

    def activate_due_scheduled_locked(self) -> None:
        now = utc_now()
        for cycles in self._cycles_by_user.values():
            for cycle in cycles:
                if cycle.status == "scheduled" and cycle.starts_at <= now:
                    cycle.status = "active"
                    cycle.activated_at = now

    def expire_due_cycles(self, *, now: datetime | None = None) -> int:
        del now
        with self._lock:
            before = sum(
                1
                for cycles in self._cycles_by_user.values()
                for c in cycles
                if c.status == "active" and c.ends_at <= utc_now()
            )
            self.expire_due_cycles_locked()
        return before

    def activate_due_scheduled(self, *, now: datetime | None = None) -> int:
        del now
        with self._lock:
            before = sum(
                1
                for cycles in self._cycles_by_user.values()
                for c in cycles
                if c.status == "scheduled" and c.starts_at <= utc_now()
            )
            self.activate_due_scheduled_locked()
        return before
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_entitlement_service.py -v`
Expected: 8 个测试全部 PASS。

- [ ] **Step 7: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/services/entitlement_service.py tests/test_entitlement_service.py
git commit -m "feat: add entitlement service with reserve/consume/release/expire state machine"
```

---

### Task 6: EntitlementService PostgreSQL 模式

**Files:**
- Create: `data-agent-server/data_agent_server/app/persistence/entitlement_access.py`
- Modify: `data-agent-server/data_agent_server/app/services/entitlement_service.py`
- Create: `data-agent-server/tests/integration/test_entitlement_pg.py`

- [ ] **Step 1: 写 PG 持久化函数**

```python
# data-agent-server/data_agent_server/app/persistence/entitlement_access.py
"""权益账本 PostgreSQL 访问层。"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from psycopg import Connection
from psycopg.rows import dict_row


def pg_open_cycle(
    conn: Connection,
    *,
    user_id: UUID,
    plan_id: UUID | None,
    plan_snapshot: dict[str, Any],
    status: str,
    kind: str,
    starts_at: datetime,
    ends_at: datetime,
    data_query_quota: int,
    research_report_quota: int,
) -> UUID:
    cycle_id = uuid4()
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO subscription_cycles (
                id, user_id, plan_id, plan_snapshot, status, kind,
                starts_at, ends_at, data_query_remaining, research_report_remaining
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                cycle_id, user_id, plan_id, plan_snapshot, status, kind,
                starts_at, ends_at, data_query_quota, research_report_quota,
            ),
        )
        row = cur.fetchone()
    assert row is not None
    return row["id"]


def pg_active_cycle_for_update(conn: Connection, user_id: UUID) -> dict[str, Any] | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, plan_snapshot, status, kind, starts_at, ends_at,
                   data_query_remaining, research_report_remaining
            FROM subscription_cycles
            WHERE user_id = %s AND status = 'active'
            FOR UPDATE
            """,
            (user_id,),
        )
        return cur.fetchone()


def pg_cycle_by_id(conn: Connection, cycle_id: UUID) -> dict[str, Any] | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, user_id, status, kind, starts_at, ends_at,
                   data_query_remaining, research_report_remaining
            FROM subscription_cycles WHERE id = %s
            """,
            (cycle_id,),
        )
        return cur.fetchone()


def pg_insert_ledger_reserve(
    conn: Connection,
    *,
    cycle_id: UUID,
    user_id: UUID,
    entitlement_type: str,
    task_id: UUID | None,
    task_kind: str | None,
    source: str,
    idempotency_key: str | None,
) -> UUID:
    entry_id = uuid4()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO entitlement_ledger (
                id, cycle_id, user_id, entitlement_type, delta, source,
                event_type, status, task_id, task_kind, idempotency_key
            )
            VALUES (%s, %s, %s, %s, -1, %s, 'reserve', 'reserved', %s, %s, %s)
            ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
            DO NOTHING
            RETURNING id
            """,
            (entry_id, cycle_id, user_id, entitlement_type, source, task_id, task_kind, idempotency_key),
        )
        row = cur.fetchone()
    if row is None:
        cur2 = conn.cursor()
        cur2.execute(
            "SELECT id FROM entitlement_ledger WHERE user_id = %s AND idempotency_key = %s",
            (user_id, idempotency_key),
        )
        row = cur2.fetchone()
        assert row is not None
    return row[0]


def pg_decrement_cycle_remaining(
    conn: Connection, cycle_id: UUID, entitlement_type: str
) -> None:
    column = (
        "data_query_remaining"
        if entitlement_type == "data_query"
        else "research_report_remaining"
    )
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE subscription_cycles SET {column} = {column} - 1, updated_at = NOW() "
            "WHERE id = %s AND status = 'active'",
            (cycle_id,),
        )
        if cur.rowcount != 1:
            raise RuntimeError("cycle remaining decrement failed")


def pg_finalize_ledger(
    conn: Connection,
    *,
    user_id: UUID,
    cycle_id: UUID,
    task_id: UUID,
    entitlement_type: str,
    event_type: str,
    remaining_delta: int,
) -> bool:
    column = (
        "data_query_remaining"
        if entitlement_type == "data_query"
        else "research_report_remaining"
    )
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            UPDATE entitlement_ledger
            SET status = 'final', event_type = %s, finalized_at = NOW()
            WHERE cycle_id = %s AND task_id = %s AND entitlement_type = %s
              AND status = 'reserved'
            RETURNING id
            """,
            (event_type, cycle_id, task_id, entitlement_type),
        )
        row = cur.fetchone()
        if row is None:
            return False
        if remaining_delta:
            cur.execute(
                f"UPDATE subscription_cycles SET {column} = {column} + %s, updated_at = NOW() "
                "WHERE id = %s",
                (remaining_delta, cycle_id),
            )
    return True


def pg_expire_due_cycles(conn: Connection, now: datetime) -> int:
    """到期 active 周期 → ended，剩余记为 expire 流水。单事务执行。"""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, user_id, data_query_remaining, research_report_remaining
            FROM subscription_cycles
            WHERE status = 'active' AND ends_at <= %s
            FOR UPDATE
            """,
            (now,),
        )
        due = list(cur.fetchall())
        for row in due:
            cycle_id = row["id"]
            user_id = row["user_id"]
            for etype, remaining in (
                ("data_query", row["data_query_remaining"]),
                ("research_report", row["research_report_remaining"]),
            ):
                if remaining > 0:
                    cur.execute(
                        """
                        INSERT INTO entitlement_ledger (
                            id, cycle_id, user_id, entitlement_type, delta, source,
                            event_type, status, task_kind, finalized_at
                        )
                        VALUES (%s, %s, %s, %s, %s, 'web', 'expire', 'final', 'cycle_expiry', NOW())
                        """,
                        (uuid4(), cycle_id, user_id, etype, -remaining),
                    )
            cur.execute(
                """
                UPDATE subscription_cycles
                SET status = 'ended', ended_at = NOW(),
                    data_query_remaining = 0, research_report_remaining = 0,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (cycle_id,),
            )
    return len(due)


def pg_activate_due_scheduled(conn: Connection, now: datetime) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE subscription_cycles
            SET status = 'active', activated_at = NOW(), updated_at = NOW()
            WHERE status = 'scheduled' AND starts_at <= %s
            """,
            (now,),
        )
        return cur.rowcount


def pg_list_ledger(
    conn: Connection,
    *,
    user_id: UUID,
    entitlement_type: str | None,
    limit: int,
    offset: int,
) -> tuple[list[dict[str, Any]], int]:
    clause = "user_id = %s"
    params: list[Any] = [user_id]
    if entitlement_type:
        clause += " AND entitlement_type = %s"
        params.append(entitlement_type)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(f"SELECT count(*) FROM entitlement_ledger WHERE {clause}", tuple(params))
        total = int(cur.fetchone()["count"])
        cur.execute(
            f"""
            SELECT id, cycle_id, entitlement_type, delta, source, event_type,
                   task_id, task_kind, status, created_at
            FROM entitlement_ledger
            WHERE {clause}
            ORDER BY created_at DESC, id DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params + [limit, offset]),
        )
        rows = list(cur.fetchall())
    return rows, total
```

- [ ] **Step 2: EntitlementService 增加 PG 分支**

在 `entitlement_service.py` 的 `reserve`、`consume`、`release`、`convert`、`current_entitlements`、`list_ledger`、`expire_due_cycles`、`activate_due_scheduled` 各方法开头增加 PG 实现。以 `reserve` 为例（其余方法模式相同）：

```python
# entitlement_service.py —— reserve 方法 PG 分支（替换原方法体开头）
    def reserve(self, *, user_id, entitlement_type, task_id, task_kind, source, idempotency_key=None) -> UUID:
        if self._pool:
            from ..persistence import entitlement_access as pg_ent

            with self._pool.connection() as conn:
                with conn.transaction():
                    self._maintain_cycles_pg(conn)
                    cycle = pg_ent.pg_active_cycle_for_update(conn, user_id)
                    if cycle is None:
                        raise NoActiveCycleError("user has no active subscription cycle")
                    remaining_key = (
                        "data_query_remaining"
                        if entitlement_type == "data_query"
                        else "research_report_remaining"
                    )
                    if int(cycle[remaining_key]) <= 0:
                        raise EntitlementInsufficientError(
                            entitlement_type, int(cycle[remaining_key])
                        )
                    ledger_id = pg_ent.pg_insert_ledger_reserve(
                        conn,
                        cycle_id=cycle["id"],
                        user_id=user_id,
                        entitlement_type=entitlement_type,
                        task_id=task_id,
                        task_kind=task_kind,
                        source=source,
                        idempotency_key=idempotency_key,
                    )
                    pg_ent.pg_decrement_cycle_remaining(conn, cycle["id"], entitlement_type)
                return ledger_id
        # 内存模式（原实现，保持不变）
        ...

    def _maintain_cycles_pg(self, conn) -> None:
        from ..persistence import entitlement_access as pg_ent

        pg_ent.pg_expire_due_cycles(conn, utc_now())
        pg_ent.pg_activate_due_scheduled(conn, utc_now())
```

其余 PG 分支要点：
- `consume`：`pg_finalize_ledger(..., event_type="consume", remaining_delta=0)`，返回 False 时抛 LedgerStateError。
- `release`：`pg_finalize_ledger(..., event_type="release", remaining_delta=1)`。
- `convert`：先 release 再在目标类别上直接插入 `adjust` 流水并 `pg_decrement_cycle_remaining`（允许透支，不校验余额）。
- `current_entitlements`：`pg_cycle_by_id`/active 查询 + 懒维护。
- `list_ledger`：`pg_list_ledger`。
- `expire_due_cycles`/`activate_due_scheduled`：委托对应 pg 函数。

- [ ] **Step 3: 写集成测试（PG）**

```python
# data-agent-server/tests/integration/test_entitlement_pg.py
"""权益账本 PG 模式集成测试。要求本地 PostgreSQL 可用。"""
from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest

from data_agent_server.app.services.entitlement_service import (
    EntitlementInsufficientError,
    EntitlementService,
)
from data_agent_server.app.service_support.time_and_tier import utc_now

pytestmark = pytest.mark.integration


@pytest.fixture
def service(test_pool) -> EntitlementService:
    # 集成测试的 DB fixture 为 tests/integration/conftest.py 的 test_pool
    return EntitlementService(test_pool)


@pytest.fixture
def active_user(test_pool) -> str:
    """直接插入测试用户（绕过 identity 服务），返回 user_id。"""
    user_id = uuid4()
    with test_pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (id, username, password_hash, role, status)
                VALUES (%s, %s, 'x', 'user', 'active')
                ON CONFLICT (id) DO NOTHING
                """,
                (user_id, f"ent_user_{user_id.hex[:8]}"),
            )
        conn.commit()
    return str(user_id)


def test_pg_reserve_consume_roundtrip(service, active_user):
    now = utc_now()
    service.open_cycle_pg(
        user_id=active_user,
        plan_code="paid_basic",
        plan_name="基础版",
        data_query_quota=80,
        research_report_quota=8,
        starts_at=now - timedelta(days=1),
        ends_at=now + timedelta(days=29),
        kind="purchased",
        status="active",
    )
    task_id = uuid4()
    ledger_id = service.reserve(
        user_id=active_user,
        entitlement_type="data_query",
        task_id=task_id,
        task_kind="standard_query",
        source="web",
        idempotency_key="pg-round-1",
    )
    summary = service.current_entitlements(user_id=active_user)
    assert summary["data_query_remaining"] == 79
    service.consume(user_id=active_user, task_id=task_id, entitlement_type="data_query")
    summary = service.current_entitlements(user_id=active_user)
    assert summary["data_query_remaining"] == 79
    assert ledger_id is not None


def test_pg_reserve_idempotent(service, active_user):
    now = utc_now()
    service.open_cycle_pg(
        user_id=active_user,
        plan_code="paid_basic",
        plan_name="基础版",
        data_query_quota=80,
        research_report_quota=8,
        starts_at=now - timedelta(days=1),
        ends_at=now + timedelta(days=29),
        kind="purchased",
        status="active",
    )
    task_id = uuid4()
    first = service.reserve(
        user_id=active_user,
        entitlement_type="data_query",
        task_id=task_id,
        task_kind="standard_query",
        source="api",
        idempotency_key="pg-idem-1",
    )
    second = service.reserve(
        user_id=active_user,
        entitlement_type="data_query",
        task_id=task_id,
        task_kind="standard_query",
        source="api",
        idempotency_key="pg-idem-1",
    )
    assert first == second
    assert service.current_entitlements(user_id=active_user)["data_query_remaining"] == 79


def test_pg_reserve_insufficient(service, active_user):
    now = utc_now()
    service.open_cycle_pg(
        user_id=active_user,
        plan_code="trial",
        plan_name="体验",
        data_query_quota=1,
        research_report_quota=1,
        starts_at=now - timedelta(days=1),
        ends_at=now + timedelta(days=6),
        kind="trial",
        status="active",
    )
    service.reserve(
        user_id=active_user,
        entitlement_type="data_query",
        task_id=uuid4(),
        task_kind="standard_query",
        source="web",
        idempotency_key="pg-ex-1",
    )
    with pytest.raises(EntitlementInsufficientError):
        service.reserve(
            user_id=active_user,
            entitlement_type="data_query",
            task_id=uuid4(),
            task_kind="standard_query",
            source="web",
            idempotency_key="pg-ex-2",
        )
```

- [ ] **Step 4: 运行集成测试**

Run: `cd data-agent-server && python -m pytest tests/integration/test_entitlement_pg.py -v`
Expected: PASS（若环境无 PG，标记为 skipped，本地联调时跑通）。

- [ ] **Step 5: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/persistence/entitlement_access.py data_agent_server/app/services/entitlement_service.py tests/integration/test_entitlement_pg.py
git commit -m "feat: add entitlement service PostgreSQL mode"
```

---

### Task 7: 升级差额计算纯函数

**Files:**
- Create: `data-agent-server/data_agent_server/app/services/billing_service.py`（先含差额函数）
- Create: `data-agent-server/tests/test_billing_service.py`

- [ ] **Step 1: 写失败测试**

```python
# data-agent-server/tests/test_billing_service.py
from __future__ import annotations

import math
from datetime import timedelta

from data_agent_server.app.services.billing_service import upgrade_charge_cents
from data_agent_server.app.service_support.time_and_tier import utc_now


def test_upgrade_mid_cycle_prorated():
    starts = utc_now() - timedelta(days=10)
    ends = starts + timedelta(days=30)
    now = starts + timedelta(days=10)
    charge = upgrade_charge_cents(
        old_price_cents=19900,
        new_price_cents=54900,
        starts_at=starts,
        ends_at=ends,
        now=now,
    )
    # 剩余价值 = 19900 * 20/30 = 13266.67；差额 = 54900 - 13266.67 = 41633.33 → ceil = 41634
    expected = math.ceil(54900 - 19900 * 20 / 30)
    assert charge == expected


def test_upgrade_at_cycle_end_minimal():
    starts = utc_now() - timedelta(days=29)
    ends = starts + timedelta(days=30)
    now = ends - timedelta(minutes=1)
    charge = upgrade_charge_cents(
        old_price_cents=19900, new_price_cents=54900,
        starts_at=starts, ends_at=ends, now=now,
    )
    assert charge > 0


def test_upgrade_first_day_full_diff():
    starts = utc_now() - timedelta(minutes=5)
    ends = starts + timedelta(days=30)
    now = starts + timedelta(minutes=5)
    charge = upgrade_charge_cents(
        old_price_cents=19900, new_price_cents=54900,
        starts_at=starts, ends_at=ends, now=now,
    )
    assert 35000 <= charge <= 54900
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_billing_service.py -v`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```python
# data-agent-server/data_agent_server/app/services/billing_service.py
"""订单与套餐开通（一期人工开通模式）。"""
from __future__ import annotations

import math
import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from ..service_support.time_and_tier import ensure_utc_aware, utc_now


def upgrade_charge_cents(
    *,
    old_price_cents: int,
    new_price_cents: int,
    starts_at: datetime,
    ends_at: datetime,
    now: datetime,
) -> int:
    """升级差额：新价 - 旧价按剩余有效秒数折抵的价值，向上取整到分（PRD §6.4）。"""
    starts = ensure_utc_aware(starts_at)
    ends = ensure_utc_aware(ends_at)
    current = ensure_utc_aware(now)
    total = max(1.0, (ends - starts).total_seconds())
    remaining = max(0.0, (ends - current).total_seconds())
    remaining_value = old_price_cents * remaining / total
    return max(0, math.ceil(new_price_cents - remaining_value))
```

- [ ] **Step 4: 运行确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_billing_service.py -v`
Expected: 3 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/services/billing_service.py tests/test_billing_service.py
git commit -m "feat: add prorated upgrade charge calculation"
```

---

### Task 8: BillingService 订单与开通（内存模式）

**Files:**
- Modify: `data-agent-server/data_agent_server/app/services/billing_service.py`
- Modify: `data-agent-server/tests/test_billing_service.py`

- [ ] **Step 1: 追加失败测试**

```python
# tests/test_billing_service.py 追加
from uuid import uuid4

import pytest

from data_agent_server.app.services.billing_service import (
    BillingService,
    OrderNotFoundError,
    OrderStateError,
)
from data_agent_server.app.services.entitlement_service import EntitlementService


@pytest.fixture
def billing() -> BillingService:
    entitlements = EntitlementService()
    service = BillingService(entitlements=entitlements)
    # 提供套餐目录（内存模式）
    service.upsert_plan_spec(
        code="paid_basic",
        name="基础版",
        billing_cycle="monthly",
        catalog_price_cents=19900,
        sale_price_cents=19900,
        data_query_quota=80,
        research_report_quota=8,
        can_use_tools=True,
    )
    service.upsert_plan_spec(
        code="paid_advanced",
        name="高级版",
        billing_cycle="monthly",
        catalog_price_cents=54900,
        sale_price_cents=54900,
        data_query_quota=220,
        research_report_quota=22,
        can_use_tools=True,
    )
    return service


def test_create_order_snapshots_plan(billing: BillingService):
    user_id = uuid4()
    order = billing.create_order(
        user_id=user_id,
        order_type="new",
        plan_code="paid_basic",
        billing_cycle="monthly",
        idempotency_key="order-1",
    )
    assert order["order_no"].startswith("AL")
    assert order["status"] == "created"
    assert order["amount_cents"] == 19900
    assert order["plan_snapshot"]["data_query_quota"] == 80


def test_fulfill_new_opens_active_cycle(billing: BillingService):
    user_id = uuid4()
    order = billing.create_order(
        user_id=user_id, order_type="new", plan_code="paid_basic",
        billing_cycle="monthly", idempotency_key="order-new",
    )
    billing.confirm_payment(order_id=order["id"], payment_method="bank", operator_id=uuid4())
    result = billing.fulfill(order_id=order["id"], operator_id=uuid4())
    assert result["status"] == "fulfilled"
    summary = billing.entitlements.current_entitlements(user_id=user_id)
    assert summary["has_active_cycle"] is True
    assert summary["data_query_remaining"] == 80
    assert summary["research_report_remaining"] == 8


def test_fulfill_idempotent(billing: BillingService):
    user_id = uuid4()
    order = billing.create_order(
        user_id=user_id, order_type="new", plan_code="paid_basic",
        billing_cycle="monthly", idempotency_key="order-idem",
    )
    billing.confirm_payment(order_id=order["id"], payment_method="bank", operator_id=uuid4())
    billing.fulfill(order_id=order["id"], operator_id=uuid4())
    again = billing.fulfill(order_id=order["id"], operator_id=uuid4())
    assert again["status"] == "fulfilled"
    summary = billing.entitlements.current_entitlements(user_id=user_id)
    assert summary["data_query_remaining"] == 80


def test_fulfill_renew_creates_scheduled(billing: BillingService):
    user_id = uuid4()
    order = billing.create_order(
        user_id=user_id, order_type="new", plan_code="paid_basic",
        billing_cycle="monthly", idempotency_key="order-r1",
    )
    billing.confirm_payment(order_id=order["id"], payment_method="bank", operator_id=uuid4())
    billing.fulfill(order_id=order["id"], operator_id=uuid4())
    renew = billing.create_order(
        user_id=user_id, order_type="renew", plan_code="paid_basic",
        billing_cycle="monthly", idempotency_key="order-r2",
    )
    billing.confirm_payment(order_id=renew["id"], payment_method="bank", operator_id=uuid4())
    billing.fulfill(order_id=renew["id"], operator_id=uuid4())
    cycles = billing.entitlements.list_cycles(user_id=user_id)
    assert [c["status"] for c in cycles] == ["scheduled", "active"]


def test_fulfill_upgrade_adjusts_current_cycle(billing: BillingService):
    user_id = uuid4()
    order = billing.create_order(
        user_id=user_id, order_type="new", plan_code="paid_basic",
        billing_cycle="monthly", idempotency_key="order-u1",
    )
    billing.confirm_payment(order_id=order["id"], payment_method="bank", operator_id=uuid4())
    billing.fulfill(order_id=order["id"], operator_id=uuid4())
    upgrade = billing.create_order(
        user_id=user_id, order_type="upgrade", plan_code="paid_advanced",
        billing_cycle="monthly", idempotency_key="order-u2",
    )
    assert upgrade["amount_cents"] > 0
    billing.confirm_payment(order_id=upgrade["id"], payment_method="bank", operator_id=uuid4())
    billing.fulfill(order_id=upgrade["id"], operator_id=uuid4())
    summary = billing.entitlements.current_entitlements(user_id=user_id)
    assert summary["plan_code"] == "paid_advanced"
    # 已消耗 0：剩余 = 高级版上限
    assert summary["data_query_remaining"] == 220
    assert summary["research_report_remaining"] == 22
    # 到期时间不变
    assert summary["ends_at"] is not None


def test_fulfill_without_payment_raises(billing: BillingService):
    user_id = uuid4()
    order = billing.create_order(
        user_id=user_id, order_type="new", plan_code="paid_basic",
        billing_cycle="monthly", idempotency_key="order-nopay",
    )
    with pytest.raises(OrderStateError):
        billing.fulfill(order_id=order["id"], operator_id=uuid4())
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_billing_service.py -v`
Expected: FAIL（BillingService 未定义）

- [ ] **Step 3: 实现 BillingService（内存模式）**

```python
# billing_service.py 追加
class OrderNotFoundError(Exception):
    pass


class OrderStateError(Exception):
    pass


class PlanSpecNotFoundError(Exception):
    pass


@dataclass
class _PlanSpec:
    code: str
    name: str
    billing_cycle: str
    catalog_price_cents: int
    sale_price_cents: int
    data_query_quota: int
    research_report_quota: int
    can_use_tools: bool = True


@dataclass
class _Order:
    id: UUID
    order_no: str
    user_id: UUID
    order_type: str
    plan_snapshot: dict[str, Any]
    prev_plan_snapshot: dict[str, Any] | None
    amount_cents: int
    original_amount_cents: int | None
    billing_cycle: str
    status: str
    idempotency_key: str
    payment_method: str | None = None
    paid_at: datetime | None = None
    fulfilled_at: datetime | None = None
    created_at: datetime = field(default_factory=utc_now)


class BillingService:
    def __init__(self, pool: Any | None = None, entitlements: EntitlementService | None = None) -> None:
        self._pool = pool
        self.entitlements = entitlements or EntitlementService(pool)
        self._lock = threading.Lock()
        self._plan_specs: dict[str, _PlanSpec] = {}
        self._orders: dict[UUID, _Order] = {}
        self._orders_by_idem: dict[tuple[UUID, str], UUID] = {}
        self._orders_by_user: dict[UUID, list[UUID]] = {}
        self._order_seq = 0

    def upsert_plan_spec(self, *, code: str, name: str, billing_cycle: str,
                         catalog_price_cents: int, sale_price_cents: int,
                         data_query_quota: int, research_report_quota: int,
                         can_use_tools: bool = True) -> None:
        with self._lock:
            self._plan_specs[code] = _PlanSpec(
                code=code, name=name, billing_cycle=billing_cycle,
                catalog_price_cents=catalog_price_cents,
                sale_price_cents=sale_price_cents,
                data_query_quota=data_query_quota,
                research_report_quota=research_report_quota,
                can_use_tools=can_use_tools,
            )

    def _spec(self, plan_code: str) -> _PlanSpec:
        spec = self._plan_specs.get(plan_code)
        if spec is None:
            raise PlanSpecNotFoundError(plan_code)
        return spec

    def _new_order_no(self) -> str:
        self._order_seq += 1
        now = utc_now()
        return f"AL{now:%Y%m%d}{self._order_seq:06d}"

    def create_order(
        self,
        *,
        user_id: UUID,
        order_type: str,
        plan_code: str,
        billing_cycle: str,
        idempotency_key: str,
    ) -> dict[str, Any]:
        with self._lock:
            existing = self._orders_by_idem.get((user_id, idempotency_key))
            if existing is not None:
                return self._order_dict(self._orders[existing])
            spec = self._spec(plan_code)
            prev: dict[str, Any] | None = None
            amount = spec.sale_price_cents
            if order_type == "upgrade":
                summary = self.entitlements.current_entitlements(user_id=user_id)
                if not summary["has_active_cycle"]:
                    raise OrderStateError("upgrade requires an active cycle")
                old_price = int(summary["plan_snapshot"].get("sale_price_cents", 0)) \
                    if summary.get("plan_snapshot") else 0
                amount = upgrade_charge_cents(
                    old_price_cents=old_price,
                    new_price_cents=spec.sale_price_cents,
                    starts_at=summary["starts_at"],
                    ends_at=summary["ends_at"],
                    now=utc_now(),
                )
                prev = summary["plan_snapshot"]
            order = _Order(
                id=uuid4(),
                order_no=self._new_order_no(),
                user_id=user_id,
                order_type=order_type,
                plan_snapshot={
                    "code": spec.code,
                    "name": spec.name,
                    "billing_cycle": billing_cycle,
                    "catalog_price_cents": spec.catalog_price_cents,
                    "sale_price_cents": spec.sale_price_cents,
                    "data_query_quota": spec.data_query_quota,
                    "research_report_quota": spec.research_report_quota,
                },
                prev_plan_snapshot=prev,
                amount_cents=amount,
                original_amount_cents=spec.catalog_price_cents,
                billing_cycle=billing_cycle,
                status="created",
                idempotency_key=idempotency_key,
            )
            self._orders[order.id] = order
            self._orders_by_idem[(user_id, idempotency_key)] = order.id
            self._orders_by_user.setdefault(user_id, []).append(order.id)
            return self._order_dict(order)

    def confirm_payment(
        self, *, order_id: UUID, payment_method: str, operator_id: UUID
    ) -> dict[str, Any]:
        with self._lock:
            order = self._orders.get(order_id)
            if order is None:
                raise OrderNotFoundError(str(order_id))
            if order.status != "created":
                raise OrderStateError(f"order {order.status} cannot be confirmed")
            order.status = "paid"
            order.payment_method = payment_method
            order.paid_at = utc_now()
            return self._order_dict(order)

    def fulfill(self, *, order_id: UUID, operator_id: UUID) -> dict[str, Any]:
        del operator_id
        with self._lock:
            order = self._orders.get(order_id)
            if order is None:
                raise OrderNotFoundError(str(order_id))
            if order.status == "fulfilled":
                return self._order_dict(order)
            if order.status != "paid":
                raise OrderStateError(f"order {order.status} cannot be fulfilled")
            now = utc_now()
            snapshot = order.plan_snapshot
            if order.order_type == "new":
                self.entitlements.open_cycle(
                    user_id=order.user_id,
                    plan_code=snapshot["code"],
                    plan_name=snapshot["name"],
                    data_query_quota=snapshot["data_query_quota"],
                    research_report_quota=snapshot["research_report_quota"],
                    starts_at=now,
                    ends_at=self._cycle_end(now, order.billing_cycle),
                    kind="purchased",
                    status="active",
                )
            elif order.order_type == "renew":
                cycles = self.entitlements.list_cycles(user_id=order.user_id)
                active = next((c for c in cycles if c["status"] == "active"), None)
                start = active["ends_at"] if active is not None else now
                self.entitlements.open_cycle(
                    user_id=order.user_id,
                    plan_code=snapshot["code"],
                    plan_name=snapshot["name"],
                    data_query_quota=snapshot["data_query_quota"],
                    research_report_quota=snapshot["research_report_quota"],
                    starts_at=start,
                    ends_at=self._cycle_end(start, order.billing_cycle),
                    kind="purchased",
                    status="scheduled",
                )
            elif order.order_type == "upgrade":
                self.entitlements.upgrade_active_cycle(
                    user_id=order.user_id,
                    plan_code=snapshot["code"],
                    plan_name=snapshot["name"],
                    data_query_quota=snapshot["data_query_quota"],
                    research_report_quota=snapshot["research_report_quota"],
                )
            else:
                raise OrderStateError(f"unknown order_type {order.order_type}")
            order.status = "fulfilled"
            order.fulfilled_at = now
            return self._order_dict(order)

    @staticmethod
    def _cycle_end(start: datetime, billing_cycle: str) -> datetime:
        from datetime import timedelta

        if billing_cycle == "weekly":
            return start + timedelta(days=7)
        if billing_cycle == "yearly":
            return start + timedelta(days=365)
        return start + timedelta(days=30)

    def _order_dict(self, order: _Order) -> dict[str, Any]:
        return {
            "id": order.id,
            "order_no": order.order_no,
            "order_type": order.order_type,
            "plan_snapshot": order.plan_snapshot,
            "amount_cents": order.amount_cents,
            "original_amount_cents": order.original_amount_cents,
            "billing_cycle": order.billing_cycle,
            "status": order.status,
            "created_at": order.created_at,
        }

    def get_order(self, *, order_id: UUID) -> dict[str, Any] | None:
        with self._lock:
            order = self._orders.get(order_id)
        return self._order_dict(order) if order else None

    def list_orders(self, *, user_id: UUID) -> list[dict[str, Any]]:
        with self._lock:
            ids = list(self._orders_by_user.get(user_id, []))
            orders = [self._orders[i] for i in ids]
        orders.sort(key=lambda o: o.created_at, reverse=True)
        return [self._order_dict(o) for o in orders]
```

- [ ] **Step 4: 为 EntitlementService 补充 upgrade_active_cycle 与 _active_cycle_for_memory（内存模式）**

```python
# entitlement_service.py 追加
    def _active_cycle_for_memory(self, user_id: UUID) -> _Cycle | None:
        with self._lock:
            self.expire_due_cycles_locked()
            self.activate_due_scheduled_locked()
            return next(
                (c for c in self._cycles_by_user.get(user_id, []) if c.status == "active"),
                None,
            )

    def reserved_source(
        self, *, user_id: UUID, task_id: UUID, entitlement_type: str
    ) -> str | None:
        """该任务 reserved 流水的来源（api/web）。结算分流依据。"""
        if self._pool:
            from ..persistence import entitlement_access as pg_ent

            with self._pool.connection() as conn:
                return pg_ent.pg_reserved_source(
                    conn, user_id=user_id, task_id=task_id, entitlement_type=entitlement_type
                )
        with self._lock:
            for entry_id in self._ledger_by_user.get(user_id, []):
                entry = self._ledger_by_id.get(entry_id)
                if entry is None or entry.task_id != task_id:
                    continue
                if entry.entitlement_type != entitlement_type:
                    continue
                if entry.event_type == "reserve":
                    return entry.source
            return None

    def attach_task(self, *, ledger_id: UUID, task_id: UUID) -> None:
        """外部 API 预留后补充 round_id。冲突视为同一任务。"""
        with self._lock:
            entry = self._ledger_by_id.get(ledger_id)
            if entry is None:
                raise LedgerStateError(f"ledger {ledger_id} not found")
            entry.task_id = task_id

    def list_cycles(self, *, user_id: UUID) -> list[dict[str, Any]]:
        """周期列表（active 优先）。PG 模式在 Task 18 补 SQL 实现。"""
        if self._pool:
            raise EntitlementError("list_cycles PG mode is implemented in Task 18")
        with self._lock:
            self.expire_due_cycles_locked()
            self.activate_due_scheduled_locked()
            cycles = sorted(
                self._cycles_by_user.get(user_id, []),
                key=lambda c: (c.status != "active", c.status != "scheduled", -c.starts_at.timestamp()),
            )
            return [
                {
                    "id": c.id,
                    "status": c.status,
                    "kind": c.kind,
                    "starts_at": c.starts_at,
                    "ends_at": c.ends_at,
                    "plan_code": c.plan_code,
                }
                for c in cycles
            ]

    def upgrade_active_cycle(
        self,
        *,
        user_id: UUID,
        plan_code: str,
        plan_name: str,
        data_query_quota: int,
        research_report_quota: int,
    ) -> None:
        """升级：当前 active 周期换套餐快照，到期不变，两类余额按新上限调整（PRD §6.4）。"""
        with self._lock:
            cycle = self._active_cycle_locked(user_id)
            if cycle is None:
                raise NoActiveCycleError("user has no active subscription cycle")
            cycle.plan_code = plan_code
            cycle.plan_name = plan_name
            cycle.data_query_remaining = max(
                0, data_query_quota - (cycle.data_query_remaining * 0 + self._consumed_count(cycle, "data_query"))
            )
            cycle.research_report_remaining = max(
                0, research_report_quota - self._consumed_count(cycle, "research_report")
            )

    def _consumed_count(self, cycle: _Cycle, entitlement_type: str) -> int:
        count = 0
        for entry_id in self._ledger_by_user.get(cycle.user_id, []):
            entry = self._ledger_by_id.get(entry_id)
            if entry is None or entry.cycle_id != cycle.id:
                continue
            if entry.entitlement_type != entitlement_type:
                continue
            if entry.event_type in ("reserve", "consume", "adjust") and entry.delta < 0:
                count += 1
        return count
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_billing_service.py tests/test_entitlement_service.py -v`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/services/billing_service.py data_agent_server/app/services/entitlement_service.py tests/test_billing_service.py
git commit -m "feat: add billing service with order lifecycle and manual fulfillment"
```

---

## 阶段 P2：套餐扩展、后台与体验额度（Task 9-12）

### Task 9: plans 计费字段接入 PlanService 与 admin_plans

**Files:**
- Modify: `data-agent-server/data_agent_server/app/schemas.py`（AdminPlanItem/CreateRequest/PatchRequest 加计费字段）
- Modify: `data-agent-server/data_agent_server/app/persistence/pg_access.py`（pg_list_plans/pg_create_plan/pg_update_plan 加字段）
- Modify: `data-agent-server/data_agent_server/app/routers/admin_plans.py`
- Modify: `data-agent-server/tests/test_admin.py`（追加断言）

- [ ] **Step 1: schemas 扩展**

在 `schemas.py` 中定位 `AdminPlanCreateRequest` 与 `AdminPlanItem`（约 570-600 行），追加可选字段：

```python
# schemas.py —— AdminPlanCreateRequest / AdminPlanItem / AdminPlanPatchRequest 追加字段
    billing_cycle: str | None = None          # weekly / monthly / yearly
    catalog_price_cents: int | None = None
    sale_price_cents: int | None = None
    campaign_label: str | None = None
    data_query_quota: int | None = None
    research_report_quota: int | None = None
    is_visible: bool | None = None
```

- [ ] **Step 2: pg_access 读写扩展**

`pg_list_plans`（约 3390 行）与 `pg_create_plan`/`pg_update_plan`（3408-3440）的 SELECT/INSERT/UPDATE 增加列：`billing_cycle, catalog_price_cents, sale_price_cents, campaign_label, data_query_quota, research_report_quota, is_visible`。

- [ ] **Step 3: admin_plans 路由透传新字段**

`list_plans`/`create_plan`/`patch_plan` 返回与入参透传新字段（模式照旧，字段名与 schema 一致）。

- [ ] **Step 4: 更新单测断言并运行**

Run: `cd data-agent-server && python -m pytest tests/test_admin.py -v`
Expected: 现有用例 PASS；在 test_admin.py 中追加一个用例验证创建带计费字段的套餐后 list 能读回：

```python
def test_create_plan_with_pricing_fields(client, auth_headers):
    r = client.post("/api/admin/plans", headers=auth_headers, json={
        "code": "basic_monthly_test",
        "name": "基础版-月付",
        "level": 10,
        "can_use_tools": True,
        "features": {},
        "billing_cycle": "monthly",
        "catalog_price_cents": 19900,
        "sale_price_cents": 19900,
        "data_query_quota": 80,
        "research_report_quota": 8,
    })
    assert r.status_code == 200, r.text
    listed = client.get("/api/admin/plans", headers=auth_headers).json()
    plan = next(p for p in listed["plans"] if p["code"] == "basic_monthly_test")
    assert plan["catalog_price_cents"] == 19900
    assert plan["data_query_quota"] == 80
```

- [ ] **Step 5: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/schemas.py data_agent_server/app/persistence/pg_access.py data_agent_server/app/routers/admin_plans.py tests/test_admin.py
git commit -m "feat: extend plan admin CRUD with pricing and quota fields"
```

---

### Task 10: 后台订单处理（admin_orders 路由 + 订单工作台页）

**Files:**
- Create: `data-agent-server/data_agent_server/app/routers/admin_orders.py`
- Create: `data-agent-server/tests/test_admin_orders.py`
- Modify: `data-agent-server/data_agent_server/app/main.py`（注册路由）
- Create: `data-agent-console/app/(admin)/admin/orders/page.tsx`
- Create: `data-agent-console/components/admin-orders-workspace.tsx`
- Modify: `data-agent-console/components/admin-shell.tsx`（导航项）

- [ ] **Step 1: 写失败测试（后端路由）**

```python
# data-agent-server/tests/test_admin_orders.py
from __future__ import annotations

from uuid import uuid4

from data_agent_server.app.bootstrap import services


def test_admin_list_orders_empty(client, auth_headers):
    r = client.get("/api/admin/orders", headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json()["orders"] == []


def test_admin_confirm_and_fulfill_flow(client, auth_headers):
    user_id = uuid4()
    order = services.billing.create_order(
        user_id=user_id, order_type="new", plan_code="paid_basic",
        billing_cycle="monthly", idempotency_key="admin-order-1",
    )
    r = client.patch(
        f"/api/admin/orders/{order['id']}/confirm-payment",
        headers=auth_headers, json={"payment_method": "bank"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["order"]["status"] == "paid"
    r = client.post(f"/api/admin/orders/{order['id']}/fulfill", headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json()["order"]["status"] == "fulfilled"
    summary = services.billing.entitlements.current_entitlements(user_id=user_id)
    assert summary["data_query_remaining"] == 80


def test_admin_orders_require_admin(client):
    r = client.get("/api/admin/orders")
    assert r.status_code == 401
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_admin_orders.py -v`
Expected: FAIL（404 无路由 / services.billing 不存在）

- [ ] **Step 3: 实现路由并注册**

```python
# data-agent-server/data_agent_server/app/routers/admin_orders.py
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..bootstrap import services
from ..dependencies import AuthUser, get_current_user, require_admin
from ..services.billing_service import OrderNotFoundError, OrderStateError

router = APIRouter(prefix="/admin")


class ConfirmPaymentRequest(BaseModel):
    payment_method: str = "bank"


@router.get("/orders")
def list_orders(user: AuthUser = Depends(get_current_user)):
    require_admin(user)
    return {"orders": services.billing.list_all_orders()}


@router.patch("/orders/{order_id}/confirm-payment")
def confirm_payment(
    order_id: UUID,
    payload: ConfirmPaymentRequest,
    user: AuthUser = Depends(get_current_user),
):
    require_admin(user)
    try:
        order = services.billing.confirm_payment(
            order_id=order_id, payment_method=payload.payment_method, operator_id=user.id
        )
    except OrderNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except OrderStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return {"order": order}


@router.post("/orders/{order_id}/fulfill")
def fulfill(order_id: UUID, user: AuthUser = Depends(get_current_user)):
    require_admin(user)
    try:
        order = services.billing.fulfill(order_id=order_id, operator_id=user.id)
    except OrderNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except OrderStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return {"order": order}
```

在 `main.py` 注册：`from .routers import admin_orders` 并 `app.include_router(admin_orders.router)`。

同时为 BillingService 增加 `list_all_orders`（内存模式遍历 `_orders`，按创建时间倒序）。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_admin_orders.py -v`
Expected: 3 个测试 PASS。

- [ ] **Step 5: 前端订单工作台**

`app/(admin)/admin/orders/page.tsx`（参照 `admin/users/page.tsx` 模式）：

```tsx
import { AdminOrdersWorkspace } from "@/components/admin-orders-workspace";
import { RequirePlatformAdmin } from "@/components/require-platform-admin";

export default function AdminOrdersPage() {
  return (
    <RequirePlatformAdmin>
      <AdminOrdersWorkspace />
    </RequirePlatformAdmin>
  );
}
```

`components/admin-orders-workspace.tsx`（参照 `admin-feedback-workspace.tsx` 的表格模式，使用 `platformAgent.withFreshToken()` 调 `/api/admin/orders`）：列表列 = 订单号 / 用户 / 类型 / 套餐 / 周期 / 金额 / 状态 / 创建时间；行操作 = 「确认收款」（status=created 时）/「开通」（status=paid 时）；状态徽标 created=待付款、paid=已收款待开通、fulfilled=已开通、closed=已关闭。

`components/admin-shell.tsx` 导航列表（参照现有 "用户管理" 项）追加：

```tsx
{ href: "/admin/orders", label: "订单管理", icon: Receipt },
```

（icon 从现有 `components/ui/tabler-icons` 导入，若无 Receipt 用 CreditCard 替代。）

- [ ] **Step 6: 前端组件测试**

Create: `data-agent-console/tests/component/admin-orders-workspace.test.tsx`——覆盖：列表渲染、confirm-payment 后状态变化、fulfill 后徽标变化（mock fetch）。

Run: `cd data-agent-console && npm run test:component`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/routers/admin_orders.py data_agent_server/app/main.py tests/test_admin_orders.py
git commit -m "feat: add admin order management endpoints"
cd ../data-agent-console
git add app/\(admin\)/admin/orders/page.tsx components/admin-orders-workspace.tsx components/admin-shell.tsx tests/component/admin-orders-workspace.test.tsx
git commit -m "feat: add admin orders workspace page"
```

---

### Task 11: 体验额度发放（注册钩子）

**Files:**
- Modify: `data-agent-server/data_agent_server/app/services/identity_service.py`
- Modify: `data-agent-server/tests/test_identity_service_tokens.py`（追加）

- [ ] **Step 1: 写失败测试**

```python
# tests/test_identity_service_tokens.py 追加
from data_agent_server.app.bootstrap import services


def test_create_user_grants_trial_entitlements(client):
    r = client.post("/api/auth/register", json={
        "username": "trial_user_1",
        "password": "pass1234",
        "phone": "13800000001",
        "sms_code": None,
    })
    # 若注册端点需要验证码，改用 identity 服务直接断言
    from data_agent_server.app.services.identity_service import IdentityService
    del r
    assert hasattr(services, "entitlements")
```

（注：注册端点若受短信验证码约束，直接对 services.identity.create_user 断言。执行时按实际端点行为调整，但断言目标不变：create_user 成功后存在 trial 周期、5 查询 + 1 报告。）

```python
def test_create_user_grants_trial_cycle():
    from uuid import uuid4
    from data_agent_server.app.services.identity_service import Role, UserStatus

    services.identity._lock.acquire()
    try:
        user = services.identity.create_user(
            username=f"trial_{uuid4().hex[:8]}",
            password="pass1234",
            role=Role.user,
            status=UserStatus.active,
        )
    finally:
        services.identity._lock.release()
    summary = services.entitlements.current_entitlements(user_id=user.id)
    assert summary["has_active_cycle"] is True
    assert summary["kind"] == "trial"
    assert summary["data_query_remaining"] == 5
    assert summary["research_report_remaining"] == 1
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_identity_service_tokens.py -v`
Expected: FAIL（services.entitlements 不存在 / 无 trial 周期）

- [ ] **Step 3: 实现注册钩子**

在 `identity_service.py` 的 `create_user` 两处成功路径（PG 分支 commit 前 / 内存分支 return 前）发放。文件顶部补充导入：`from datetime import timedelta`、`from ..service_support.time_and_tier import utc_now`：

```python
# identity_service.py —— create_user 成功路径追加（内存分支示例）
        try:
            from ..bootstrap import services as _services

            entitlements = getattr(_services, "entitlements", None)
            if entitlements is not None:
                entitlements.open_cycle(
                    user_id=user.id,
                    plan_code="trial",
                    plan_name="体验套餐",
                    data_query_quota=5,
                    research_report_quota=1,
                    starts_at=utc_now(),
                    ends_at=utc_now() + timedelta(days=7),
                    kind="trial",
                    status="active",
                )
        except Exception:
            pass  # 权益发放失败不阻断注册（账本服务缺失时静默降级）
```

（PG 分支使用 entitlement_access 的持久化 open 函数，与 BillingService 一致。ServiceContainer 需先注册 entitlements，见 Task 12 Step 5。）

- [ ] **Step 4: 运行确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_identity_service_tokens.py tests/test_api_auth.py -v`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/services/identity_service.py tests/test_identity_service_tokens.py
git commit -m "feat: grant trial entitlements on user registration"
```

---

### Task 12: 用户侧费用 API + ServiceContainer 注册

**Files:**
- Create: `data-agent-server/data_agent_server/app/routers/api_billing.py`
- Modify: `data-agent-server/data_agent_server/app/services/container.py`
- Modify: `data-agent-server/data_agent_server/app/routers/api.py`（include）
- Create: `data-agent-server/tests/test_api_billing.py`

- [ ] **Step 1: 写失败测试**

```python
# data-agent-server/tests/test_api_billing.py
from __future__ import annotations

from uuid import uuid4

from data_agent_server.app.bootstrap import services


def test_get_billing_summary_requires_auth(client):
    r = client.get("/api/billing/summary")
    assert r.status_code == 401


def test_get_billing_summary(client, auth_headers):
    r = client.get("/api/billing/summary", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "plan_code" in body
    assert "data_query_remaining" in body
    assert "research_report_remaining" in body


def test_get_ledger_paginated(client, auth_headers):
    # 先为用户创建周期并预留 2 笔，验证 10 条分页
    from datetime import timedelta

    from data_agent_server.app.service_support.time_and_tier import utc_now

    now = utc_now()
    user_id = uuid4()
    services.billing.entitlements.open_cycle(
        user_id=user_id, plan_code="paid_basic", plan_name="基础版",
        data_query_quota=80, research_report_quota=8,
        starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=29),
        kind="purchased", status="active",
    )
    del user_id
    r = client.get("/api/billing/ledger?page=1&page_size=10", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and "total" in body
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_api_billing.py -v`
Expected: FAIL（404）

- [ ] **Step 3: 实现路由**

```python
# data-agent-server/data_agent_server/app/routers/api_billing.py
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..bootstrap import services
from ..dependencies import AuthUser, get_current_user

router = APIRouter(tags=["billing"])


@router.get("/billing/summary")
def billing_summary(user: AuthUser = Depends(get_current_user)):
    return services.billing.entitlements.current_entitlements(user_id=user.id)


@router.get("/billing/ledger")
def billing_ledger(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    entitlement_type: str | None = Query(default=None),
    user: AuthUser = Depends(get_current_user),
):
    items, total = services.billing.entitlements.list_ledger(
        user_id=user.id,
        entitlement_type=entitlement_type,
        page=page,
        page_size=page_size,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/billing/orders")
def billing_orders(user: AuthUser = Depends(get_current_user)):
    return {"orders": services.billing.list_orders(user_id=user.id)}


@router.get("/billing/plans")
def billing_plans(user: AuthUser = Depends(get_current_user)):
    del user
    return {"plans": services.billing.list_visible_plan_specs()}


@router.post("/billing/orders")
def create_billing_order(payload: CreateOrderRequest, user: AuthUser = Depends(get_current_user)):
    return {
        "order": services.billing.create_order(
            user_id=user.id,
            order_type=payload.order_type,
            plan_code=payload.plan_code,
            billing_cycle=payload.billing_cycle,
            idempotency_key=payload.idempotency_key,
        )
    }
```

其中 `CreateOrderRequest`：

```python
from pydantic import BaseModel


class CreateOrderRequest(BaseModel):
    order_type: str  # new / renew / upgrade
    plan_code: str
    billing_cycle: str  # weekly / monthly / yearly
    idempotency_key: str
```

- [ ] **Step 4: ServiceContainer 注册**

`container.py` `__init__` 中（pool 分支之前，保证无 DB 也可用）：

```python
        from .entitlement_service import EntitlementService
        from .billing_service import BillingService

        self.entitlements = EntitlementService(pool)
        self.billing = BillingService(pool=pool, entitlements=self.entitlements)
```

并在 pool 分支内为 billing 载入套餐目录（从 plans 表读取计费字段，`upsert_plan_spec`）。

在 `api.py` 注册：`router.include_router(api_billing_router)`。

- [ ] **Step 5: 运行测试确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_api_billing.py tests/test_api_auth.py -v`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/routers/api_billing.py data_agent_server/app/routers/api.py data_agent_server/app/services/container.py tests/test_api_billing.py
git commit -m "feat: add user billing summary, ledger and order APIs"
```

---

## 阶段 P3：执行链接入（Task 13-18）

### Task 13: Web 报告模式（execution_mode 贯穿创建链路）

**Files:**
- Modify: `data-agent-server/data_agent_server/app/chat_round_schemas.py`（InitialRoundRequest 加 execution_mode）
- Modify: `data-agent-server/data_agent_server/app/services/chat_round_service.py`（create_initial 透传）
- Modify: `data-agent-server/data_agent_server/app/persistence/chat_round_repository.py`（create_initial 写入 execution_mode 列）
- Modify: `data-agent-server/tests/conftest.py`（_FakeChatRoundService.create_initial 接受并透传）
- Modify: `data-agent-server/tests/test_api_chat_rounds.py`（追加用例）
- Modify: `data-agent-console/components/task-composer.tsx`（ComposerMode 改 普通/报告 + 启用 Popover）
- Modify: `data-agent-console/components/agent-workspace/platform-session-agent-workspace.tsx`（接线 onModeChange + 传参）
- Modify: `data-agent-console/lib/agent-api/chat-rounds.ts`（body 加 execution_mode）

- [ ] **Step 1: 后端 schema 与失败测试**

```python
# chat_round_schemas.py —— InitialRoundRequest 追加
    execution_mode: Literal["normal", "report"] | None = None
```

（顶部导入 `from typing import Literal`。）

```python
# tests/test_api_chat_rounds.py 追加
def test_create_initial_round_with_report_mode(client, auth_headers):
    r = client.post(
        "/api/chat/rounds",
        headers=auth_headers,
        json={
            "message": "帮我调研美国市场蓝牙耳机竞品",
            "client_message_id": str(uuid4()),
            "execution_mode": "report",
        },
    )
    assert r.status_code == 202, r.text
    body = r.json()
    record = services.chat_rounds.rounds[UUID(body["round_id"])]
    assert record.execution_mode == "report"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_api_chat_rounds.py -v`
Expected: FAIL（schema 拒绝 / 断言失败）

- [ ] **Step 3: 实现透传**

- `chat_round_service.py` 的 `create_initial` 签名与 `initial_round_attempt`/`create_initial` 调用链增加 `execution_mode: str | None = None`，传给 repository 的 `create_initial`（沿用现有 `external_consumption` 的透传模式，参考 external_api_service.create_run 的 `user_message_meta` 处理：把 execution_mode 存入 `user_message_meta` 或独立列——**存独立列**，repository INSERT 列清单在 chat_round_repository.py:35 附近追加 `execution_mode`）。
- `chat_round_repository.py` 的 `_ROUND_COLUMNS`（约 35 行）与 INSERT（437-501 行）追加 `execution_mode`。
- `conftest.py` 的 `_FakeChatRoundService._record` 增加 `execution_mode=None` 字段，`create_initial` 从 `_kwargs` 读取并赋值。

- [ ] **Step 4: 运行确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_api_chat_rounds.py tests/test_chat_round_models.py -v`
Expected: PASS。

- [ ] **Step 5: 前端 ComposerMode 改造**

`task-composer.tsx`：

```tsx
type ComposerMode = "普通模式" | "报告模式";
```

取消注释 3277-3315 的 Popover 块，并把选项列表改为 `(["普通模式", "报告模式"] as const)`。`composerModeLabel` 映射同步（报告模式 label = "报告模式"）。

`platform-session-agent-workspace.tsx`（685 行附近）：

```tsx
const [composerMode, setComposerMode] = useState<"普通模式" | "报告模式">("普通模式");
// TaskComposer props：
mode={composerMode}
onModeChange={setComposerMode}
```

创建 round 的调用点（该组件中调用 `startRound`/`createInitialRound` 处）追加：

```tsx
execution_mode: composerMode === "报告模式" ? "report" : "normal",
```

`lib/agent-api/chat-rounds.ts`（225 行 POST body）：

```ts
body: JSON.stringify({
  ...payload,
  execution_mode: payload.executionMode ?? "normal",
}),
```

- [ ] **Step 6: 前端组件测试**

Create: `data-agent-console/tests/component/task-composer-mode.test.tsx`——渲染 TaskComposer，点开模式 Popover，选择"报告模式"，断言 `onModeChange` 收到 `"报告模式"`。

Run: `cd data-agent-console && npm run test:component`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/chat_round_schemas.py data_agent_server/app/services/chat_round_service.py data_agent_server/app/persistence/chat_round_repository.py tests/conftest.py tests/test_api_chat_rounds.py
git commit -m "feat: thread execution_mode through web round creation"
cd ../data-agent-console
git add components/task-composer.tsx components/agent-workspace/platform-session-agent-workspace.tsx lib/agent-api/chat-rounds.ts tests/component/task-composer-mode.test.tsx
git commit -m "feat: enable report mode selector in task composer"
```

---

### Task 14: 外部 API 结构化请求 + 创建时权益预留

**Files:**
- Modify: `data-agent-server/data_agent_server/app/external_schemas.py`（ExternalRunRequest 结构化）
- Modify: `data-agent-server/data_agent_server/app/services/external_api_service.py`（create_run 改造）
- Modify: `data-agent-server/tests/test_external_api_service.py` + `tests/test_api_external.py`（追加）

- [ ] **Step 1: 写失败测试**

```python
# tests/test_external_api_service.py 追加
from data_agent_server.app.external_schemas import ExternalRunRequest


def test_structured_request_builds_input_text():
    payload = ExternalRunRequest(
        task_type="data_query",
        query="查询美国市场蓝牙耳机 Top 10 品牌销量",
        market="us",
        time_range="2026-01-01~2026-06-30",
        fields=["brand", "sales", "price"],
        output_format="csv",
    )
    text = build_input_text(payload)
    assert "任务类型：数据查询" in text
    assert "目标市场：us" in text
    assert "brand, sales, price" in text
```

```python
# tests/test_api_external.py 追加
def test_external_run_rejects_legacy_shape(client, external_key_headers):
    r = client.post(
        "/api/v1/runs",
        headers={**external_key_headers, "Idempotency-Key": "shape-1"},
        json={"input": "自由文本"},
    )
    assert r.status_code == 422  # 结构化字段必填


def test_external_run_insufficient_entitlement(client, external_key_headers):
    # 用户无 active 周期 → 权益不足，任务不创建
    r = client.post(
        "/api/v1/runs",
        headers={**external_key_headers, "Idempotency-Key": "ent-1"},
        json={
            "task_type": "data_query",
            "query": "查询数据",
            "market": "us",
            "time_range": "2026-01-01~2026-06-30",
            "fields": ["brand"],
            "output_format": "csv",
        },
    )
    assert r.status_code == 402
    assert r.json()["error"]["code"] == "entitlement_insufficient"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_external_api_service.py tests/test_api_external.py -v`
Expected: FAIL（422/402 断言不满足）

- [ ] **Step 3: 改造 schema**

```python
# external_schemas.py —— 替换 ExternalRunRequest
from typing import Literal


class ExternalRunRequest(_ExternalModel):
    task_type: Literal["data_query", "research_report"]
    query: str = Field(min_length=1, max_length=50_000)
    market: str = Field(min_length=1, max_length=64)
    time_range: str = Field(min_length=1, max_length=128)
    fields: list[str] = Field(min_length=1, max_length=100)
    output_format: Literal["csv", "excel", "json"] = "csv"
    context: dict[str, Any] | None = None
```

- [ ] **Step 4: create_run 改造**

`external_api_service.py` 增加模块级函数：

```python
def build_input_text(payload: Any) -> str:
    """结构化请求 → LLM 规划文本（PRD §5.3：服务端拼装，客户端字段仅作意图声明）。"""
    task_label = "调研报告" if payload.task_type == "research_report" else "数据查询"
    return "\n".join(
        [
            f"任务类型：{task_label}",
            f"需求描述：{payload.query}",
            f"目标市场：{payload.market}",
            f"时间范围：{payload.time_range}",
            f"需要字段：{', '.join(payload.fields)}",
            f"输出格式：{payload.output_format}",
        ]
    )


def entitlement_type_for_task_type(task_type: str) -> str:
    return "research_report" if task_type == "research_report" else "data_query"
```

`create_run` 签名改为接收 `payload: ExternalRunRequest`（替代 `input_text: str`），在 `message = build_input_text(payload)` 之后、创建 round 之前预留权益。`ExternalAPIService.__init__` 增加 `entitlements: EntitlementService | None = None` 参数存为 `self._entitlements`（container.py 构造时传入 `entitlements=self.entitlements`）：

```python
        entitlement_type = entitlement_type_for_task_type(payload.task_type)
        if self._entitlements is not None:
            self._entitlements.reserve(
                user_id=key.user_id,
                entitlement_type=entitlement_type,
                task_id=None,  # round 尚未创建，待 create_initial 返回后以 round_id 补充
                task_kind=payload.task_type,
                source="api",
                idempotency_key=f"external:{idempotency_value}",
            )
```

（注意：reserve 的 task_id 在 round 创建前未知。EntitlementService.reserve 支持以 `task_id=None` + idempotency_key 预留；round 创建成功后调用 `entitlements.attach_task(ledger_id=..., task_id=round_id)` 补充 task_id——attach_task 更新 task_id 时若 `uq_ledger_reserved` 唯一索引冲突（该 cycle+task+type 已有预留）则视为同一任务直接返回。此方法在 Task 14 Step 4 一并实现：内存模式更新 `_LedgerEntry.task_id`，PG 模式 UPDATE entitlement_ledger SET task_id 并捕获唯一冲突。）

预留失败（EntitlementInsufficientError）→ 抛 `ExternalAPIError("entitlement insufficient", http_status=402, code="entitlement_insufficient")`。

- [ ] **Step 5: 更新 api_external.py 调用点**

`create_external_run` 中 `_service().create_run(key=key, input_text=payload.input, ...)` 改为 `_service().create_run(key=key, payload=payload, ...)`。

- [ ] **Step 6: 运行确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_external_api_service.py tests/test_api_external.py -v`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/external_schemas.py data_agent_server/app/services/external_api_service.py data_agent_server/app/routers/api_external.py tests/test_external_api_service.py tests/test_api_external.py
git commit -m "feat: structured external run requests with entitlement reservation"
```

---

### Task 15: Web 预留挂载（persist_plan 前）+ 补偿

**Files:**
- Modify: `data-agent-server/data_agent_server/app/services/round_executor.py`（_commit_plan 预留 + 补偿）
- Modify: `data-agent-server/data_agent_server/app/services/container.py`（executor 注入 entitlements）
- Modify: `data-agent-server/data_agent_server/app/service_support/chat_round_models.py`（RoundErrorCode 加 ENTITLEMENT_INSUFFICIENT）
- Create: `data-agent-server/tests/test_round_entitlement.py`

- [ ] **Step 1: 加错误码**

```python
# chat_round_models.py —— RoundErrorCode 枚举追加
    ENTITLEMENT_INSUFFICIENT = "entitlement_insufficient"
```

（同时确认 `_SAFE_MESSAGES` 类映射（round_executor.py 中）补充该 code 的中文提示："当前套餐权益不足，请购买或升级套餐后重试。"）

- [ ] **Step 2: executor 注入与预留**

`RoundExecutor.__init__` 增加参数 `entitlements=None` 存为 `self._entitlements`；container.py 构造时传入 `entitlements=self.entitlements`。

`_commit_plan` 中 persist_plan（1837 行）之前插入：

```python
        if self._entitlements is not None and current.round.execution_mode is not None:
            entitlement_type = (
                "research_report"
                if current.round.execution_mode == "report"
                else "data_query"
            )
            try:
                self._entitlements.reserve(
                    user_id=current.round.user_id,
                    entitlement_type=entitlement_type,
                    task_id=current.round.id,
                    task_kind=(
                        "research_report"
                        if entitlement_type == "research_report"
                        else "standard_query"
                    ),
                    source="web",
                    idempotency_key=f"round:{current.round.id}:plan",
                )
            except EntitlementInsufficientError:
                self._fail_round(
                    current.round,
                    RoundErrorCode.ENTITLEMENT_INSUFFICIENT,
                    EntitlementInsufficientError(entitlement_type, 0),
                    stage="entitlement_reserve",
                )
                return False
```

`persist_plan` 返回 None（计划未提交）时补偿：

```python
        committed = self._repository.persist_plan(...)
        if committed is None and self._entitlements is not None:
            try:
                self._entitlements.release(
                    user_id=current.round.user_id,
                    task_id=current.round.id,
                    entitlement_type=entitlement_type,
                )
            except LedgerStateError:
                pass
        return committed is not None
```

（顶部 import EntitlementInsufficientError / LedgerStateError。）

- [ ] **Step 3: 写失败测试（fake executor 集成）**

```python
# data-agent-server/tests/test_round_entitlement.py
"""Web 权益预留：余额不足时 round 失败且不执行数据源。"""
from __future__ import annotations

from uuid import uuid4

from data_agent_server.app.bootstrap import services
from data_agent_server.app.services.entitlement_service import EntitlementInsufficientError


def test_commit_plan_reserves_entitlement():
    user_id = uuid4()
    services.entitlements.open_cycle(
        user_id=user_id, plan_code="paid_basic", plan_name="基础版",
        data_query_quota=80, research_report_quota=8,
        starts_at=None, ends_at=None, kind="purchased", status="active",
    )
    # 通过 http 创建 report 模式 round，验证 round 行带 execution_mode
    # 及预留流水存在（fake executor 不真正执行，验证服务层接口即可）
    summary = services.entitlements.current_entitlements(user_id=user_id)
    assert summary["data_query_remaining"] == 80


def test_reserve_insufficient_marks_round_failed(monkeypatch):
    user_id = uuid4()
    with pytest.raises(EntitlementInsufficientError):
        services.entitlements.reserve(
            user_id=user_id,
            entitlement_type="data_query",
            task_id=uuid4(),
            task_kind="standard_query",
            source="web",
            idempotency_key="no-cycle-1",
        )
```

（注：真实 round 失败断言在 integration/ 下通过 PG + 真执行器验证；内存单测验证服务层行为即可。）

- [ ] **Step 4: 运行确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_round_entitlement.py tests/test_round_executor.py -v`
Expected: PASS（若 test_round_executor 构造 executor 时未传 entitlements，用默认 None 不破坏既有行为）。

- [ ] **Step 5: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/services/round_executor.py data_agent_server/app/services/container.py data_agent_server/app/service_support/chat_round_models.py tests/test_round_entitlement.py
git commit -m "feat: reserve entitlement before plan commit with compensation on failure"
```

---

### Task 16: round 终态结算（consume/release + 外部 API 产物判定）

**Files:**
- Modify: `data-agent-server/data_agent_server/app/services/round_executor.py`（_closeout_entitlement）
- Create: `data-agent-server/tests/test_round_entitlement_closeout.py`

- [ ] **Step 1: 写失败测试**

```python
# data-agent-server/tests/test_round_entitlement_closeout.py
from __future__ import annotations

from uuid import uuid4

from data_agent_server.app.bootstrap import services


def test_closeout_consume_on_success():
    user_id = uuid4()
    services.entitlements.open_cycle(
        user_id=user_id, plan_code="paid_basic", plan_name="基础版",
        data_query_quota=80, research_report_quota=8,
        starts_at=None, ends_at=None, kind="purchased", status="active",
    )
    task_id = uuid4()
    services.entitlements.reserve(
        user_id=user_id, entitlement_type="data_query", task_id=task_id,
        task_kind="standard_query", source="web", idempotency_key="c-1",
    )
    services.round_closeout.closeout(
        user_id=user_id, round_id=task_id, terminal_status="SUCCEEDED",
        source="web", has_report_product=False,
    )
    summary = services.entitlements.current_entitlements(user_id=user_id)
    assert summary["data_query_remaining"] == 79  # reserved→consumed，余额不变


def test_closeout_release_on_failure():
    user_id = uuid4()
    services.entitlements.open_cycle(
        user_id=user_id, plan_code="paid_basic", plan_name="基础版",
        data_query_quota=80, research_report_quota=8,
        starts_at=None, ends_at=None, kind="purchased", status="active",
    )
    task_id = uuid4()
    services.entitlements.reserve(
        user_id=user_id, entitlement_type="data_query", task_id=task_id,
        task_kind="standard_query", source="web", idempotency_key="c-2",
    )
    services.round_closeout.closeout(
        user_id=user_id, round_id=task_id, terminal_status="FAILED",
        source="web", has_report_product=False,
    )
    summary = services.entitlements.current_entitlements(user_id=user_id)
    assert summary["data_query_remaining"] == 80  # released 返还


def test_closeout_api_product_adjudication_converts_category():
    """外部 API：预留 data_query，产物为报告 → release 查询 + adjust 扣报告。"""
    user_id = uuid4()
    services.entitlements.open_cycle(
        user_id=user_id, plan_code="paid_basic", plan_name="基础版",
        data_query_quota=80, research_report_quota=8,
        starts_at=None, ends_at=None, kind="purchased", status="active",
    )
    task_id = uuid4()
    services.entitlements.reserve(
        user_id=user_id, entitlement_type="data_query", task_id=task_id,
        task_kind="data_query", source="api", idempotency_key="c-3",
    )
    services.round_closeout.closeout(
        user_id=user_id, round_id=task_id, terminal_status="SUCCEEDED",
        source="api", has_report_product=True,
    )
    summary = services.entitlements.current_entitlements(user_id=user_id)
    assert summary["data_query_remaining"] == 80      # 原预留已返还
    assert summary["research_report_remaining"] == 7  # 按产物扣报告
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_round_entitlement_closeout.py -v`
Expected: FAIL（round_closeout 不存在）

- [ ] **Step 3: 实现 RoundCloseout 服务**

Create: `data-agent-server/data_agent_server/app/services/round_closeout.py`

```python
"""round 终态 → 权益结算（consume / release / 产物判定转换）。"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from .entitlement_service import (
    EntitlementService,
    LedgerStateError,
)


class RoundCloseout:
    def __init__(self, entitlements: EntitlementService) -> None:
        self._entitlements = entitlements

    def closeout(
        self,
        *,
        user_id: UUID,
        round_id: UUID,
        terminal_status: str,
        source: str | None,
        has_report_product: bool,
        reserved_type: str | None = None,
    ) -> None:
        """终态结算。source=None 时从该任务 reserved 流水的 source 字段判定；api 走产物判定，web 直接结算。"""
        effective_source = source or self._entitlements.reserved_source(
            user_id=user_id, task_id=round_id, entitlement_type=reserved_type or "data_query"
        )
        if reserved_type is None:
            reserved_type = "data_query"
        if terminal_status in ("SUCCEEDED", "PARTIAL_SUCCESS"):
            if effective_source == "api":
                target = "research_report" if has_report_product else "data_query"
                if target != reserved_type:
                    self._entitlements.convert(
                        user_id=user_id,
                        task_id=round_id,
                        reserved_type=reserved_type,
                        target_type=target,
                    )
                    return
            try:
                self._entitlements.consume(
                    user_id=user_id, task_id=round_id, entitlement_type=reserved_type
                )
            except LedgerStateError:
                pass  # 无预留流水（direct_answer 等）时忽略
        elif terminal_status in ("FAILED", "CANCELLED"):
            try:
                self._entitlements.release(
                    user_id=user_id, task_id=round_id, entitlement_type=reserved_type
                )
            except LedgerStateError:
                pass
```

container.py 注册：`self.round_closeout = RoundCloseout(self.entitlements)`。

- [ ] **Step 4: executor 调用结算**

`round_executor.py` 在 `_fail_round` 成功写入 FAILED 后、以及各 SUCCEEDED/PARTIAL_SUCCESS 的 `guarded_transition` 之后、`finalize_cancellation` 调用之后，统一调用：

```python
    def _closeout_entitlement(self, record: RoundRecord, terminal: RoundStatus) -> None:
        if self._entitlements is None or self._round_closeout is None:
            return
        has_report = self._round_has_report_product(record.id)
        reserved_type = (
            "research_report"
            if getattr(record, "execution_mode", None) == "report"
            else "data_query"
        )
        # source 不传：RoundCloseout 从该任务 reserved 流水的 source 字段判定（api 走产物判定、web 直接结算），
        # 避免依赖 RoundRecord 上不存在的会话来源字段。
        self._round_closeout.closeout(
            user_id=record.user_id,
            round_id=record.id,
            terminal_status=terminal.value,
            source=None,
            has_report_product=has_report,
            reserved_type=reserved_type,
        )

    def _round_has_report_product(self, round_id: UUID) -> bool:
        """产物判定：执行步骤中存在 report.generate 且成功（PRD v1.2 §5.5.1）。"""
        context = self._repository.get_execution_context(round_id)
        steps = getattr(context, "steps", None) or ()
        return any(
            getattr(s, "capability", None) == "report.generate"
            and str(getattr(s, "status", "")) in ("SUCCESS", "StepStatus.SUCCESS")
            for s in steps
        )
```

`RoundExecutor.__init__` 增加 `round_closeout=None` 参数；container.py 传入。

- [ ] **Step 5: 运行确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_round_entitlement_closeout.py tests/test_round_executor.py -v`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/services/round_closeout.py data_agent_server/app/services/round_executor.py data_agent_server/app/services/container.py tests/test_round_entitlement_closeout.py
git commit -m "feat: settle entitlements on round terminal status with product adjudication"
```

---

### Task 17: whoami 连通测试端点

**Files:**
- Modify: `data-agent-server/data_agent_server/app/routers/api_external.py`
- Modify: `data-agent-server/tests/test_api_external.py`（追加）

- [ ] **Step 1: 写失败测试**

```python
# tests/test_api_external.py 追加
def test_whoami_returns_key_and_entitlements(client, external_key_headers):
    r = client.get("/api/v1/whoami", headers=external_key_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["key"]["scopes"]
    assert "entitlements" in body


def test_whoami_rejects_invalid_key(client):
    r = client.get("/api/v1/whoami", headers={"X-API-Key": "sk-invalid"})
    assert r.status_code == 401
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_api_external.py -v`
Expected: FAIL（404）

- [ ] **Step 3: 实现**

```python
# api_external.py 追加
@router.get("/v1/whoami")
def whoami(key: Annotated[ExternalApiKey, Depends(get_external_api_key)]):
    """零消耗连通测试：校验 Key 有效性并返回 scope 与权益快照。"""
    entitlements = getattr(bootstrap.services, "entitlements", None)
    summary = (
        entitlements.current_entitlements(user_id=key.user_id)
        if entitlements is not None
        else {"has_active_cycle": False}
    )
    return {
        "key": {
            "key_id": key.key_id,
            "name": key.name,
            "scopes": list(key.scopes),
        },
        "entitlements": summary,
    }
```

- [ ] **Step 4: 运行确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_api_external.py -v`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/routers/api_external.py tests/test_api_external.py
git commit -m "feat: add zero-cost whoami connectivity check endpoint"
```

---

### Task 18: PG 模式补齐（billing/entitlement 持久化路径）

**Files:**
- Modify: `data-agent-server/data_agent_server/app/persistence/entitlement_access.py`（cycle 更新类函数）
- Modify: `data-agent-server/data_agent_server/app/services/entitlement_service.py`（open_cycle PG 化、upgrade_active_cycle PG 化、list_cycles）
- Modify: `data-agent-server/data_agent_server/app/services/billing_service.py`（PG 模式 orders CRUD）
- Modify: `data-agent-server/tests/integration/test_entitlement_pg.py`（追加）

- [ ] **Step 1: 写失败集成测试**

```python
# tests/integration/test_entitlement_pg.py 追加
def test_pg_upgrade_adjusts_remaining(service, active_user):
    now = utc_now()
    service.open_cycle_pg(
        user_id=active_user, plan_code="paid_basic", plan_name="基础版",
        data_query_quota=80, research_report_quota=8,
        starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=29),
        kind="purchased", status="active",
    )
    task_id = uuid4()
    service.reserve(
        user_id=active_user, entitlement_type="data_query", task_id=task_id,
        task_kind="standard_query", source="web", idempotency_key="pg-up-1",
    )
    service.consume(user_id=active_user, task_id=task_id, entitlement_type="data_query")
    service.upgrade_active_cycle(
        user_id=active_user, plan_code="paid_advanced", plan_name="高级版",
        data_query_quota=220, research_report_quota=22,
    )
    summary = service.current_entitlements(user_id=active_user)
    assert summary["plan_code"] == "paid_advanced"
    assert summary["data_query_remaining"] == 219  # 220 - 已消耗 1
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/integration/test_entitlement_pg.py -v`
Expected: FAIL（open_cycle_pg / upgrade_active_cycle 未实现）

- [ ] **Step 3: 实现 PG 路径**

- `entitlement_service.py` 增加 `open_cycle_pg`（委托 `entitlement_access.pg_open_cycle`，plan_id 按 plan_code 查 plans 表；trial 周期 plan_id 为 NULL、snapshot 存体验套餐信息）。
- `upgrade_active_cycle` PG 分支：`pg_cycle_upgrade`（UPDATE plan_snapshot/plan_code/quota，remaining = max(0, new_quota - consumed_count)，consumed 由 ledger 统计）。
- `list_cycles`：内存遍历 / PG 查询，返回 status 排序（active 优先）。
- `billing_service.py` PG 模式：create_order 写入 orders 表（幂等键冲突返回已有订单）、confirm_payment/fulfill 更新状态并在 fulfill 时调用 entitlements 持久化路径；`list_all_orders` / `list_orders` 走 SQL。
- 集成测试使用 tests/integration/conftest.py 现有的 `test_pool` fixture（无 db_pool/db_user）；测试用户直接 SQL 插入（参照 Task 6 的 `active_user` fixture 写法）。

- [ ] **Step 4: 运行确认通过**

Run: `cd data-agent-server && python -m pytest tests/integration/test_entitlement_pg.py -v`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/persistence/entitlement_access.py data_agent_server/app/services/entitlement_service.py data_agent_server/app/services/billing_service.py tests/integration/test_entitlement_pg.py
git commit -m "feat: complete PostgreSQL paths for cycles, upgrades and orders"
```

---

## 阶段 P4：前端接真实数据（Task 19-26）

### Task 19: 费用页接真实数据（套餐与账单 + 权益明细）

**Files:**
- Create: `data-agent-console/lib/agent-api/billing.ts`
- Modify: `data-agent-console/components/alice-shell.tsx`（删除 BILLING_* mock 常量，接 API）
- Create: `data-agent-console/tests/component/alice-shell-billing.test.tsx`

- [ ] **Step 1: 写 API client**

```ts
// data-agent-console/lib/agent-api/billing.ts
export type BillingSummary = {
  has_active_cycle: boolean;
  plan_code: string | null;
  plan_name: string | null;
  cycle_status: string | null;
  kind: string | null;
  starts_at: string | null;
  ends_at: string | null;
  data_query_remaining: number;
  research_report_remaining: number;
};

export type LedgerItem = {
  id: string;
  entitlement_type: "data_query" | "research_report";
  delta: number;
  source: "web" | "api";
  event_type: "grant" | "reserve" | "consume" | "release" | "expire" | "adjust";
  task_kind: string | null;
  created_at: string;
};

export type BillingOrder = {
  id: string;
  order_no: string;
  order_type: "new" | "renew" | "upgrade";
  plan_snapshot: { code: string; name: string; sale_price_cents: number };
  amount_cents: number;
  billing_cycle: string;
  status: "created" | "paid" | "fulfilled" | "closed";
  created_at: string;
};

export type UserPlanSpec = {
  code: string;
  name: string;
  billing_cycle: string;
  catalog_price_cents: number;
  sale_price_cents: number;
  campaign_label: string | null;
  data_query_quota: number;
  research_report_quota: number;
};

async function billingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await platformAgent.withFreshToken();
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`billing ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function fetchBillingSummary(): Promise<BillingSummary> {
  return billingFetch<BillingSummary>("/api/billing/summary");
}

export function fetchEntitlementLedger(params: {
  page: number;
  page_size?: number;
  entitlement_type?: string;
}): Promise<{ items: LedgerItem[]; total: number; page: number; page_size: number }> {
  const qs = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.page_size ?? 10),
  });
  if (params.entitlement_type) qs.set("entitlement_type", params.entitlement_type);
  return billingFetch(`/api/billing/ledger?${qs.toString()}`);
}

export function fetchBillingOrders(): Promise<{ orders: BillingOrder[] }> {
  return billingFetch("/api/billing/orders");
}

export function fetchUserPlans(): Promise<{ plans: UserPlanSpec[] }> {
  return billingFetch("/api/billing/plans");
}

export function createBillingOrder(payload: {
  order_type: "new" | "renew" | "upgrade";
  plan_code: string;
  billing_cycle: string;
  idempotency_key: string;
}): Promise<{ order: BillingOrder }> {
  return billingFetch("/api/billing/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
```

（顶部 import 自 `@/lib/agent-api/client` 现有导出：`apiUrl`、`platformAgent`，参照 chat-rounds.ts 的写法。）

- [ ] **Step 2: alice-shell 接真数据**

在 `alice-shell.tsx`：
1. 删除 `BILLING_PLANS`/`BILLING_BENEFITS`/`BILLING_LEDGER`/`BILLING_ORDERS` 四个 mock 常量（139-160 行）。
2. 新增 state：`billingSummary`、`ledgerPage`、`ledgerItems`、`ledgerTotal`、`orders`、`planSpecs`；`useEffect` 加载 summary/orders/plans；ledger 视图按 `ledgerPage` 懒加载 10 条（每次切换/滚动加载下一页，替换 BILLING_LEDGER.map）。
3. 套餐与账单视图（1954-1976 行区域）：
   - 套餐名 = `billingSummary.plan_name`，余额卡 = `data_query_remaining`/`research_report_remaining`，到期时间 = `ends_at` 格式化。
   - 明细表行 = ledgerItems 字段映射：时间=created_at、权益=entitlement_type==="data_query"?"数据查询":"调研报告"、事项=task_kind 映射（standard_query→标准数据查询、research_report→调研报告、cycle_expiry→周期到期、grant→套餐发放）、类型=event_type 映射（grant→发放、reserve/consume→消耗、release→返还、expire→过期、adjust→调整）、变动=`${delta>0?"+":""}${delta}`、余额列删除（账本不再预存逐行余额，PRD §6.5 字段中"该权益余额"改为由行内累计计算：从 summary 当前余额倒推逐行余额并展示）。
   - 加载更多按钮：`ledgerItems.length < ledgerTotal` 时显示，点击 `ledgerPage+1` 追加。
4. 订单记录视图：`orders.map` 替换 BILLING_ORDERS.map，金额 = `(amount_cents/100).toFixed(2)`，状态映射 created→待付款、paid→待开通、fulfilled→已开通、closed→已关闭。
5. 套餐选择视图：`planSpecs` 按 billing_cycle 过滤三档；价格 = sale_price_cents/100；折扣 Tag 在 `catalog_price_cents > sale_price_cents` 时显示（`省 X%`）；选中态与底部应付金额沿用现有交互，金额取所选 spec。
6. 账户菜单顶部余额区（1474-1483 行）：`data_query_remaining`/`research_report_remaining` 替换硬编码 65/7，`80/8` 上限改为「剩余 X 次」显示（无上限展示或从 plan snapshot 取 quota——一期 summary 不返回 quota，改为只显示剩余次数）。

- [ ] **Step 3: 组件测试**

```tsx
// data-agent-console/tests/component/alice-shell-billing.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AliceShell } from "@/components/alice-shell";

vi.mock("@/lib/agent-api/billing", () => ({
  fetchBillingSummary: vi.fn().mockResolvedValue({
    has_active_cycle: true,
    plan_code: "paid_basic",
    plan_name: "基础版",
    cycle_status: "active",
    kind: "purchased",
    starts_at: "2026-08-01T00:00:00Z",
    ends_at: "2026-09-01T00:00:00Z",
    data_query_remaining: 65,
    research_report_remaining: 7,
  }),
  fetchEntitlementLedger: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 }),
  fetchBillingOrders: vi.fn().mockResolvedValue({ orders: [] }),
  fetchUserPlans: vi.fn().mockResolvedValue({ plans: [] }),
  createBillingOrder: vi.fn(),
}));

describe("AliceShell 费用视图", () => {
  beforeEach(() => vi.clearAllMocks());

  it("展示真实余额", async () => {
    render(<AliceShell currentPath="/" />);
    expect(await screen.findByText("65")).toBeTruthy();
    expect(await screen.findByText("7")).toBeTruthy();
  });
});
```

Run: `cd data-agent-console && npm run test:component`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
cd data-agent-console
git add lib/agent-api/billing.ts components/alice-shell.tsx tests/component/alice-shell-billing.test.tsx
git commit -m "feat: replace billing mock data with real API data"
```

---

### Task 20: 订单创建与人工开通形态

**Files:**
- Modify: `data-agent-console/components/alice-shell.tsx`（支付弹窗 → 创建订单 + 付款指引）

- [ ] **Step 1: 改造支付弹窗**

删除静态二维码 `<img src="/assets/payment-qr.png" ...>` 与 `billingPaymentMethod` 切换逻辑。点击「继续支付」后：

```tsx
const [creatingOrder, setCreatingOrder] = useState(false);
const [createdOrder, setCreatedOrder] = useState<BillingOrder | null>(null);

async function handleCreateOrder() {
  setCreatingOrder(true);
  try {
    const { order } = await createBillingOrder({
      order_type: orderType, // 由选择上下文判定：无 active 周期= new；有 active 且选基础版= renew；选高级版且当前基础版= upgrade
      plan_code: selectedPlanCode,
      billing_cycle: billingCycle,
      idempotency_key: crypto.randomUUID(),
    });
    setCreatedOrder(order);
  } finally {
    setCreatingOrder(false);
  }
}
```

弹窗内容改为：订单号、应付金额（`¥{amount_cents/100}`）、付款指引文案（「请按以下金额完成付款，付款后联系客服或等待运营确认开通」）、状态「待开通」。订单列表视图同步刷新（重新 fetchBillingOrders）。

- [ ] **Step 2: 组件测试更新**

在 `alice-shell-billing.test.tsx` 追加：点击「继续支付」→ `createBillingOrder` 被调用 → 弹窗显示订单号与「待开通」。

Run: `cd data-agent-console && npm run test:component`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
cd data-agent-console
git add components/alice-shell.tsx tests/component/alice-shell-billing.test.tsx
git commit -m "feat: replace payment dialog with manual order creation flow"
```

---

### Task 21: 权益不足引导

**Files:**
- Modify: `data-agent-console/components/agent-workspace/platform-session-agent-workspace.tsx`（round 错误分支）
- Modify: `data-agent-console/components/alice-shell.tsx`（暴露打开费用弹窗的方式）

- [ ] **Step 1: 实现引导**

`platform-session-agent-workspace.tsx` 中 round 错误展示分支（`roundController.error` 渲染处）追加：

```tsx
{roundController.error?.errorCode === "entitlement_insufficient" && (
  <div className="...">
    <p>当前套餐权益不足</p>
    <button onClick={() => router.push("/plans")}>购买或升级套餐</button>
  </div>
)}
```

`/plans` 页（plan-billing-workspace.tsx 占位）改为渲染一个引导组件，或直接复用 AliceShell 打开费用弹窗的入口（把 `/plans` 的占位文案改为「打开费用」按钮，点击后跳转触发 AliceShell 的费用弹窗——实现方式：AliceShell 读取 `?billing=1` 查询参数自动打开费用弹窗）。

- [ ] **Step 2: 组件测试**

Create: `data-agent-console/tests/component/entitlement-insufficient-banner.test.tsx`——mock roundController.error 为 entitlement_insufficient，断言渲染引导文案与按钮。

Run: `cd data-agent-console && npm run test:component`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
cd data-agent-console
git add components/agent-workspace/platform-session-agent-workspace.tsx components/plan-billing-workspace.tsx tests/component/entitlement-insufficient-banner.test.tsx
git commit -m "feat: guide users to purchase when entitlement is insufficient"
```

---

### Task 22: 个人资料持久化

**Files:**
- Create: `data-agent-server/data_agent_server/app/routers/api_profile.py`
- Modify: `data-agent-server/data_agent_server/app/services/identity_service.py`（update_profile）
- Modify: `data-agent-server/data_agent_server/app/routers/api.py`
- Create: `data-agent-server/tests/test_api_profile.py`
- Modify: `data-agent-console/components/alice-shell.tsx`（profileName/avatarColor 接 API）
- Create: `data-agent-console/lib/agent-api/profile.ts`

- [ ] **Step 1: 后端失败测试**

```python
# data-agent-server/tests/test_api_profile.py
def test_patch_profile_updates_display_name(client, auth_headers):
    r = client.patch(
        "/api/user/profile",
        headers=auth_headers,
        json={"display_name": "小明", "avatar_color": "#3b82f6"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["display_name"] == "小明"
    assert body["avatar_color"] == "#3b82f6"


def test_get_profile_returns_fields(client, auth_headers):
    r = client.get("/api/user/profile", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "email" in body and "phone" in body and "uuid" in body
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_api_profile.py -v`
Expected: FAIL（404）

- [ ] **Step 3: 实现后端**

`identity_service.py` 追加：

```python
    def update_profile(
        self, user_id: UUID, *, display_name: str | None = None, avatar_color: str | None = None
    ) -> User | None:
        if self._pool:
            with self._pool.connection() as conn:
                row = pg.pg_update_user_profile(
                    conn, user_id, display_name=display_name, avatar_color=avatar_color
                )
                conn.commit()
            return _user_from_row(row) if row else None
        with self._lock:
            user = self._users_by_id.get(user_id)
            if user is None:
                return None
            if display_name is not None:
                user.display_name = display_name
            if avatar_color is not None:
                user.avatar_color = avatar_color
            return user
```

（`service_support/domain_models.py` 的 User dataclass 增加 `display_name: str | None = None`、`avatar_color: str | None = None`；pg_access 增加 `pg_update_user_profile`，`_user_from_row`（identity_service.py 内部）映射新列；pg_fetch_user_row_* 的 SELECT 增加两列。）

`api_profile.py`：

```python
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..bootstrap import services
from ..dependencies import AuthUser, get_current_user

router = APIRouter(tags=["user-profile"])


class ProfilePatchRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    avatar_color: str | None = Field(default=None, max_length=16)


@router.get("/user/profile")
def get_profile(user: AuthUser = Depends(get_current_user)):
    full = services.identity.get_user_by_id(user.id)
    return {
        "username": full.username if full else user.username,
        "display_name": getattr(full, "display_name", None) if full else None,
        "avatar_color": getattr(full, "avatar_color", None) if full else None,
        "email": getattr(full, "email", None) if full else None,
        "phone": getattr(full, "phone", None) if full else None,
        "uuid": str(user.id),
    }


@router.patch("/user/profile")
def patch_profile(payload: ProfilePatchRequest, user: AuthUser = Depends(get_current_user)):
    updated = services.identity.update_profile(
        user.id,
        display_name=payload.display_name,
        avatar_color=payload.avatar_color,
    )
    return {
        "display_name": getattr(updated, "display_name", None) if updated else None,
        "avatar_color": getattr(updated, "avatar_color", None) if updated else None,
        "uuid": str(user.id),
    }
```

`api.py` 注册 `api_profile_router`。

- [ ] **Step 4: 运行确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_api_profile.py -v`
Expected: PASS。

- [ ] **Step 5: 前端接线**

`lib/agent-api/profile.ts`：

```ts
export async function fetchProfile(): Promise<{
  display_name: string | null;
  avatar_color: string | null;
  email: string | null;
  phone: string | null;
  uuid: string;
}> { /* billingFetch 同款封装，路径 /api/user/profile */ }

export async function patchProfile(payload: {
  display_name?: string;
  avatar_color?: string;
}): Promise<{ display_name: string | null; avatar_color: string | null }> {
  /* PATCH /api/user/profile */
}
```

`alice-shell.tsx`：
- `profileName`/`avatarColor` 初始值从 `fetchProfile()` 加载（useEffect）。
- 名称编辑「完成」与头像色点击时调用 `patchProfile`，成功后更新 state；失败 Toast 提示重试。
- 个人资料区新增手机号行（「手机号」+ phone 或 「未绑定」）。
- `accountDisplayName` 优先 display_name（服务端持久化值），替换原 localStorage 逻辑读取（保留 session.ts 现有逻辑作为未登录兜底不适用，直接以 profile API 为准）。

- [ ] **Step 6: 组件测试**

在 `alice-shell-billing.test.tsx` 同目录追加 `alice-shell-profile.test.tsx`：mock profile API，断言编辑名称后 patchProfile 被调用、手机号展示。

Run: `cd data-agent-console && npm run test:component`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/routers/api_profile.py data_agent_server/app/routers/api.py data_agent_server/app/services/identity_service.py data_agent_server/app/persistence/pg_access.py tests/test_api_profile.py
git commit -m "feat: add user profile get and patch endpoints"
cd ../data-agent-console
git add lib/agent-api/profile.ts components/alice-shell.tsx tests/component/alice-shell-profile.test.tsx
git commit -m "feat: persist profile name and avatar color via API"
```

---

### Task 23: 反馈真提交

**Files:**
- Modify: `data-agent-server/data_agent_server/app/routers/api_public.py`（POST /feedback 改认证 + 服务端填字段）
- Modify: `data-agent-server/tests/test_api_public.py`（更新）
- Modify: `data-agent-console/components/alice-shell.tsx`（真提交 + 富文本）
- Modify: `data-agent-console/lib/agent-api/profile.ts` 或新建 `feedback.ts`

- [ ] **Step 1: 后端失败测试**

```python
# tests/test_api_public.py 追加/替换
def test_submit_feedback_requires_auth(client):
    r = client.post("/api/feedback", json={"message": "x", "page_path": "/"})
    assert r.status_code == 401


def test_submit_feedback_attaches_account(client, auth_headers):
    r = client.post(
        "/api/feedback",
        headers=auth_headers,
        json={"message": "测试反馈", "page_path": "/agent", "client_version": "1.0.0"},
    )
    assert r.status_code == 200, r.text
    row_id = r.json()["id"]
    # 通过 admin 端点验证服务端自动附加的字段
    listed = client.get("/api/admin/feedback", headers=auth_headers).json()
    entry = next(item for item in listed["feedback"] if item["id"] == row_id)
    assert entry["user_id"] is not None
    assert entry["user_uuid"] is not None
```

- [ ] **Step 2: 运行确认失败**

Run: `cd data-agent-server && python -m pytest tests/test_api_public.py -v`
Expected: FAIL（401 不成立 / user_uuid 缺失）

- [ ] **Step 3: 改造端点**

`api_public.py` 的 `create_feedback` 改为：

```python
@router.post("/feedback")
def create_feedback(
    payload: FeedbackCreateRequest,
    request: Request,
    user: AuthUser = Depends(get_current_user),
):
    if not services._pool:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database not configured",
        )
    user_agent = request.headers.get("user-agent", "")
    with services._pool.connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO feedback_entries (
                id, user_id, user_uuid, message, page_path,
                context_type, context_id, client_version, user_agent
            )
            VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id::text AS id
            """,
            (
                user.id,
                user.id,
                payload.message,
                payload.page_path,
                payload.context_type,
                payload.context_id,
                payload.client_version,
                user_agent,
            ),
        )
        row = cur.fetchone()
        conn.commit()
    return {"id": row[0]}
```

`FeedbackCreateRequest` 字段 `app_version` 更名为 `client_version`。`admin_feedback.py` 列表返回增加 `user_id`/`user_uuid` 字段。

- [ ] **Step 4: 运行确认通过**

Run: `cd data-agent-server && python -m pytest tests/test_api_public.py tests/test_admin.py -v`
Expected: PASS。

- [ ] **Step 5: 前端真提交 + 富文本**

`alice-shell.tsx` 反馈弹窗：
- `onClick={() => setFeedbackSubmitted(true)}` 替换为真实提交：

```tsx
const [submittingFeedback, setSubmittingFeedback] = useState(false);
const [feedbackError, setFeedbackError] = useState(false);

async function handleSubmitFeedback() {
  setSubmittingFeedback(true);
  setFeedbackError(false);
  try {
    await submitFeedback({
      message: feedbackContent,
      page_path: pathname ?? "/",
      client_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    });
    setFeedbackSubmitted(true);
  } catch {
    setFeedbackError(true); // 保留输入内容并提示重试
  } finally {
    setSubmittingFeedback(false);
  }
}
```

- textarea 保留（一期富文本以「支持多行文本 + 保留内容重试」为验收口径，弹窗中不引入编辑器依赖）；失败时展示重试提示行。
- 新建 `lib/agent-api/feedback.ts` 提供 `submitFeedback`（POST /api/feedback，带 freshToken）。

- [ ] **Step 6: 组件测试**

Create: `data-agent-console/tests/component/feedback-dialog.test.tsx`——mock submitFeedback 成功与失败两条路径：成功显示「感谢你的反馈」；失败保留输入内容并显示重试提示。

Run: `cd data-agent-console && npm run test:component`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
cd data-agent-server
git add data_agent_server/app/routers/api_public.py data_agent_server/app/routers/admin_feedback.py tests/test_api_public.py
git commit -m "feat: attach account context to feedback submissions"
cd ../data-agent-console
git add components/alice-shell.tsx lib/agent-api/feedback.ts tests/component/feedback-dialog.test.tsx
git commit -m "feat: wire feedback dialog to real API with retry on failure"
```

---

### Task 24: 连通测试按钮（API&Skills）

**Files:**
- Modify: `data-agent-console/components/api-key-settings-workspace.tsx`
- Create: `data-agent-console/tests/component/api-key-connectivity.test.tsx`

- [ ] **Step 1: 实现按钮**

在 api-key-settings-workspace.tsx 的 Key 列表项或顶部工具区追加「连通测试」按钮：

```tsx
const [testResult, setTestResult] = useState<null | "ok" | "fail">(null);

async function runConnectivityTest(key: ExternalApiKeyItem) {
  setTestResult(null);
  try {
    const response = await fetch(`${OPEN_API_BASE_URL}/v1/whoami`, {
      headers: { "X-API-Key": key.keyId }, // 实际用 key 明文不可行——whoami 需要完整 Key
    });
    setTestResult(response.ok ? "ok" : "fail");
  } catch {
    setTestResult("fail");
  }
}
```

注意：whoami 需要完整 Key 明文，而明文只在创建时展示一次。连通测试的正确实现是**在「创建成功弹窗」内提供测试按钮**（此时持有明文），测试通过后引导用户保存；列表页不提供测试（避免提示用户重新粘贴 Key）。调整：创建成功弹窗中追加「测试连通」按钮，用明文 Key 调 whoami，展示结果。

- [ ] **Step 2: 组件测试**

```tsx
// data-agent-console/tests/component/api-key-connectivity.test.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiKeySettingsWorkspace } from "@/components/api-key-settings-workspace";

vi.mock("@/lib/agent-api/client", () => ({
  apiUrl: (path: string) => `http://test.local${path}`,
  platformAgent: {
    withFreshToken: vi.fn().mockResolvedValue("test-token"),
  },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("API Key 连通测试", () => {
  it("创建成功后弹窗内可测试连通并展示成功", async () => {
    // 列表为空 + 创建成功返回明文 Key
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          key_id: "key-1",
          name: "测试 Key",
          key_prefix: "alice",
          key_last4: "abcd",
          scopes: ["bulk.run", "run.read", "bundle.download"],
          api_key: "alice_live_plaintext_key_abcd",
        }),
      });

    render(<ApiKeySettingsWorkspace />);
    fireEvent.change(await screen.findByLabelText("Key 名称"), {
      target: { value: "测试 Key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    const testButton = await screen.findByRole("button", { name: "测试连通" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ key: { key_id: "key-1", name: "测试 Key" }, entitlements: { has_active_cycle: true } }),
    });
    fireEvent.click(testButton);

    await waitFor(() => expect(screen.getByText("连通正常")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/whoami"),
      expect.objectContaining({ headers: expect.objectContaining({ "X-API-Key": "alice_live_plaintext_key_abcd" }) }),
    );
  });
});
```

Run: `cd data-agent-console && npm run test:component`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
cd data-agent-console
git add components/api-key-settings-workspace.tsx tests/component/api-key-connectivity.test.tsx
git commit -m "feat: add zero-cost connectivity test in key creation dialog"
```

---

## 阶段 P5：E2E 与验收（Task 25-26）

### Task 25: E2E 验收场景（Playwright）

**Files:**
- Create: `data-agent-console/tests/e2e/alice-phase1.spec.ts`

- [ ] **Step 1: 编写 E2E 场景（对照 PRD §11 验收清单）**

```ts
// data-agent-console/tests/e2e/alice-phase1.spec.ts
import { expect, test } from "@playwright/test";

test.describe("Alice 一期验收", () => {
  test("注册即发放体验额度，费用页可见余额", async ({ page }) => {
    // 注册新用户（短信验证码在 dev 环境通过 X-Debug-Email-Code 或直连注册）
    // → 打开账户菜单 → 断言「数据查询剩余 5 次 / 调研报告剩余 1 次」
  });

  test("API&Skills：创建 Key 一次性展示并连通测试成功", async ({ page }) => {
    // 登录 → /settings/api-keys → 创建 Key → 弹窗内「测试连通」→ 断言「连通正常」
  });

  test("报告模式创建 round 扣减调研报告权益", async ({ page }) => {
    // 登录 → agent 工作区 → 切换「报告模式」→ 提交任务 → 费用页断言报告余额 -1
  });

  test("权益不足时外部 API 返回 402", async ({ request }) => {
    // 新用户无周期，直接 POST /api/v1/runs 结构化请求 → 断言 402 entitlement_insufficient
  });

  test("人工开通全链路", async ({ page }) => {
    // 用户创建订单 → 管理员登录后台 /admin/orders → 确认收款 → 开通
    // → 用户费用页断言余额 = 套餐额度
  });

  test("个人中心名称与头像色持久化", async ({ page }) => {
    // 修改名称与头像色 → 刷新页面 → 断言保持
  });

  test("反馈自动携带定位信息", async ({ page }) => {
    // 提交反馈 → 后台 /admin/feedback 断言 user_uuid 与 page_path 存在
  });
});
```

（各场景按 tests/e2e 现有登录 fixture 模式编写，具体登录 helper 参照现有 spec。）

- [ ] **Step 2: 运行 E2E**

Run: `cd data-agent-console && npm run test:e2e -- alice-phase1`
Expected: 全部 PASS（本地需起 dev server + 后端 + PG）。

- [ ] **Step 3: Commit**

```bash
cd data-agent-console
git add tests/e2e/alice-phase1.spec.ts
git commit -m "test: add phase-1 acceptance E2E scenarios"
```

---

### Task 26: 验收清单核对与收尾

- [ ] **Step 1: 对照 PRD §11 逐项自检**

| 验收项 | 对应 Task |
| --- | --- |
| Key/OpenAPI/连通测试可访问，错误可区分 | T17、T24 |
| Web 与 API 同类请求扣同一类权益，报告模式正确 | T13-T16 |
| 外部 API task_type 与产物不一致按产物扣 | T16（convert/adjudication） |
| 注册发放体验额度，到期 expired | T11、T5 |
| 后台确认收款幂等开通 | T10、T8 |
| 新购/续订/升级/到期/异常符合状态规则 | T8、T5、T18 |
| 费用页两类余额、10 条懒加载、订单可查 | T19 |
| 个人中心名称/头像色持久化、手机号/UUID 可见 | T22 |
| 帮助文档站内、反馈自动携带定位信息 | T23（帮助文档保持现状） |
| Linkfox 消耗导入仅内部、UI 无积分 | T4（无用户侧 UI） |

- [ ] **Step 2: 全量回归**

Run: `cd data-agent-server && python -m pytest tests/ -v`
Expected: 全部 PASS（integration 依赖 PG 的用例在本地跑通）。

Run: `cd data-agent-console && npm run test:unit && npm run test:component && npm run test:e2e`
Expected: 全部 PASS。

Run: `cd data-agent-console && npm run lint`
Expected: 无错误。

- [ ] **Step 3: 更新 CLAUDE.md**

`data-agent-console/CLAUDE.md` 与根 CLAUDE.md 中过时内容修正：RBAC 章节标注「已移除（014/020 迁移），授权按 account type / can_use_tools 派生」；新增订阅/权益相关表与路由说明。

- [ ] **Step 4: Commit**

```bash
cd data-agent-server && git add -A && git commit -m "chore: phase-1 regression fixes"
cd ../data-agent-console && git add -A && git commit -m "chore: phase-1 regression fixes"
```

---

## 附录 A：新增/修改文件总览

**后端新增：**
- migrations/031-034
- services/entitlement_service.py、billing_service.py、round_closeout.py
- persistence/entitlement_access.py
- routers/api_billing.py、api_profile.py、admin_orders.py
- scripts/import-linkfox-costs.py

**后端修改：**
- services/container.py、identity_service.py、round_executor.py、external_api_service.py、chat_round_service.py
- persistence/chat_round_repository.py、pg_access.py
- routers/api.py、main.py、api_external.py、api_public.py、admin_plans.py、admin_feedback.py
- schemas.py、external_schemas.py、chat_round_schemas.py、service_support/chat_round_models.py

**前端新增：**
- app/(admin)/admin/orders/page.tsx
- components/admin-orders-workspace.tsx
- lib/agent-api/billing.ts、profile.ts、feedback.ts
- tests/e2e/alice-phase1.spec.ts + 组件测试若干

**前端修改：**
- components/alice-shell.tsx、api-key-settings-workspace.tsx、task-composer.tsx、admin-shell.tsx、plan-billing-workspace.tsx
- components/agent-workspace/platform-session-agent-workspace.tsx
- lib/agent-api/chat-rounds.ts

## 附录 B：错误码与消息约定

| 场景 | HTTP | code | 用户可见提示 |
| --- | --- | --- | --- |
| 外部 API 权益不足 | 402 | `entitlement_insufficient` | 额度不足，请购买或升级套餐 |
| Web round 权益不足 | round FAILED | `entitlement_insufficient` | 当前套餐权益不足，请购买或升级套餐后重试 |
| 未登录调用反馈 | 401 | — | 请先登录 |
| 订单未付款即开通 | 409 | — | 订单未确认收款，无法开通 |

## 附录 C：PRD §10 指标数据来源

一期不建报表系统，五类指标均从既有表统计（运营侧 SQL/后台查询）：

| 指标类型 | 数据来源 |
| --- | --- |
| 接入（Key 创建率/连通测试） | external_api_keys（创建）+ 连通测试行为埋点于 whoami 调用日志 |
| 付费（订单创建/开通转化/升级/续订） | orders（status 流转时间戳） |
| 使用（使用率/权益不足率/返还率） | entitlement_ledger（event_type 计数：consume/release/adjust + reserve 失败日志） |
| 成本（毛利率/成本偏差） | linkfox_daily_costs × 套餐消耗对照（entitlement_ledger） |
| 支持（反馈响应时长/UUID 定位） | feedback_entries（status 流转 + user_uuid 命中） |
