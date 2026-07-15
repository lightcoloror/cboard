# Communication Support 跨端契约 v1

- 更新时间：`2026-07-16 00:11:32`
- 执行工具 / 模型：`Codex (GPT-5)`
- 状态：实现与验证完成；提交状态以 Git 历史为准

## 变动 1：BoardDTO / TileDTO v1

- 意图：把 CBoard 内部 board/tile 对象转换成 Web、微信及未来客户端都能消费的稳定边界。
- 决策：新增 `dto.js`，使用 `dtoType + version: 1`，提供创建、断言和按固定网格顺序读取 Tile 的纯函数。
- 理由：直接把 Redux/domain 对象暴露给每个平台会把 UI、国际化和历史字段一起耦合出去；版本化 DTO 才能演进和迁移。
- 证据：`dto.test.js` 覆盖 CBoard 原始字段、固定 grid 顺序、中性/历史匹配元数据、快照隔离、重复 id 和未来版本拒绝。
- 生效范围：`src/common/communicationSupport/dto.js` 及跨端消费者；现有 Board reducer 和组件数据结构不变。

### BoardDTO v1

| 字段          | 约束                              | 用途       |
| ------------- | --------------------------------- | ---------- |
| `dtoType`     | 固定 `BoardDTO`                   | 运行时识别 |
| `version`     | 固定 `1`                          | 契约迁移   |
| `id` / `name` | 非空字符串                        | 身份与显示 |
| `category`    | 字符串，可空                      | 沟通分类   |
| `layout`      | `rows`、`columns`、有序 `tileIds` | 跨端网格   |
| `tiles`       | 唯一 id 的 `TileDTO[]`            | 图卡集合   |

### TileDTO v1

| 字段                        | 约束                                | 用途                  |
| --------------------------- | ----------------------------------- | --------------------- |
| `dtoType` / `version`       | `TileDTO` / `1`                     | 运行时识别与迁移      |
| `id` / `boardId` / `label`  | 非空字符串                          | 图卡身份、归属、显示  |
| `vocalization`              | 字符串，缺省回退 `label`            | 语音边界              |
| `image` / `backgroundColor` | 字符串                              | 跨端展示              |
| `keyPath` / `loadBoardId`   | 字符串，可空                        | 历史输出和 board 跳转 |
| `communication`             | synonyms / excludeTokens / category | 文字匹配提示          |

## 变动 2：Expression pipeline contract v1

- 意图：让微信端调用一条明确、可版本控制的表达管线，而不是猜测 Web 组件内部 state。
- 决策：新增 `createExpressionPipelineInput`、`runExpressionPipeline` 和 `EXPRESSION_PIPELINE_CONTRACT_VERSION = 1`；旧 `buildExpressionLoopState(output, count)` 保留为兼容包装。
- 理由：显式输入输出允许新平台复用纯逻辑，同时不迫使现有 CBoard 组件同步重构。
- 证据：`expressionPipeline.test.js` 验证版本、不可变 output 快照、候选句、选择、收藏/历史输出及不支持版本拒绝。
- 生效范围：Communication Support 表达侧和微信 PoC；Receiver pipeline 不变。

## 变动 3：表达版本随历史保存

- 意图：恢复历史表达时知道它来自哪一版表达契约。
- 决策：新表达 saved phrase/history 带 `contractVersion: 1`，storage normalization 仅在来源存在该字段时保留，旧数据不被强制改写。
- 理由：既要支持未来迁移，也要保持现有无版本 Tuyujia/CBoard 数据兼容。
- 证据：`localData.test.js` 验证 expression output、candidate sentences 和 contract version 往返不丢失。
- 生效范围：新确认的 express history；receive history 与旧记录的字段形状保持兼容。

## 跨端边界

允许复用：DTO、expression/receiver pipeline、phrase suggestions、storage normalization、repository、注入式 adapters。

禁止直接迁移：React DOM 组件、Material UI、Redux 容器、浏览器全局对象、完整 Web Board UI。平台 API 必须停在 adapter 层。

## 变动 4：DTO 反序列化一致性

- 意图：确保微信端或其他客户端读取序列化 DTO 时，不能接受归属错误、重复顺序或容量不足的板快照。
- 决策：收紧 TileDTO 与 BoardDTO 运行时断言；校验字符串字段、Tile 唯一性、Tile.boardId、layout.tileIds 完整唯一性及网格容量。
- 理由：创建函数生成正确对象并不代表外部输入可靠；跨端边界必须在反序列化入口拒绝结构上看似合法但语义不一致的数据。
- 证据：dto.test.js 新增重复顺序、错误 boardId 和网格容量不足回归，均被 assertBoardDTO 拒绝。
- 生效范围：只影响 DTO v1 外部断言；不改变 CBoard Redux board、默认板或 createBoardDTO 的正常输出。

## 变动 5：浏览器存储运行时安全降级

- 意图：在隐私模式、存储权限撤销或浏览器运行时抛出 SecurityError/QuotaError 时保持沟通界面可操作。
- 决策：browser storage adapter 的 get/set/remove 分别捕获运行时异常；读取回退 null，写入和删除安全 no-op。
- 理由：只在 adapter 创建时探测 localStorage 不够，浏览器可能在实际方法调用时才拒绝访问。
- 证据：storagePorts.test.js 使用三个会抛异常的方法验证读取返回 null 且写入、删除不向上抛错。
- 生效范围：仅浏览器 storage port；repository、微信 storage port 和云端 settings 行为不变。

## 推送前验证

- 复核时间：2026-07-16 00:11:32
- 执行工具 / 模型：Codex (GPT-5)
- 聚合回归：31 suites / 114 tests / 3 snapshots 通过。
- communicationSupport、CommunicationSupport UI 与 Tuyujia 兼容层 ESLint 通过。
