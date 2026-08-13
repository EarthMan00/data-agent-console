# Alice 测评集 v4

## 目的

这份测评集不再用一个总分笼统判断 Alice 好不好，而是回答一个更具体的问题：

> Alice 能否把跨境电商用户的问题推进到可用决策、可用产物或真实动作？

因此每条用例都必须能被客观验收：

- 用户原本要完成什么业务闭环。
- Alice 最终交付了什么。
- 证据在哪里。
- 如果失败，失败属于输入、模型、工具、报告生成还是动作落库。

机器可读版本是 [alice-evaluation-set-v4.json](</Users/sensen/Documents/New project 2/Data-Agent/data-agent-console/docs/alice-evaluation-set-v4.json>)。

## 分层

| 层级 | 数量 | 目的 | 是否依赖外部数据 |
| --- | ---: | --- | --- |
| capability_fixed_input | 20 | 只测 Alice 的理解、推理、综合和边界判断 | 否 |
| toolchain_isolation | 16 | 单独测采集、报告、收藏、监控等链路 | 是 |
| dialogue_and_boundary | 12 | 测模糊输入、缺失输入、过度承诺和边界处理 | 否 |
| real_task_e2e | 12 | 模拟真实用户任务，测端到端闭环 | 是 |

## 评分口径

- `success`：完成用户原始业务闭环，并有可见证据，例如决策结论、数据表、报告入口、收藏记录、监控任务。
- `partial`：没有完成原任务，但正确识别缺失输入、外部阻塞或风险边界，并给出下一步。
- `fail`：没有可用结果、任务错位、虚构数据、空会话、工具错误未解释、报告空壳、动作没有落库证据。

## 失败归因

本集合固定使用这些失败归因：

- `input_missing_or_ambiguous`
- `agent_understanding_or_planning`
- `reasoning_or_synthesis`
- `external_data_auth_or_quota`
- `external_data_no_result`
- `tool_orchestration`
- `report_generation`
- `persistent_action_not_created`
- `unsupported_or_risky_request_boundary`
- `empty_or_unobservable_session`

## 使用方式

1. 运行时只复制 JSON 里的 `input_query` 字段，不要把用例 ID、层级、说明文字带入 Alice。
2. 每条保存 `sessionId`、最终 UI 状态、是否有结果入口、是否有报告、是否有动作落库证据。
3. 计分时先按层级分别统计，再看总览。不要把工具额度失败和模型能力失败混成一个失败率。
4. 对 `capability_fixed_input`，Alice 如果调用外部采集或声称实时采集，直接按失败或降级处理。
5. 对 `toolchain_isolation`，外部服务失败不等于模型失败，但必须被记录为工具链失败。
6. 对 `dialogue_and_boundary`，成功不是生成报告，而是正确收敛问题、拒绝过度承诺或要求必要输入。
7. 对 `real_task_e2e`，只有最终业务闭环完成才算 success。

## Review 结论

这份 v4 比上一轮更能达到目标，原因是它把“Alice 能力”和“系统链路可靠性”拆开了。

上一轮最大的问题是失败混杂：外部数据额度、API Key、输入载荷缺失、报告生成失败、监控落库失败都被放进同一个结果池。这样能暴露问题，但不能稳定判断 Alice 到底弱在哪里。

v4 的改进点：

- 固定输入能力题可以在不依赖外部服务的情况下验证 Alice 是否会分析。
- 工具链题专门暴露采集、报告、收藏、监控是否稳定。
- 对话边界题把“该追问时追问”变成可评分能力。
- 真实任务题保留端到端业务闭环，用来评估真实用户价值。
- 每条都有 `expected_closure` 和 `success_evidence`，能减少感性判断。
- 每条有 `primary_failure_attribution`，后续可以直接统计根因。

仍然不足：

- 涉及外部平台的事实正确性，需要稳定数据源或人工抽样复核，否则只能判断是否完成闭环，不能完全判断数据是否真。
- 真实任务题数量只有 12 条，适合回归和方向判断，不足以覆盖所有跨境品类。
- 收藏、监控、报告生成这类动作必须有 UI 或后台证据，否则不能算成功。
- 如果继续用当前线上账号跑，额度或鉴权问题仍会影响端到端通过率；这应该归因到工具链，不应混成模型能力。

## 是否达到预期

可以达到“避开感性判断”的第一阶段目标。

它不能单独证明 Alice 已经能规模化解决所有跨境问题，但可以把结果拆成四个可决策指标：

- 固定输入能力成功率：Alice 会不会分析。
- 工具链成功率：系统能不能取数、生成报告、创建动作。
- 对话边界成功率：Alice 会不会在缺信息或高风险时正确停住。
- 真实任务闭环率：用户真实问题最终有没有被解决。

这四个指标比单一 success/fail 更能指导下一步迭代。
