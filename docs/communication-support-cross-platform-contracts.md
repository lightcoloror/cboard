# Communication Support 跨端契约 v1

- 更新时间：`2026-07-26 17:38:30`
- 执行工具 / 模型：`Codex (GPT-5)`
- 状态：v1 基础已进入当前分支；本轮接收端跨端扩展尚未提交或推送

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

## 变动 6：接收匹配器解除 Web helper 耦合

- 意图：让 `receiverPipeline` 能被微信等非 Web 客户端直接编译，而不隐式带入 CBoard 完整默认板数据。
- 决策：新增纯函数 `resolvers.js`，`symbolMatching.js` 改为从同目录读取 board/tile 名称解析函数，不再导入 `src/helpers.js`。
- 理由：`src/helpers.js` 顶层导入 `boards.json` 与 PicSeePal，跨端只复用两个解析函数时不应承担这部分依赖和体积。
- 证据：微信边界脚本显式禁止 `../../helpers` 与 `src/api/boards.json`，并扫描 receiver 的全部 15 个核心依赖；生产构建通过。
- 生效范围：Communication Support 接收匹配核心及新跨端消费者；CBoard Web helper 的公开调用与默认板加载行为不变。

## 变动 7：TileDTO v1 可直接参与图文匹配

- 意图：确保 DTO 序列化之后仍能使用已验证的同义词、排除词与语义域优化。
- 决策：`getCommunicationTileMetadata` 在中性扁平键和旧 Tuyujia 键之后，兼容读取 `TileDTO.communication` 的数组和分类字段。
- 理由：DTO v1 使用嵌套 communication 对象，若 matcher 只认识 Web 原对象，跨端会静默丢失匹配优化。
- 证据：`tileMetadata.test.js` 验证数组规范化；`symbolMatching.test.js` 验证 DTO 同义词命中且不依赖 Web helper。
- 生效范围：metadata adapter 与接收 matcher；原 board/tile schema、字段优先级和 TileEditor 写入方式不变。

## 变动 8：无 Intl 环境的照护词分词

- 意图：在不提供 `Intl.Segmenter` 的微信 JS 环境中，仍正确识别“需要休息”等常用照护表达。
- 决策：字符分词回退表新增“需+要”和“休+息”合并；有 Intl 的现有路径不变。
- 理由：逐字回退会把可匹配的完整概念拆散，导致无意义的漏配；这是平台能力差异，不应由 UI 补救。
- 证据：`segmentation.test.js` 临时移除 `Intl.Segmenter` 后验证输出为 `['需要', '休息']`。
- 生效范围：中文字符回退路径；不改变 Intl 分词结果、词典内容或候选排序。

## 本轮跨端接收验证

- 验证时间：`2026-07-16 10:19:03`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard 核心、Web Communication Support、Tuyujia 包装层、Settings、TileEditor 与 Board：`31 suites / 117 tests / 3 snapshots` 通过。
- CBoard 新增/修改核心 ESLint `--no-cache` 通过。
- 微信 PoC：TypeScript、ESLint、`3 files / 8 tests`、`18 app files + 15 core files` 边界扫描通过。
- 微信生产构建：Taro/Webpack `Compiled successfully`，真实编译 receiver pipeline 与 WeChat storage adapter。
## 推送前验证

- 复核时间：2026-07-16 00:11:32
- 执行工具 / 模型：Codex (GPT-5)
- 聚合回归：31 suites / 114 tests / 3 snapshots 通过。
- communicationSupport、CommunicationSupport UI 与 Tuyujia 兼容层 ESLint 通过。

## 变动 9：接收端两阶段记录与本地纠错证据

- 意图：落实图语家 ADR-001 的“匹配后草稿、全屏后确认”，避免普通历史混入未真正展示给患者的接收结果。
- 决策：共享核心新增 `receiverLifecycle.js`；repository 使用独立 keys 保存 receiver records、corrections、patientId 和 workspaceId。Web 与微信在匹配后创建草稿，替换/删除/重排时更新草稿并记事件，全屏展示时把同一记录改为 confirmed 并加入普通历史。确认后继续编辑会开启新草稿，不修改已确认记录。
- 理由：草稿和纠错有维护价值但隐私敏感；用户可见历史只应包含完成沟通的结果。独立本地 keys 也防止这些高频事件被误塞入 Settings 云同步。
- 证据：生命周期与 repository 单测、Web 接收组件测试、微信 repository 恢复测试、两端生产构建全部通过；微信边界扫描已把 `receiverLifecycle.js` 纳入纯核心检查。
- 生效范围：Communication Support 共享核心、CBoard Web 接收端和微信 PoC；不新增 API，不同步草稿/纠错，不改变 CBoard Board/Tile。

## 2026-07-16 生命周期切片验证

- 验证时间：`2026-07-16 21:09:17`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard 定向生命周期与组件测试：`4 suites / 14 tests` 通过。
- CBoard Communication Support、Tuyujia、Settings、TileEditor 聚合回归：`32 suites / 122 tests / 3 snapshots` 通过。
- CBoard 本轮相关 ESLint `--no-cache` 通过。
- CBoard 生产 build 与 service worker 生成通过。
- 微信 PoC：TypeScript、ESLint、边界扫描通过；边界为 `23 app files + 16 core files`。
- 微信 PoC Vitest：`5 files / 15 tests` 通过。
- 微信生产 build：Taro/Webpack `Compiled successfully`。

## 变动 10：未匹配 token 本地证据链

- 意图：落实图语家 ADR-001 与 #19/#57/#62，使接收端无法匹配的词在一次交互后仍可供照护者维护词库。
- 决策：共享核心新增 `missingTokens.js` 和独立 repository key；按 `normalizedToken` 聚合出现次数，保存场景、最多 5 条原句、本地匿名 patient/workspace identity。Web 与微信均在本地 matcher 完成后写入，且不进入 Settings/API。
- 理由：#61 的照护者维护队列必须先有可恢复证据；缺词记录隐私敏感，存储失败也不能阻断图片 review、纠错或全屏展示。
- 证据：纯函数、repository 和 Web 失败降级测试通过；微信 repository 经 storage adapter 重建后可恢复并继续累计同一缺词。
- 生效范围：Communication Support 共享核心、CBoard Web 接收端、微信 PoC 与微信 storage adapter；该持久化切片当时不包含维护 UI，现由变动 11 补齐；仍不包含云同步。

## 2026-07-16 缺词持久化切片验证

- 验证时间：`2026-07-16 21:32:02`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard 定向：`3 suites / 11 tests`；聚合回归：`35 suites / 129 tests / 3 snapshots`。
- CBoard 本轮相关 ESLint 与生产 build 通过；service worker 生成 `977 resources / 41.1 MB`。
- 微信 PoC：TypeScript、ESLint、`24 app files + 17 core files` 边界扫描通过。
- 微信 PoC Vitest：`6 files / 16 tests`；Taro/Webpack production build 通过。

## 变动 11：照护者缺图维护闭环

- 意图：落实图语家 #19/#61，让持续记录的未匹配词真正进入照护者可处理的维护流程，并在后续接收中复用人工判断。
- 决策：共享核心增加 `new / ignored / resolved` 审核转换和人工关联回放；Web 与微信接收理解模式均展示缺图队列，支持查看次数与最近原句、忽略、恢复，以及关联现有 CBoard 图卡。`resolvedPictogramId` 必须指向当前图卡目录中的真实 Tile，失效 id 安全回退为未匹配。
- 理由：只把状态改成“已解决”不能改善沟通结果；把缺词稳定关联到现有 CBoard Tile，才能继续完整复用 Board/Tile 内容体系，同时避免建立第二套图片库或把技术错误暴露给患者。
- 证据：`missingTokens.test.js` 验证审核转换、必填图卡 id 和失效关联回退；repository 测试验证 Web/微信 storage 重建后仍保留处理结果；receiver pipeline/session 测试验证相同词下次以 `manual` 命中；两端 UI 测试或生产编译覆盖队列入口。
- 生效范围：共享 `missingTokens`/repository/receiver pipeline、CBoard Web Communication Support 接收页、微信 PoC 接收理解页和本机平台 storage；不影响患者表达页，不新增 API、账号、云同步、在线补图或 AI 学习。

## 2026-07-16 缺图维护切片验证

- 验证时间：`2026-07-16 23:36:14`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard Communication Support、Tuyujia、Settings、TileEditor 与 Board 聚合回归：`36 suites / 137 tests / 3 snapshots` 通过。
- CBoard 本轮相关 ESLint 与生产 build 通过；service worker 生成 `977 resources / 41.1 MB`。
- 微信 PoC：TypeScript、ESLint、`25 app files + 17 core files` 边界扫描通过。
- 微信 PoC Vitest：`6 files / 18 tests`；Taro/Webpack production build `Compiled successfully`。

## 变动 12：中性 repository schema v1 与安全升级

- 意图：落实图语家 #35/#58，在继续增加接收数据前，为 CBoard Web 与微信实际使用的 key-value repository 建立可验证的版本边界、旧数据升级和损坏数据恢复路径。
- 决策：新增 `cboard_communication_repository_schema` 元数据并固定 `schemaVersion: 1`；repository 创建时幂等迁移。未版本化的中性键与旧 Tuyujia 常用语/历史键合并规范化，接收草稿、纠错、缺词和合法匿名 identity 原样保留；损坏 JSON、错误数组形状和非法 identity 被安全修复，元数据只记录修复键名。检测到更高的未来版本时允许读取当前可识别内容，但拒绝降级和写穿。
- 理由：目标底座没有使用图语家 Dexie schema，机械复制 v4→v5 迁移会引入第二数据库；同时仅靠宽松 `JSON.parse` 回退无法证明升级幂等、有效数据不丢失或未来版本不被旧客户端覆盖。
- 证据：`repository.migration.test.js` 覆盖全新安装、未版本化多键合并、当前版本损坏值修复、匿名身份保留/重建、重复初始化无写入和未来版本只读；微信 migration test 使用 `getStorageSync` 返回对象/数组的真实 adapter 形态验证同一契约。
- 生效范围：Communication Support 中性 repository、浏览器 storage port 与微信 storage adapter；不修改原图语家 Dexie、不新增 IndexedDB、API、Settings 云同步或隐私原文备份。

## 2026-07-16 repository 升级切片验证

- 验证时间：`2026-07-16 23:57:51`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard migration 定向：`1 suite / 4 tests`；Communication Support、Tuyujia、Settings、TileEditor 与 Board 聚合回归：`37 suites / 141 tests / 3 snapshots`。
- CBoard repository/migration ESLint 与生产 build 通过；service worker 生成 `977 resources / 41.1 MB`。
- 微信 PoC：TypeScript、ESLint、`26 app files + 17 core files` 边界扫描通过。
- 微信 PoC Vitest：`7 files / 19 tests`；Taro/Webpack production build `Compiled successfully`。

## 变动 13：跨方向本地会话与确认轮次上下文

- 意图：落实图语家 #31/#63，让患者表达与照护者接收不再各自生成孤立记录，并为未来可选上下文适配器提供可审计的确认轮次。
- 决策：新增平台无关 `conversationSession.js` 契约和 `cboard_communication_active_session` 本地键；表达历史与接收草稿自动复用同一 session，连续 30 分钟无操作后自动换新，Web 与微信均提供“新对话”手动入口。上下文只包含当前 session 的表达记录及 `recordStatus: confirmed` 接收记录；草稿、纠错和缺词维护数据全部排除。微信恢复表达时也只读取当前 session。
- 理由：没有统一会话就无法可靠重建双向对话；把草稿或维护日志放进上下文会把未确认内容误当成患者已经看过的信息。纯本地可选契约可先固化数据边界，同时避免在当前阶段引入 LLM、网络或第二套存储。
- 证据：`conversationSession.test.js`、`repository.conversationSession.test.js` 验证 30 分钟边界、跨方向共享、确认过滤、手动重置和历史保留；Web 组件测试验证入口清空当前输出但不删历史；微信 session/repository 测试验证同一契约和当前 session 恢复。两端完整回归、Lint、边界扫描和生产构建均通过。
- 生效范围：Communication Support 纯核心、CBoard Web Communication Support、微信 PoC 及浏览器/微信本机 storage；不新增 API、云同步、LLM 调用、在线 AI、登录或原图语家 Dexie 写入。已确认历史仍沿用既有 Settings 策略，上下文构建函数本身不发起网络请求。

## 2026-07-17 会话与上下文切片验证

- 验证时间：`2026-07-17 08:00:04`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard 定向：`5 suites / 20 tests`；Communication Support、Tuyujia、Settings、TileEditor 与 Board 聚合回归：`39 suites / 147 tests / 3 snapshots`。
- CBoard 本轮相关 ESLint 与生产 build 通过；service worker 生成 `977 resources / 41.1 MB`。
- 微信 PoC：TypeScript、ESLint、`26 app files + 18 core files` 边界扫描通过。
- 微信 PoC Vitest：`7 files / 21 tests`；Taro/Webpack production build `Compiled successfully`。

## 变动 14：生产 PWA 离线沟通验收门

- 意图：落实图语家 #32/#33/#65/#68，用真实生产构建证明断网后仍能打开 CBoard 默认板并完成患者表达、照护者接收和本地历史恢复，而不是把单测或 build 成功当成离线可用。
- 决策：新增仅服务 `build/` 的 Node 静态服务器、独立 `playwright.offline.config.ts` 和生产离线 Playwright 用例；用例拦截全部非本机 HTTP 请求，等待真实 Service Worker 控制页面后切断浏览器网络，覆盖默认板数据匹配、接收全屏确认、患者候选表达、同会话双向历史、“新对话”和再次离线刷新。同步修复 `registerServiceWorker()` 在页面 `load` 已发生后调用时永不注册的问题：页面已完成则立即注册，否则只监听一次 `load`。
- 理由：开发服务器、API 登录用例和 jsdom 都不能证明生产 Service Worker 已注册，也不能证明 41.1 MB 预缓存完成后断网仍可沟通；测试首轮真实卡在 `navigator.serviceWorker.ready`，证实晚注册缺口会直接阻断 #65，不能在 E2E 中人工派发 `load` 掩盖。
- 证据：`serviceWorkerRegistration.test.js` 的 2 条时序测试通过；Communication Support、Tuyujia、TileEditor、Settings、Board 和 Service Worker 定向回归为 `40 suites / 149 tests / 3 snapshots`；`npm run build` 编译成功并生成 `977 resources / 41.1 MB` 的 Service Worker；`npm run test:e2e:offline` 在所有非本机请求被阻断且浏览器进入 offline 后，生产双向沟通用例 `1 passed`，核心流程耗时 `5.3s`。
- 生效范围：CBoard Web 生产 PWA 的 Service Worker 注册时序、独立本机生产验收服务器和离线自动化 gate；不改变缓存清单、Board/Tile、matcher、repository、API 或 Settings 语义，不新增登录、云同步、AI、麦克风或支付。该证据不替代移动端、微信开发者工具和真机验收。

## 2026-07-17 生产离线验收切片验证

- 验证时间：`2026-07-17 08:49:27`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard 定向回归：`40 suites / 149 tests / 3 snapshots` 通过。
- CBoard production build：`Compiled successfully`；Service Worker 为 `977 resources / 41.1 MB`。
- CBoard production offline E2E：`1 passed`；断网后 app shell、默认板 matcher、接收全屏确认、患者表达、双向历史、新对话和离线刷新恢复通过。
- 微信 PoC 本轮未改动；既有 `7 files / 21 tests`、边界扫描和 production build 证据继续有效，但微信 UI E2E 与真机断网验收仍未完成。

## 变动 15：微信消费者 UI/storage 自动化前置门

- 意图：在不把 React DOM、Material UI 或 Web 页面带入微信的前提下，验证共享表达/接收核心经 Taro 事件和微信 storage adapter 后仍能形成真实页面闭环。
- 决策：微信 PoC 使用测试专用 `miniprogram-automator`，按稳定文案完成患者图卡点选、保存/重启恢复、接收匹配、独立结果页、同会话双向历史和新对话；Windows 兼容仅位于微信测试脚本，不修改本目录共享核心。普通命令不自动开启微信开发者工具服务端口，显式一次性入口才接受官方安全确认。
- 理由：纯核心单测与 production build 不能证明 WXML 事件和平台 storage；同时开发者工具 CLI 的硬编码 `3799` 位于本机 TCP 排除区间，而修改系统端口、微信安装文件或静默开启安全设置都具有更大影响。
- 证据：微信脚本 Node 语法、TypeScript、ESLint、`7 files / 21 tests`、`26 app / 18 core` 边界及 Taro production build 通过。CLI 已越过 Node 22 `.bat` 与 `3799 EACCES`，目前停在官方 `IDE service port disabled` 确认；因持久化安全设置未获用户明确授权，UI E2E 尚未进入页面，不得标为通过。
- 生效范围：`cboard-wechat-poc` 的 devDependency、测试脚本和验收文档；不改变 CBoard DTO、matcher、repository、Web UI、API 或 production bundle，也不替代微信真机触控、横竖屏、系统断网和 TTS 验收。

## 2026-07-17 微信自动化前置门验证

- 验证时间：`2026-07-17 09:35:12`
- 执行工具 / 模型：`Codex (GPT-5)`
- 微信 PoC：TypeScript、ESLint、`7 files / 21 tests`、`26 app files + 18 CBoard core files` 边界扫描通过。
- 微信 production build：Taro/Webpack `Compiled successfully`，约 `3.91s`。
- 微信 UI E2E：实现已完成，运行未通过；当前唯一已确认前置条件是用户明确授权开启开发者工具 localhost 服务端口。
- 真机：未执行；TTS 仍为 unavailable port。

## 变动 16：CBoard Web 患者优先入口与独立接收边界

- 意图：落实图语家 #6，把 CBoard 成熟图板继续作为患者主界面，同时避免双向沟通工具默认展开后挤压 Board、Navbar 和 Tile。
- 决策：真实 Board 默认只显示“患者表达 / 接收理解 / 紧急求助 / 照护工具”紧凑入口；患者表达按需在 Board 上方展开，接收理解进入独立 Material UI 全屏 Dialog，照护设置与历史默认隐藏在次级入口，紧急求助始终保留为一级入口。`initiallyExpanded` 只用于显式集成和测试，不改变真实 Board 的紧凑默认值。
- 理由：患者需要先看到熟悉图卡；照护者的文字输入、分词复核、缺图维护和历史管理不能继续与患者图板同时堆叠。独立接收边界还能在关闭时卸载语音识别流程，同时继续复用原有 `ReceiverLoopPanel`、matcher、repository 和 CBoard SpeechProvider。
- 证据：新增 `CommunicationReceiverDialog.component.js` 与边界测试；主面板测试覆盖默认无表达/接收重组件、患者入口展开、接收全屏打开、返回后卸载和语音停止。Communication Support 纯核心、组件及 Board 集成为 `45 suites / 326 tests` 全部通过；`npm run build` 编译成功并生成 `977 resources / 41.2 MB` Service Worker。生产离线 Playwright 在桌面 Chrome 与 Pixel 5 竖屏仿真均通过完整双向闭环，并实测患者表达、接收理解、紧急求助三个一级入口高度均不低于 44px。
- 生效范围：CBoard Web 中性 `CommunicationSupport` 布局、接收端呈现边界、响应式样式与测试；不修改表达管线、分词、匹配、默认 Board/Tile、存储、API、Settings 或图语家品牌包装层。Web/PWA 的 `41.2 MB` 离线预缓存不适用微信单包 2 MiB 规则；微信包体继续按官方《小程序性能优化指南》独立门禁：https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009

## 2026-07-18 CBoard Web 患者优先切片验证

- 验证时间：`2026-07-18 16:05:43`
- 执行工具 / 模型：`Codex (GPT-5)`
- 定向 UI：`2 suites / 17 tests` 通过。
- Communication Support 纯核心、全部组件和 Board 集成：`45 suites / 326 tests` 通过。
- CBoard production build：`Compiled successfully`；Service Worker 为 `977 resources / 41.2 MB`。
- CBoard production offline E2E：桌面 Chrome 与 Pixel 5 竖屏仿真 `2 passed`；断网 app shell、44px 一级入口、独立接收、匹配、全屏确认、患者表达、双向历史、新对话和离线刷新恢复通过。
- 尚未扩大结论：真实手机安全区、横屏、系统级触控和人工视觉验收仍待执行。

## 变动 17：五类接收纠错与人工插图闭环

- 意图：落实图语家 #26/#64，使照护者不只能替换、删除、排序和重分词，还能在任意词条后补入人工选择的 CBoard 图片，并为每次真实修改留下可复核证据。
- 决策：共享 `receiverPipeline.js` 新增平台无关插入操作，替换项标记 `source: corrected`，新增项标记 `source: manual`；`receiverLifecycle.js` 对 replace/delete/reorder/insert/resegment 五类事件保存单项索引、单项图片 ID 以及完整 `pictogramIdsBefore/After`。Web 和微信只消费同一纯核心，并分别在接收复核区提供“后加图片”入口。
- 理由：只有 UI 按钮或单个 before/after ID 都不足以重放一次序列编辑；完整前后序列才能支持审计和后续质量分析。纠错日志与学习规则职责不同，本切片继续固定 `isUsedForLearning: false`，不让未经设计的评分自动改变后续匹配。
- 证据：CBoard 定向 `4 suites / 20 tests`、Communication Support 与 Board 集成 `45 suites / 329 tests`、production build 和桌面/Pixel 5 离线 E2E `2 passed`；微信 Vitest `21 files / 82 tests`、TypeScript、ESLint、`74 app / 18 core` 边界与 production build 通过。微信未压缩主包 `292,760 B`、沟通分包 `1,389,749 B`；官方 `auto_preview` 成功推送总计 `1,681,074 B`、主包 `318,305 B`、沟通分包 `1,362,769 B`。官方性能依据：https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009
- 生效范围：CBoard Web 与微信接收复核、共享 receiver pipeline/lifecycle、微信 TypeScript 契约及本地纠错 repository；不改变 Board/Tile、普通历史、Settings、API 或云同步，不把纠错日志用于自动学习。
- 记录：Codex（GPT-5），2026-07-18 16:54:12。

## 2026-07-18 五类纠错切片验证

- 验证时间：`2026-07-18 16:54:12`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard：`45 suites / 329 tests`、production build、桌面 Chrome 与 Pixel 5 生产离线 E2E `2 passed`。
- 微信：`21 files / 82 tests`、TypeScript、ESLint、边界扫描、44 boards / 825 tiles / 775 images 包门及 production build 通过。
- 微信官方预览：`auto_preview` 成功，包体为 `318,305 B + 1,362,769 B = 1,681,074 B`。
- 微信模拟器边界：磁盘 `dist` 已包含新入口，但开发者工具刷新出现 `appLaunch with non-empty page stack` 并继续运行旧缓存模板；未清除用户本地数据，因此“后加图片”仍需在最新手机预览或干净模拟器实例完成触控验收。

## 变动 18：工作区本地纠错记忆

- 意图：落实图语家 #26 的最终决策，让照护者已经确认的换图和删除在同一工作区后续接收中立即生效，而不是只留下不可消费的审计日志。
- 决策：新增平台无关 `correctionMemory.js`，直接从本机追加式 `ReceiverCorrection` 派生 `workspace-local` 覆盖层。最新人工替换立即优先；删除形成 90 天 pictogram tombstone；同时计算 `frequencyCount × recencyWeight`，衰减半衰期为 30 天。默认 `isUsedForLearning: true`，Web 与微信均提供本会话关闭开关；插入、调序和重分词继续只做审计，不参与词语到图片学习。
- 理由：派生现有日志无需建立第二套数据库，也不会修改 CBoard 默认词典；按 `workspaceId` 过滤能阻止一个账号或家庭的修正变成全局规则。删除墓碑可避免错误图立即复活，而会话开关保留照护者对敏感或偶发修正的控制。
- 证据：CBoard 纠错记忆、生命周期、repository 与 UI 回归纳入完整 `46 suites / 334 tests`，production build 成功并生成 `977 resources / 41.2 MB` Service Worker；微信 `21 files / 83 tests`、TypeScript、ESLint、边界和 production build 通过。微信未压缩主包 `293,081 B`、沟通分包 `1,394,484 B`；官方 `auto_preview` 为主包 `318,619 B`、沟通分包 `1,364,012 B`、总计 `1,682,631 B`。
- 生效范围：CBoard Web 与微信接收端、共享 matcher/receiver pipeline/lifecycle、本机 correction repository 和 AI 重分词回落；不修改默认 Board/Tile，不上传原始纠错，不跨工作区，不新增 API 或全局学习。
- 记录：Codex（GPT-5），2026-07-18 17:42:58。

## 2026-07-18 工作区纠错记忆验证

- 验证时间：`2026-07-18 17:42:58`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard：`46 suites / 334 tests` 与 production build 通过。
- 微信：`21 files / 83 tests`、TypeScript、ESLint、`74 app / 18 core` 边界、44 boards / 825 tiles / 775 images 完整门和 production build 通过。
- 微信官方预览：`auto_preview` 成功，包体为 `318,619 B + 1,364,012 B = 1,682,631 B`，主包和沟通分包均低于官方 1.5 MiB 建议线。
- 模拟器边界：生产 `dist` 已包含学习开关和覆盖逻辑；开发者工具 DOM 仍读取旧模板缓存。未执行清空全部缓存，故新开关触控等待手机最新预览复测，不把构建证据冒充真机 UI 证据。

## 变动 19：跨平台可选 AI 提供方与健康契约

- 意图：恢复原图语家的 OpenAI-compatible 配置，同时让 CBoard Web 和微信使用同一个可诊断、可降级且不泄露密钥的 AI 边界。
- 决策：`cboard-api` 提供方选择顺序为 OpenAI-compatible 优先、Azure OpenAI 回退；健康契约只暴露 configured、provider、model、baseUrl。前端只保存 API 地址和登录态，不保存提供方密钥；候选句和重分词都必须经用户确认，失败时回落共享本地管线。
- 理由：实时双向沟通需要短请求、限界上下文和确定性回落，不能直接耦合面向整板生成的 `cboard-ai-engine`；统一健康接口避免 Web 与微信复制配置判断，也避免把密钥发送到设备。
- 证据：API 提供方/控制器/路由定向 `19 passing`；CBoard `48 suites / 343 tests / 1 snapshot` 与 production build；微信 `21 files / 86 tests`、TypeScript、ESLint、`74 app / 18 core`、production build 和包体门通过。官方模拟器验证无 API 配置提示、检测后本地降级和 Console 无 error/fail。
- 生效范围：`cboard-api` AI helper/controller/health、CBoard Web Communication Support 设置、微信照护设置及两端候选句/重分词 port；不改变默认 Board/Tile、纠错记忆或离线 matcher，不包含真实部署、凭据、合法域名和上游模型验收。
- 记录：Codex（GPT-5），2026-07-18 20:40:35。

## 2026-07-18 AI 提供方与健康切片验证

- 验证时间：`2026-07-18 20:40:35`
- 执行工具 / 模型：`Codex (GPT-5)`
- `cboard-api`：定向 `19 passing`；完整 controllers 测试因本机 MongoDB 未运行而存在既有集成失败，不把定向结果扩写为全套通过。
- CBoard：`48 suites / 343 tests / 1 snapshot` 与 production build 通过，Service Worker 为 `977 resources / 41.2 MB`。
- 微信：`21 files / 86 tests`、TypeScript、ESLint、边界、production build 与主包 `293,081 B`、沟通分包 `1,397,537 B` 通过。
- 官方模拟器：无 API 配置提示和本地规则降级均可读，Console 无 error/fail；未执行预览、体验版上传或发布。

## 变动 20：工作区修正记忆可视化与可撤销边界

- 意图：让照护者理解哪些人工换图/删除正在影响未来匹配，并能停用错误规则，同时保留完整纠错审计。
- 决策：共享核心提供活动规则管理行和按 workspace/token 停用函数；repository 只覆盖规范化 correction 数组。Web 管理弹窗与微信独立接收页分别消费同一纯核心。停用只将 replace/delete 的 `isUsedForLearning` 改为 `false`，insert/reorder/resegment 和全部原始记录不删除。Web 管理目录必须复用接收端的个性化/可见 Board 集，并传入 `intl` 解析 `labelKey`。
- 理由：审计、管理展示和未来匹配是三个边界；用删除记录实现“忘记”会破坏追溯，用原始 Board 或无 `intl` 的目录则会把默认图块显示成技术 ID。
- 证据：定向 `3 suites / 27 tests`；既定 Communication Support 门 `49 suites / 349 tests / 2 snapshots`；production build 成功并生成 `977 resources / 41.2 MB` Service Worker；桌面 Chrome 与 Pixel 5 离线 E2E `2 passed`，确认“偏好图：是”、停用后规则消失、审计保留并恢复默认本地图。微信 `22 files / 87 tests`、TypeScript、ESLint、`76 app / 18 core`、production build、包体门和官方 Skill E2E 通过，原 storage 完整恢复。
- 生效范围：Communication Support 共享 correction memory/repository、CBoard Web 照护管理、微信独立接收管理和自动化；不修改默认 Board/Tile，不跨 workspace，不云同步 correction，不执行预览或发布。
- 记录：Codex（GPT-5），2026-07-18 21:31:42。

## 2026-07-18 修正记忆管理切片验证

- 验证时间：`2026-07-18 21:31:42`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard 定向：`3 suites / 27 tests`；既定沟通回归：`49 suites / 349 tests / 2 snapshots`。
- CBoard production build：`Compiled successfully`；Service Worker 为 `977 resources / 41.2 MB`。
- CBoard production offline E2E：桌面 Chrome 与 Pixel 5 `2 passed`。
- 微信：`22 files / 87 tests`、TypeScript、ESLint、`76 app / 18 core`、production build；未压缩主包 `293,081 B`、沟通分包 `1,402,290 B`。
- 微信官方 Skill：修正记忆展示、停用、审计保留、默认图恢复和 storage finally 恢复通过；未执行 `auto_preview`、体验版上传或发布。
- 质量依据：[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。

## 变动 21：Web 与微信共用网络状态语义

- 意图：消除 CBoard Web 与微信小程序各自维护“在线 / 离线 / 未知”判断和离线文案造成的漂移，让可选联网能力的降级边界成为可跨平台复用的 Communication Support 契约。
- 决策：在 CBoard 中性核心新增 `networkStatus.js`，统一规定显式 `isConnected` 优先于陈旧 `networkType`、`none` 表示离线、API 缺失或失败保持未知，并只在明确离线时返回能力边界文案。Web 使用独立 browser port 读取 `navigator.onLine`、订阅并精确解绑 `online/offline`；微信端保留 Taro adapter，但直接消费同一归一化函数和文案。Web 提示只进入照护工具与独立接收界面，不占患者图板首屏。
- 理由：纯业务语义应位于 CBoard 中性核心，DOM 和微信 API 必须留在各自 adapter；这样既不会把 React DOM / Material UI 搬进小程序，也不会让“API 调用失败”被误报成“设备断网”。患者首屏继续以图卡和表达操作为最高优先级。
- 证据：共享核心、browser port、Web 提示和既有面板定向 `4 suites / 27 tests`；完整 CBoard Communication Support 门 `52 suites / 362 tests / 3 snapshots`，production build 成功并生成 `977 resources / 41.2 MB` Service Worker。微信网络 port 定向 `1 file / 4 tests`，全量 `23 files / 91 tests`、TypeScript、ESLint、`80 app / 19 core` 边界、production build 与逐包门通过；官方 Skill 完整 E2E 再次通过患者表达、接收、人工插图、修正记忆、双向历史、个人图片和 13 项原 storage 恢复。
- 生效范围：CBoard Communication Support 中性网络契约、Web browser adapter/照护者 UI、微信网络 port/照护者 UI、类型契约和跨平台边界门；不发起网络请求，不改变 matcher、repository、语音或同步语义，不表示官方 Skill 已模拟 `wx.onNetworkStatusChange`，不表示手机真实断网 UI 已验收，不执行预览上传或发布。
- 记录：Codex（GPT-5），2026-07-19 00:34:55。

## 2026-07-19 跨端网络状态收口验证

- 验证时间：`2026-07-19 00:34:55`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard：定向 `4 suites / 27 tests`；既定沟通回归 `52 suites / 362 tests / 3 snapshots`；production build 为 `Compiled successfully`，Service Worker 为 `977 resources / 41.2 MB`。
- 微信：定向 `1 file / 4 tests`；全量 `23 files / 91 tests`、TypeScript、ESLint、`80 app / 19 core`、44 boards / 825 tiles / 775 images 和 production build 通过。
- 微信性能门：未压缩主包 `293,081 B`、沟通分包 `1,404,908 B`，均低于官方 1.5 MiB 建议线；775 张 CBoard 图片共 `953,152 B`，3 张紧急图完整，单媒体 200 KiB、压缩、按需注入、插件和组件使用检查均通过。依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 微信官方 Skill：完整本地 E2E PASS，finally 恢复 13 项原 storage；官方工具明确不能 mock 事件型 `wx.onNetworkStatusChange`，因此真实断网提示继续保留为设备验收项，未执行 `auto_preview`、体验版上传或发布。

## 变动 22：患者理解反馈成为 confirmed receive 子契约

- 意图：把接收展示从单向输出补成患者可反馈、照护者可追溯、两端可复用的双向闭环。
- 决策：中性核心新增 `receiverPatientFeedback.js`，只接受 `understood`、`not_understood`、`repeat_requested` 和 confirmed receive；保留 `confirmedAt`，维护单调 `updatedAt`、最新标量及最多 20 条事件。repository 同步更新接收记录、历史和活动会话；receiver sync 与 `cboard-api` 使用显式白名单。Web 与微信只负责各自 UI、TTS 和关闭行为。
- 理由：反馈类型、事件顺序和持久化属于平台无关业务契约；Material UI、Taro、浏览器语音和 WechatSI 属于平台 adapter。将两者分开才能完全复用 CBoard 核心，又不把技术栈耦合进小程序。
- 证据：共享规范化、追加、上限、非法状态和 repository 生命周期测试通过；API model/controller/route 为 `13 passing`。CBoard 中性回归 `53 suites / 369 tests / 3 snapshots` 与 production build 通过；微信 `23 files / 91 tests`、`80 app / 20 core`、production build 和官方 Skill E2E 通过，运行态事件为 `repeat_requested → understood` 且原 13 项 storage 恢复。
- 生效范围：Communication Support 中性核心、Web 接收展示、微信接收分包、确认记录同步和 API Swagger；不允许 draft 反馈，不上传纠错/缺词/设备私有图片，不修改 Board/Tile 或 Settings，不执行预览上传和发布。
- 记录：Codex（GPT-5），2026-07-19 01:39:33。

## 2026-07-19 患者理解反馈切片验证

- 验证时间：`2026-07-19 01:39:33`
- 执行工具 / 模型：`Codex (GPT-5)`
- API：model/controller/route 定向 `13 passing`；未把需要 MongoDB 的完整集成套件写成全绿。
- CBoard：中性相关 `53 suites / 369 tests / 3 snapshots` 与 production build通过；扩大旧 `Tuyujia` 包装层后为 `58/60 suites`、`386/388 tests`，两项为既有兼容断言债务。
- 微信：TypeScript、ESLint、Vitest `23 files / 91 tests`、`80 app / 20 core`、44 boards / 825 tiles / 775 images、production build 和逐包性能门通过；主包 `293,081 B`、沟通分包 `1,410,074 B`。
- 官方 Skill：首次因开发者工具旧编译缓存读取旧模板失败；只执行 `cleanCompileCache` 后同一完整 E2E PASS，反馈轨迹、全屏行为和 13 项 storage 恢复通过。未执行 `auto_preview`、体验版上传或发布。
- 质量依据：[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。

## 变动 23：患者反馈后的照护复核连续性

- 意图：在不牺牲独立患者展示页的前提下，让“没明白”真正返回可继续修改的照护工作台，并让反馈成为可读、可导出的沟通证据。
- 决策：共享核心提供反馈标签、照护提示和历史文本；微信 receiver session 提供 `ReceiverWorkspaceResumeState`，显式快照会话、原文、分词、复核序列、活动草稿和学习开关。患者页返回 `{ feedback, saved }`，父页面恢复快照；未修改的 confirmed receive 再次展示时复用同一记录。Web 和微信历史 UI 使用同一反馈文本 helper。
- 理由：患者页独立可以避免 CBoard 图板和接收图片堆叠，但组件卸载不能清空照护者工作。恢复隐藏 DOM 会重新耦合 UI，重复确认会污染历史，因此状态快照和记录复用必须成为明确契约。
- 证据：CBoard 反馈标签、历史导出和管理界面定向回归 `3 suites / 13 tests`，production build 成功并生成 `977 resources / 41.2 MB` Service Worker。微信 receiver session 恢复测试进入全量 `23 files / 92 tests`；TypeScript、ESLint、`80 app / 20 core` 边界、production build 和逐包门通过。官方 Skill E2E 验证事件 `repeat_requested → not_understood → understood`、`想喝水`、3 项复核/预览、照护提示、同一记录复用、历史反馈和 13 项 storage 恢复。
- 生效范围：Communication Support 反馈/历史纯核心、CBoard Web 历史管理、微信 receiver session/独立展示页/历史管理和自动化；恢复快照仅在当前页面生命周期内有效，不替代 repository 冷启动恢复，不修改 Board/Tile、matcher 或纠错学习，不执行预览上传与发布。
- 记录：Codex（GPT-5），2026-07-19 02:11:57。

## 2026-07-19 反馈后复核连续性切片验证

- 验证时间：`2026-07-19 02:11:57`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard：定向 `3 suites / 13 tests`；production build 为 `Compiled successfully`，Service Worker 为 `977 resources / 41.2 MB`。
- 微信：TypeScript、ESLint、Vitest `23 files / 92 tests`、`80 app / 20 core`、44 boards / 825 tiles / 775 images 和 production build 通过。
- 微信性能门：未压缩主包 `293,081 B`、沟通分包 `1,412,749 B`，775 张 CBoard 图片共 `953,152 B`；首次旧语法失败由门禁拦截，修复源码后未放宽门禁。依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 官方 Skill：完整 E2E PASS，覆盖患者重复、没明白、工作台恢复、再次展示、明白了、历史反馈和 finally 恢复 13 项原 storage；未执行 `auto_preview`、体验版上传或发布。

## 变动 24：接收恢复记录成为跨平台 repository 契约

- 意图：让 CBoard Web 与微信小程序在组件卸载、页面刷新和应用重开后采用同一条接收恢复规则，不把临时 React/Taro 状态当作唯一事实源。
- 决策：repository schema v4 新增恢复标记；每个 patient/workspace/session 只允许一个活动 draft。`loadResumableReceiverRecord` 优先返回活动草稿，仅在恢复标记指向 `not_understood` confirmed record 时返回已确认记录；`discardResumableReceiverRecord` 只由显式重新开始或理解完成触发。`restoreReceiverLoopState` 从已保存的 `pictogramSequence` 恢复 token、图片和来源，不调用 matcher。
- 理由：恢复语义、去重和反馈生命周期属于平台无关业务规则；React DOM、Material UI、Taro 和微信 storage 只应留在 adapter。直接恢复持久序列可以保留人工换图、顺序、插图、缺词占位和运行时图片。
- 证据：CBoard repository、pipeline 与 Web receiver 定向 `3 suites / 22 tests`；微信声明、session、repository 生命周期进入全量 `23 files / 94 tests`。官方 Skill E2E 通过活动草稿和“没明白”记录的两条 `reLaunch` 冷恢复、去重及 understood 清理，并恢复原 13 项 storage。
- 生效范围：Communication Support 中性 repository/pipeline、Web 接收面板、微信接收页和 storage adapter；不把恢复标记加入通用 Settings 或服务器同步，不改变默认 Board/Tile、matcher 和患者表达链。
- 记录：Codex（GPT-5），2026-07-19 03:55:42。

## 2026-07-19 接收冷恢复切片验证

- 验证时间：`2026-07-19 03:55:42`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard：定向 `3 suites / 22 tests` 通过。
- 微信：TypeScript、ESLint、Vitest `23 files / 94 tests`、`80 app / 20 core`、44 boards / 825 tiles / 775 images、production build 和逐包性能门通过。
- 微信性能门：主包 `293,081 B`、照护分包 `1,416,588 B`、图片总量 `953,152 B`，无 200 KiB 媒体违规；依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 官方 Skill：完整 E2E PASS，覆盖两条冷恢复路径、去重、理解状态清理和全部既有主链；finally 恢复 13 项原 storage。未执行 `auto_preview`、体验版上传或发布。

## 变动 25：设备私有缺词图符契约

- 意图：让 Web 与微信在公共目录无图时使用同一条人工本机图片规则，同时不把平台文件 API 或家庭照片带入 CBoard 中性核心。
- 决策：`buildDevicePrivateRuntimePictogram` 只接收缺词记录 ID、标签和本机图片引用，生成 provider/category 为 `device-private` 的运行时目录项；来源声明为“用户提供，仅限本机使用”，不能伪装成公共许可。`applyMissingTokenResolutions` 把它识别为 `manual`，在线运行图仍保持 `online`。Web 负责 Blob 压缩和 data URL，微信 adapter 负责 `chooseMedia/saveFile/removeSavedFile`。
- 理由：图符结构、来源 scope 和匹配类型属于平台无关契约；浏览器 Blob、微信文件路径和 UI 生命周期属于 adapter。两者分离才能复用 CBoard，又防止设备私图进入账号同步。
- 证据：runtime/missing-token 核心测试、Web 缺词组件和微信集成测试通过；CBoard 相关回归 `38 suites / 324 tests`，微信 `24 files / 95 tests`、`81 app / 21 core`。官方 Skill 实际保存、重用和删除微信文件，并恢复 13 项原 storage。
- 生效范围：CBoard Communication Support runtime pictogram/missing-token pipeline、Web 缺词维护、微信缺词队列和本地文件 adapter；不修改 CBoard 默认 Board/Tile，不进入 Settings 或 receiver sync，不实现公开上传和跨设备共享。
- 记录：Codex（GPT-5），2026-07-19 04:34:32。

## 2026-07-19 设备私有缺词图片切片验证

- 验证时间：`2026-07-19 04:34:32`
- 执行工具 / 模型：`Codex (GPT-5)`
- CBoard：共享核心与接收界面 `38 suites / 324 tests`，缺词组件 `6/6`，production build 成功；Service Worker 为 `977 resources / 41.2 MB`。
- 微信：TypeScript、ESLint、Vitest `24 files / 95 tests`、`81 app / 21 core`、44 boards / 825 tiles / 775 images、production build 和逐包门通过。
- 微信性能门：主包 `293,081 B`、照护分包 `1,419,332 B`、默认图片 `953,152 B`；无新增插件或打包媒体，继续低于官方 1.5 MiB 建议线。依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 官方 Skill：新增缺词私图段与全部旧回归 PASS，真实保存/读取/删除微信文件，finally 恢复原 13 项 storage；未执行预览、体验版上传或发布。

## 变动 26：浏览器语音输入只作为接收管线 adapter

- 意图：让 CBoard Web 恢复图语家已验证的照护者语音输入，同时保持“识别文字和分词由人最终修正”的核心约束。
- 决策：`browserSpeech.js` 只负责浏览器能力探测、开始/停止、临时文字、最终文字和错误映射；微信 WebView 禁用该 adapter。`ReceiverLoopPanel` 收到最终文字后复用原有 matcher、草稿、纠错、缺词和全屏展示链，输入框与分词框继续可编辑。不支持或授权失败时保留文字输入。
- 理由：浏览器 ASR 支持度和网络实现不一致，不能成为核心沟通前提；把识别限定为输入 adapter，才能避免复制业务核心并保证降级可用。
- 证据：定向 `2 suites / 13 tests`；完整 Communication Support `52 suites / 375 tests / 1 snapshot`；production build 成功并生成 `977 resources / 41.2 MB` Service Worker。新增回归覆盖语音最终文字、自动匹配、原文修改、人工分词和重新匹配。
- 生效范围：CBoard Web 浏览器照护者接收入口和测试契约；不采集或保存音频，不修改微信 ASR，不代表真实浏览器麦克风授权、断网 ASR 或识别准确率已经验收。
- 记录：Codex（GPT-5），2026-07-19 04:50:50。

## 2026-07-19 CBoard Web 语音输入可编辑闭环验证

- 验证时间：`2026-07-19 04:50:50`
- 执行工具 / 模型：`Codex (GPT-5)`
- 定向：`browserSpeech.test.js` 与 `ReceiverLoopPanel.component.test.js` 为 `2 suites / 13 tests`。
- 扩大回归：首次为 `51 passed / 1 failed`，唯一失败由组件测试 mock 缺少 `loadResumableReceiverRecord` 引起；补齐测试替身后 `52 suites / 375 tests / 1 snapshot` 全通过。
- 构建：`Compiled successfully`；Service Worker 为 `977 resources / 41.2 MB`。
- 边界：代码和 jsdom 已验证可编辑管线；真实 Chrome/Edge 麦克风权限、浏览器服务可用性与中文识别准确率仍需人工验收。

## 变动 27：微信在线图片搜索采用可组合平台端口

- 意图：让微信消费者复用 `cboard-api` 与 ARASAAC 既有实现，同时避免后端临时失败成为在线补图单点故障。
- 决策：平台无关业务核心继续只依赖 `PictogramSearchPort`；微信 adapter 层新增纯 fallback 组合，先调用 `cboard-api`，仅在失败时调用 ARASAAC 直连。候选缓存按可信来源路由，核心 matcher、缺词 repository 和人工确认规则不变。
- 理由：故障转移属于平台端口编排，不属于 Board/Tile、matcher 或 React UI；保持这一边界可以继续完整复用 CBoard 中性核心，也不会把微信请求 API 或服务端策略反向耦合进 Web。
- 证据：端口定向 `3 files / 14 tests`，微信全量 `25 files / 100 tests`、TypeScript、ESLint、`83 app / 21 core`、production build 与官方 Skill E2E 通过；`cboard-api` 图片 helper/route 为 `6 passing`。
- 生效范围：微信图片搜索 adapter 和照护设置文案；不修改 CBoard Web 运行时、默认 Board/Tile、AI provider 或 repository schema，不把真实外网、合法域名和真机缓存写成已通过。
- 记录：Codex（GPT-5），2026-07-19 05:09:20。

## 2026-07-19 微信在线补图容灾切片验证

- 验证时间：`2026-07-19 05:09:20`
- 执行工具 / 模型：`Codex (GPT-5)`
- 微信：定向 `3 files / 14 tests`，全量 `25 files / 100 tests`，TypeScript、ESLint、`83 app / 21 core`、44 boards / 825 tiles / 775 images 和 production build 通过。
- API：图片输入、英文回落、安全 ID、Swagger 路由和图片响应为 `6 passing`；恶意 ID 的 validator 日志是预期拒绝证据。
- 性能：主包 `293,081 B`、照护分包 `1,421,025 B`、图片 `953,152 B`，压缩、无依赖过滤、按需注入、插件/组件使用与 200 KiB 媒体门通过；依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 官方 Skill：登录有效且版本 `0.3.0` 一致，完整 E2E PASS 并恢复 13 项原 storage；未执行预览、体验版上传或发布。真实 HTTPS、合法域名、ARASAAC 外网与手机缓存仍待验收。

## 变动 28：微信账号 session 失败语义与云同步运行门

- 意图：让微信平台 adapter 在 storage 部分失败时保持明确未登录状态，并证明既有跨平台云同步契约能通过真实 Taro UI/请求/storage 生命周期运行。
- 决策：CBoard 中性 `settingsAdapter`、storage merge、receiver sync 和专用事件 API 不变；微信 `cboardSession` 负责 session/token 双写失败回滚与独立清理，官方 E2E 用假 API 验证登录、合并、鉴权、私图排除和退出。测试账号数据只存在于隔离 storage，默认构建自动恢复。
- 理由：session 持久化属于微信 adapter，Settings/confirmed receive 合并属于共享核心；分层修复可以避免把 Taro 或微信 storage 反向带入 CBoard Web，同时验证两层连接处不是纸面契约。
- 证据：微信定向 `3 files / 17 tests`、全量 `25 files / 102 tests`、TypeScript、ESLint、`83 app / 21 core`、production build 和官方 Skill E2E 通过；API confirmed receive controller/Swagger 为 `13 passing`。13 项原 storage 和默认构建均恢复，`dist` 不含假地址或令牌。
- 生效范围：微信 session adapter、账号同步 UI/E2E 与既有 CBoard settings/receiver sync 消费边界；不修改 CBoard Web 登录、默认 Board/Tile 或 repository schema，不声称真实账号服务器和多设备冲突已验证。
- 记录：Codex（GPT-5），2026-07-19 05:56:18。

## 2026-07-19 微信账号同步运行切片验证

- 验证时间：`2026-07-19 05:56:18`
- 执行工具 / 模型：`Codex (GPT-5)`
- 微信：session/account/cloud 定向 `3 files / 17 tests`，全量 `25 files / 102 tests`，TypeScript、ESLint、`83 app / 21 core` 和 production build 通过。
- API：confirmed receive 身份、字段白名单、draft/私有字段拒绝、反馈校验、tombstone 与删除边界为 `13 passing`。
- 官方 Skill：假 API 账号 E2E 与全部既有沟通链 PASS；验证 Bearer、远程常用语合并、私图不上传、退出保留历史和 13 项原 storage 恢复。未使用真实凭据或外网。
- 性能与恢复：假 API 分包 `1,421,168 B`，默认恢复后主包 `293,081 B`、照护分包 `1,421,096 B`，均低于官方 1.5 MiB 建议线；默认 `dist` 不含测试地址/令牌。未执行预览、体验版上传或发布。

## 变动 29：OpenSymbols 只作为服务端受控图片提供方

- 意图：复用原图语家的 OpenSymbols 补图能力，同时维持 CBoard Web、微信和服务端之间的密钥、许可与网络边界。
- 决策：`cboard-api` 在 ARASAAC 中文/英文均无结果后调用 OpenSymbols；`OPENSYMBOLS_SECRET` 只进入服务端 token 请求。候选必须来自 `arasaac / mulberry / sclera`，保留 repo、license、author 和来源 URL。客户端只获得同源 HMAC 图片代理地址，不能获得共享密钥、访问 token 或任意外部图片 URL。微信确认后保存为本机文件，撤销关联时回收该文件。
- 理由：提供方选择、共享密钥和外部 URL 验证属于服务端职责；来源/许可是跨平台图符契约；`Taro.saveFile/removeSavedFile` 是微信 adapter 职责。这样可复用同一 RuntimePictogram，又不把服务端凭据或微信 API带入中性核心。
- 证据：API `37 passing`；Web `communicationApi.test.js` `5/5`，相关 CBoard 回归合计 `54 suites / 384 tests / 3 snapshots`；微信 `25 files / 103 tests`、TypeScript、ESLint、边界和 production build 通过。官方 Skill 假 API E2E 验证 OpenSymbols/Mulberry 署名、人工确认、真实本机文件存在、恢复后文件删除、13 项 storage 与默认构建恢复。
- 生效范围：`cboard-api` 图片 provider/代理、CBoard Web API adapter、微信 PictogramSearchPort/缺词队列和自动化；不改变本地 matcher、默认 Board/Tile、AI、Settings 或 confirmed receive 同步，不表示真实 OpenSymbols 外网、HTTPS 部署、合法域名或手机网络已验收。
- 记录：Codex（GPT-5），2026-07-19 07:01:49。

## 2026-07-19 OpenSymbols 多图库切片验证

- 验证时间：`2026-07-19 07:01:49`
- 执行工具 / 模型：`Codex (GPT-5)`
- API：controllers/helper/Swagger `37 passing`；需要 MongoDB 的完整旧集成套件仍因本机 27017 未运行而不可作为全绿证据。
- CBoard：定向 `54 suites / 384 tests / 3 snapshots`；隔离 `BUILD_PATH` 且关闭被锁定的 webpack ESLint cache 后 production compile 成功。标准 `npm run build` 仍被 Windows 文件锁阻断，未冒充标准构建通过。
- 微信：Vitest `25 files / 103 tests`、TypeScript、ESLint、`83 app / 21 core`、44 boards / 825 tiles / 775 images 和 production build 通过；主包 `293,081 B`、照护分包 `1,421,593 B`，未新增插件/依赖/媒体。
- 官方 Skill：登录有效且版本 `0.3.0` 一致；完整假 API E2E PASS，覆盖 OpenSymbols 署名、确认、离线保存、恢复删除、账号同步、完整双向沟通和 13 项 storage 恢复；默认 `dist` 不含测试地址、令牌或 `OPENSYMBOLS_SECRET`。未执行预览、上传或发布。
- 质量依据：[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)、[OpenSymbols API 文档](https://www.opensymbols.org/api)。

## 变动 30：PictogramAttribution 成为可选跨平台图符契约

- 意图：让文字匹配到图片后，来源与许可继续跟随 TileDTO、运行时图符、接收预览、确认历史和患者全屏，而不是停留在搜索候选 UI。
- 决策：新增规范化 `PictogramAttribution`：`provider/originalId/name/license/licenseUrl/author/authorUrl/sourceUrl/repoKey`。公开 URL 只接受 HTTPS，provider 只接受受控公共来源；receiver contract 升为 v2 并继续读取 v1。设备私图允许本机 attribution，但 receiver sync 和 API 入站均剥离私有 attribution 与 pictogramId。
- 理由：来源归属是图符数据而不是某个 React 组件的文案；放在中性核心才能让 Web、微信、历史与 API 使用同一事实，同时保持设备私图不上传边界。
- 证据：来源归属核心、DTO、pipeline、sync 与 Web UI 扩大回归 `51 suites / 377 tests`；API 相关测试 `36 passing`；微信官方 Skill E2E 验证 OpenSymbols/Mulberry 许可从候选贯穿 confirmed receiver record 和独立患者全屏。
- 生效范围：`communicationSupport` 中性核心、CBoard Web 接收展示、微信类型声明和 `cboard-api` confirmed receive。ARASAAC/OpenSymbols 与原始 CBoard symbol 路径可精确归属；微信压缩默认包仅做集合级回退，CBoard 自有 symbol 没有逐图声明时不推断许可证。
- 记录：Codex（GPT-5.6），2026-07-19 08:17:35。

## 2026-07-19 图符来源归属切片验证

- 意图：记录本次契约升级、隐私过滤和跨端展示的可复核证据。
- 决策：以单元/组件测试、API 请求级测试、等价 CBoard production compile、微信 production build 和官方 Skill 假 API E2E 分层验收，不把模拟服务写成真实外网通过。
- 理由：只有同时验证数据层、UI、同步和运行时，才能排除“页面看到了来源但保存后丢失”或“私图被同步”的假闭环。
- 证据：CBoard 等价 `BUILD_PATH` 输出 `Compiled successfully` 并生成完整 index/manifest；微信默认恢复构建主包 `293,081 B`、照护分包 `1,426,570 B`、775 张图片 `953,152 B`，无新增插件、依赖或媒体。官方 Skill 登录有效且版本 `0.3.0` 一致，完整 E2E PASS，13 项原 storage 恢复，`dist` 不含 `api.example.test`、E2E token 或 `OPENSYMBOLS_SECRET`。
- 生效范围：当前工作树的来源归属切片与后续回归门；仍不表示真实 HTTPS、真机网络、预览上传或发布完成。微信性能门依据为[官方原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)，现有 `sub-vendors.js 298 KiB` 警告继续保留为分包优化项。
- 记录：Codex（GPT-5.6），2026-07-19 08:17:35。

## 变动 31：Open Board 导入结果进入中性 BoardDTO

- 意图：让 CBoard 成熟的 OBF/OBZ 导入能力成为图语家跨平台内容入口，同时为损坏或不支持的文档建立明确失败边界。
- 决策：`Import.helpers.js` 只接受结构成立的 `open-board-0.1` 文档；独立 OBF 无效时抛出明确错误，OBZ 中无效板条目跳过。合法 CBoard Board 继续通过既有 `createBoardDTO` 转换，不给 BoardDTO v1 增加 Web 专属字段。
- 理由：导入解析属于 CBoard Web，表达匹配属于中性核心；保持这条边界既复用成熟底座，又避免 FileReader、JSZip、React DOM 或 Material UI 进入微信和纯核心。
- 证据：OBF/OBZ 定向 `4/4` 通过，证明固定网格顺序、朗读、图片、颜色、匹配同义词和混合坏条目处理；导入/导出/communicationSupport 相关面为 `40 suites / 328 tests / 4 snapshots`，标准 production build 成功。
- 生效范围：CBoard Web OBF/OBZ 读取、CBoard Board 到 BoardDTO v1 的边界和后续微信内容生成；不改变 CBoard JSON 导入、BoardDTO 版本、微信运行时导入 UI或完整板编辑器。
- 记录：Codex（GPT-5.6），2026-07-19 08:32:54。

## 2026-07-19 Open Board 导入切片验证

- 意图：记录 #30 从“底座具备”推进到“格式失败边界和 BoardDTO 消费已验证”的可复核证据。
- 决策：用内存 OBF 和 OBZ fixture 覆盖成功、损坏 JSON、未知版本与压缩包混合条目，再运行相关面回归和标准整站构建。
- 理由：只看 CBoard 原有导入 UI不能证明图语家匹配元数据和显示顺序未丢失，也不能证明损坏文件不会进入主数据。
- 证据：定向 `4 tests`、相关面 `40 suites / 328 tests / 4 snapshots` 全通过；`npm run build` 输出 `Compiled successfully`，生成 `977 resources`、约 `41.2 MB` precache。
- 生效范围：当前 OBF/OBZ → CBoard Board → BoardDTO 路径；未使用真实大型第三方 AAC 文件，不代表所有供应商扩展、嵌入媒体或跨板链接已验收。
- 记录：Codex（GPT-5.6），2026-07-19 08:32:54。

## 变动 32：`relatedTerms` 只承担策展关系，不参与自动匹配

- 意图：在跨平台 Tile 契约中区分“可自动匹配的同义词”和“只供人工参考的相关概念”，并保证这类信息经过文件导入导出后仍存在。
- 决策：TileDTO v1 的 `communication` 增加向后兼容的可选 `relatedTerms: string[]`；CBoard metadata 同时读写中性键和旧 `tuyujiaRelatedTerms`。`createTileDTO` 负责规范化数组，matcher 不读取该字段。OBF 使用 `ext_cboard_communication_related_terms` 往返，并与 synonyms/exclude/category 共用无 DOM、无 PDF 的纯扩展字段序列化器。
- 理由：相关概念不是词义等价；把它交给 matcher 会提高错误命中风险，把它只留在 Web 临时状态又会破坏跨设备内容策展。可选字段保持旧 BoardDTO 和已保存数据可继续读取。
- 证据：DTO、metadata、matcher、TileEditor、OBF 导入导出扩大回归 `42 suites / 334 tests / 6 snapshots` 通过；专门断言输入“医院”不会因医生图卡的 `relatedTerms` 自动命中。标准 CBoard production build 成功并生成 `977 resources / 41.2 MB` precache。
- 生效范围：CBoard Web TileEditor、metadata、TileDTO v1、Open Board 扩展字段和微信类型声明；不改变 BoardDTO 版本、不改变 matcher 排名、不要求微信提供完整 Tile 编辑 UI。
- 记录：Codex（GPT-5.6），2026-07-19 08:51:09。

## 变动 34：图卡排序成为独立本地事件契约

- 意图：恢复图语家 issue #83 的固定人工顺序、常用优先和真实点击计数，同时保持 CBoard Board/Tile 模型纯净。
- 决策：新增 `pictogramOrdering.js` 与同步 key-value store；默认 `manual`，可选 `popularity`。导航 tile 固定原位置，可表达 tile 按计数降序并以人工顺序稳定兜底。人工顺序与点击记录独立保存，不进入 communication history、Settings 云同步或 matcher。
- 理由：布局、使用事件和语义匹配是三个不同职责。CBoard 已有成熟固定网格与解锁编辑能力，Web 不应再造排序编辑器；共享纯核心则可由 Taro 直接复用。
- 证据：纯核心覆盖默认/常用、导航保护、人工移动、计数与损坏存储恢复；Web 组件覆盖固定网格、真实叶子点击、文件夹不计数和偏好即时切换。聚焦 `5 suites / 20 tests`、扩大门 `63 suites / 421 tests / 3 snapshots`、标准 production build 均通过。旧 `src/api/api.test.js` 的 16 条 `jest-mock-axios` 失配可单独复现，与本契约无依赖。
- 生效范围：CBoard `communicationPreferences/localData/pictogramOrdering` 与 Board 患者显示；编辑模式始终使用原始 Board 顺序，不改变 BoardDTO v1、TileDTO v1、图卡匹配或云 API。
- 记录：Codex（GPT-5.6），2026-07-19 10:28:01。

## 变动 33：候选句自动播报成为中性偏好与可取消控制器

- 意图：让患者表达在无进一步操作时可以自动听到全部候选句，同时保证任何主动操作都能立即终止旧计时和旧语音队列。
- 决策：新增平台无关 `candidateAutoplay` 控制器；`CommunicationPreferences` 增加 `candidateAutoplayDelaySeconds`，只接受 `0/5/10/15/30`，默认 `15`。Web 与微信分别注入定时器及现有 TTS adapter，不把浏览器 SpeechProvider 或 WechatSI 放进纯核心。
- 理由：计时、快照和取消属于跨平台业务规则，具体播放属于平台能力；分开后自动“全部播报”和手动“全部播报”可以复用同一播放队列，避免双端实现漂移。
- 证据：控制器单测覆盖候选快照、延时、待播取消和活动队列停止；Web 组件测试覆盖 5 秒触发、触摸取消、输出变化后重计和 30 秒偏好透传。CBoard 扩大回归 `55 suites / 394 tests / 3 snapshots`、无 Hooks 警告的 production build 通过；微信共享声明、TypeScript、ESLint、`25 files / 103 tests` 和 production quality gate 通过。
- 生效范围：`communicationPreferences`、`candidateAutoplay`、CBoard Web 表达面板/照护设置及微信共享消费；不改变 expression pipeline v1、候选文本生成、SpeechProvider/WechatSI 实现或云 API。微信真机触控和连续播报尚未在本轮验收。
- 记录：Codex（GPT-5.6），2026-07-19 09:26:52。

## 2026-07-19 关联词与 OBF 元数据往返切片验证

- 意图：记录“编辑可见、DTO 可读、文件可迁移、自动匹配不受影响”的完整证据，而不是把单纯增加字段写成功能闭环。
- 决策：以纯模块单测、matcher 反向断言、OBF 导入 fixture、TileEditor 组件测试、扩大回归和两端生产构建分层验收；微信只验证类型与共享核心编译，不冒充已提供小程序编辑 UI。
- 理由：字段存在不等于语义正确；必须同时证明相关词不会触发自动图卡、导出不丢字段、旧 DTO 仍兼容且小程序包体没有因此失控。
- 证据：CBoard `42 suites / 334 tests / 6 snapshots` 与标准整站构建通过；微信 `25 files / 103 tests`、TypeScript、ESLint、`83 app / 21 core`、完整板检查和 production build 通过。未压缩主包 `293,081 B`、照护分包 `1,426,891 B`，775 张图片共 `953,152 B`，无 `200 KiB` 媒体违规；压缩、无依赖过滤和 `lazyCodeLoading: requiredComponents` 均由构建门自动检查。
- 生效范围：当前工作树的 relatedTerms/OBF 切片和后续回归门；不表示真实第三方大型 OBF、微信真机、预览上传或正式发布已验收。微信一手质量依据为[官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 08:51:09。

## 变动 35：表达输出顺序修正成为纯核心契约

- 意图：让 Web 与微信在句子生成前共享同一套“移动任意图片、删除任意图片”规则，恢复原图语家的人工最终修正能力。
- 决策：`expressionPipeline` 导出 `moveExpressionOutputItem` 与 `removeExpressionOutputItem`；有效操作返回新数组，无效索引或越界移动返回原引用。两个平台修改后都重建既有 pipeline 并取消旧播报，不为编辑状态新增 schema。
- 理由：数组编辑是平台无关业务规则；React DOM、Material UI、Taro Button 和具体 TTS 停止方法仍应留在 adapter/UI。引用稳定性让 reducer 和组件可以识别无效操作，避免无意义重建。
- 证据：纯函数测试覆盖不修改源数组、移动、删除和越界原引用；Web 组件测试覆盖右移、删除及语音取消。CBoard `55 suites / 399 tests / 1 snapshot` 和标准 production build 通过；微信 `28 files / 109 tests`、类型、Lint、边界和 production build 通过。
- 生效范围：共享 expression pipeline、CBoard Web 表达面板和微信患者表达 reducer；不修改候选生成算法、BoardDTO/TileDTO v1、repository、Settings、AI 或接收端修正契约。
- 记录：Codex（GPT-5.6），2026-07-19 11:13:39。

## 变动 36：快捷短语播放与载入成为两个跨端动作

- 意图：让 CBoard Web、微信和未来客户端都能保留原图语家“高频短语一次点击立即播报”的效率，同时不破坏正在编辑的表达。
- 决策：读取快捷短语继续使用 `getCommunicationQuickPhrases`；即时播报只取消旧队列、调用平台 TTS 并以 `markCommunicationSavedPhraseUsed` 持久化用量，不调用输出替换；重用动作才把短语 output 载入 expression pipeline。平台 UI 可使用不同组件，但必须保持这两个动作的副作用边界。
- 理由：播放是一项瞬时输出，载入是一项编辑状态变更；把二者混成一个按钮会增加操作步骤或意外覆盖当前表达。现有 saved phrase 纯核心已足够，不需要复制原 React DOM Overlay 或增加平台相关代码。
- 证据：Web 子组件与父组件聚焦 `2 suites / 28 tests`，证明精确朗读、取消旧播报、用量 settings 持久化和 `onApplyOutput` 零调用；扩大门 `63 suites / 425 tests / 3 snapshots`、标准 production build通过。微信 `28 files / 109 tests`、TypeScript、ESLint、边界 `91 app / 22 core` 与 production build 通过，生产分包含两个动作文本。整库扫描仍存在旧 Axios、WelcomeScreen、SpeechProvider 基线失败，未用于本契约通过结论。
- 生效范围：共享 saved phrase 使用语义、CBoard `ExpressionLoopPanel/CommunicationSupportPanel` 和微信 `SavedPhrasesPanel/ExpressionWorkspace/CommunicationPage`；不改变 saved phrase schema、Settings API、当前 output、接收端、候选算法或 AI。专用全屏播放视觉层仍是独立待评估项；本轮全程后台执行，未打开开发者工具，未预览、上传或发布。
- 记录：Codex（GPT-5.6），2026-07-19 11:39:07。

## 变动 37：快捷短语全屏播放生命周期成为跨端契约

- 意图：让 Web、微信和未来客户端在常用语即时播报时都提供一致的视觉输出与关闭语义。
- 决策：播放层输入只包含 saved phrase、当前播放状态和平台回调；打开即使用首次播报，重播复用同一句但不记新使用次数，完成/关闭必须停止平台 TTS，任何路径都不得替换当前 expression output。Web 使用现有 Material UI Dialog，微信使用 Taro 固定层，纯核心不引入 DOM、Taro 或播放器状态。
- 理由：全屏样式属于平台 UI，但“显示哪条、何时计数、重播是否计数、关闭是否停止、是否保留当前表达”属于跨端业务不变量。明确契约可避免视觉迁移重新引入数据副作用。
- 证据：Web 挂载测试验证两张图、原句、重播、关闭、一次 usage 回调与零次 output 替换；扩大门 `63/425/3`、标准 build 通过。微信 TypeScript、ESLint、`28/109`、边界 `92 app / 22 core` 与 production build 通过，dist 含三个稳定节点和安全区样式；主包未增长，照护分包为 `1,447,071 B`。
- 生效范围：`CommunicationPlaybackDialog/ExpressionLoopPanel` 与 `PhrasePlaybackOverlay/ExpressionWorkspace`；不修改 saved phrase 纯核心、repository、Settings API、BoardDTO/TileDTO、接收端或候选算法。本轮只证明代码、测试和生产产物，未证明微信真机视觉与触控。
- 记录：Codex（GPT-5.6），2026-07-19 11:56:41。

## 变动 38：最近使用与下一张图推荐成为共享本地契约

- 意图：恢复原 PicInterpreter 在患者表达暂存区中的“空时显示最近使用、非空时推荐同类下一张”能力，减少重复翻板和重新寻找高频图卡的操作成本。
- 决策：新增平台无关 `pictogramSuggestions` 纯核心，直接消费 BoardDTO/TileDTO v1 与既有 `pictogramOrdering` 本地使用事件。空序列只返回 `lastUsedAt > 0` 的最近图卡；非空序列以最后一张图的 `communication.category` 筛选，按使用次数、最近时间和 CBoard 固定顺序稳定排序；导航图卡与全部已选图卡必须排除。Web 与微信只负责展示和把点击送回既有表达管线。
- 理由：原实现 `SuggestionStrip.tsx` 已验证这两条业务规则，但其 Dexie/PictogramEntry/React UI 不适合直接搬进 CBoard 和 Taro。复用现有 BoardDTO 与点击事件可以保留 CBoard 固定网格、微信本地存储和跨端一致性，同时不修改 matcher、历史、Settings 云同步或 Board schema。
- 证据：原 `docs/prd.md` 第 62 至 64 行、`src/components/SelectionTray/SuggestionStrip.tsx` 及其 `suggestion-logic.test.ts` 明确记录规则。CBoard 聚焦 `7 suites / 47 tests`、全仓 `151 suites / 939 tests / 72 snapshots` 和标准 production build 通过；微信聚焦 `1 file / 2 tests`、全量 `29 files / 111 tests`、TypeScript、ESLint、边界 `93 app / 23 core` 与 production build 通过。
- 生效范围：CBoard Web 双向沟通表达面板、微信患者表达工作区、共享图卡推荐与本地使用事件；不改变 BoardDTO/TileDTO 版本、图片匹配、候选句生成、接收端、账号同步、AI 或 API。当前项目没有运行中的微信模拟器 runtime，本轮未为验收强行打开窗口，未执行预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-19 13:01:14。

## 变动 39：患者跨分类图卡搜索成为共享纯核心

- 意图：补齐原图语家 PRD 中“表达模式跨分类搜索、支持中文标签与同义词、输入防抖”的明确能力，让患者无需逐层翻板即可找到目标图卡。
- 决策：新增平台无关 `expressionPictogramSearch`，只消费既有 BoardDTO/TileDTO 图卡目录。匹配顺序固定为标签精确、同义词精确、标签前缀、同义词前缀、标签包含、同义词包含；导航卡和命中 `excludeTokens` 的歧义卡排除，`relatedTerms` 不参与搜索。Web 与微信各自使用 250ms 防抖，最多展示 24 个结果，点击复用原表达使用统计与输出管线。
- 理由：原仓库 `docs/prd.md` 已定义产品要求并提供 `useDebounce`，但 `PictogramGrid` 尚未接线；直接复制未完成 UI不能形成闭环。把搜索语义放入纯核心可以让 Web、微信与未来客户端共享排序和安全边界，又不会引入 Dexie、React DOM、Material UI、Taro 或网络依赖。
- 证据：共享核心 `6/6`，CBoard 搜索核心与表达组件聚焦 `2 suites / 18 tests`，全仓 `152 suites / 946 tests / 72 snapshots` 和标准 production build 通过。微信真实默认板验证“汤匙 → 勺子”及“水”精确优先，全量 `30 files / 113 tests`、TypeScript、ESLint、边界 `94 app / 24 core` 和 production build 通过。
- 生效范围：CBoard Web 双向沟通患者表达面板、微信患者表达工作区及共享 BoardDTO 搜索契约；不修改 BoardDTO/TileDTO 版本、自动文字匹配、接收端、相关词语义、repository、账号同步、AI 或 API。微信本轮只完成后台代码、测试与生产构建，没有启动、置顶或抢占开发者工具窗口，没有预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-19 13:27:32。

## 2026-07-19 跨分类图卡搜索切片验证

- 意图：记录搜索结果可加入真实表达管线、两端共享同一排序规则且不会突破小程序性能门的可复核证据。
- 决策：用纯核心歧义/排序测试、Web 真实 250ms 组件防抖、微信完整默认板 fixture、两端全量回归和生产构建分层验收；不把静态构建冒充真机视觉通过。
- 理由：只断言输入框存在不能证明同义词、跨板、点击加入和安全排除有效；只跑聚焦测试也不能证明新增 core 没有破坏 CBoard 整站或微信打包边界。
- 证据：CBoard build 主 JS gzip 增量约 `1.18 kB`、CSS 增量 `172 B`，Service Worker 仍为 `977 resources / 41.2 MB`。微信主包 `295,964 B`、照护者分包 `1,457,219 B`、775 张图片 `953,152 B`；压缩、无依赖过滤、按需注入、插件使用、单媒体 200 KiB 与逐包 2 MiB 门全部通过，既有 `sub-vendors.js 300 KiB` 警告保留。
- 生效范围：当前搜索切片的自动化和包体证据；微信模拟器/真机输入法、横滑、触控、大字体与高对比视觉仍需后台 runtime 可用或用户人工验收。性能依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 13:27:32。

## 变动 40：首次使用引导成为共享内容与平台入口契约

- 意图：恢复原 PicInterpreter 首次自动说明与设置中重看引导的能力，避免迁移到 CBoard 后虽然保存了 `onboardingComplete`，患者和照护者却看不到如何开始双向沟通。
- 决策：新增平台无关 `communicationOnboarding` 内容契约，固定患者表达、接收理解、离线优先三项说明。CBoard Web 只在首次进入患者表达或接收理解时打开独立全屏引导，完成后复用现有偏好仓库；普通图板首屏和紧急求助不受阻挡。显示与易用性页提供重看入口。微信保留现有全页入口与“图语家”品牌抬头，只移除重复步骤硬编码并消费同一核心。
- 理由：原 MVP 的 `OnboardingModal` 和设置入口已经验证首次标记与重看流程，但 React DOM、Zustand 和 Tailwind UI 不应复制到 CBoard 或 Taro。说明文字属于跨平台产品契约，触发、视觉和 storage 属于平台实现；中性核心也保持未来 upstream PR 不依赖图语家品牌。
- 证据：CBoard 聚焦 `4 suites / 26 tests`，全仓 `154 suites / 950 tests / 72 snapshots` 和标准 production build 通过；主 JS 增加约 `665 B gzip`、CSS 增加约 `327 B gzip`，Service Worker 仍为 `977 resources / 41.2 MB`。微信全量 `31 files / 114 tests`、TypeScript、ESLint、边界 `95 app / 25 core` 与 production build 通过；主包 `295,964 B`、照护分包 `1,457,498 B`、775 张图片 `953,152 B`。
- 生效范围：共享 `communicationOnboarding`、CBoard Communication Support 首次入口/显示设置和微信现有 `CommunicationOnboarding`；不修改 BoardDTO/TileDTO、表达/接收管线、语音、AI、账号、云同步、插件或媒体。后台 `check_wechatide_status` 确认登录有效且 Skill `0.3.0` 一致；本轮未启动项目窗口、未置顶或抢焦点，未预览、上传、发布、提交或推送，模拟器/真机视觉与读屏仍待后台 runtime 或用户人工验收。
- 记录：Codex（GPT-5.6），2026-07-19 13:50:57。

## 变动 41：候选反馈、表达记录与 AI 上下文形成同一契约

- 意图：让实时候选评价、确认后的历史复盘和下一次 AI 请求共享同一事实来源，完整落实 PicInterpreter issue #12 与 #22 的候选反馈语义。
- 决策：`candidateFeedback` 纯核心只接受 `up/down/null`，以候选句数组为单位切换、替换或取消。确认前的非空反馈写入独立 repository 草稿；确认时使用同一 ID 转为 `recordStatus: confirmed` 的 expression history，草稿随即删除。历史复盘更新同一 record；会话上下文只携带已确认记录的非空反馈。平台 UI 不得把评价按钮与朗读按钮合并。
- 理由：字段、按钮、持久化、云同步和 AI 消费属于一条链；拆成彼此独立实现会出现“点了但丢失”“历史看不到”或“AI 永远不使用”的假闭环。草稿和确认记录分离还能避免未完成表达进入云端历史。
- 证据：共享核心与 CBoard Communication Support `59 suites / 417 tests`；Web production build 无新增 ESLint 警告。微信 `31 files / 114 tests`、TypeScript、ESLint、`95 app / 26 core` 和 production build 通过；包体主包 `295,964 B`、照护分包 `1,467,003 B`。API 候选反馈规范化、提示上下文、路由与提供方共 `14 passing`，Swagger 已声明最多 20 条 `up/down` 样本。
- 生效范围：schema v5 的本地候选反馈草稿、expression history、Web/微信实时与历史 UI、既有 Settings 同步及 `cboard-api` sentence endpoint；不上传语音或设备私图，不新增专用 API，不表示 #22 的任意历史接收记录编辑已完成。微信项目当前无 runtime，本轮未强制开窗、未置顶、未预览、上传或发布。
- 记录：Codex（GPT-5.6），2026-07-19 14:56:48。

## 变动 42：历史接收修正保留原记录并追加可投影证据

- 意图：让照护者在 Web 与微信历史列表中修正任意已确认的接收图片序列，又不改写患者当时实际看到的确认记录。
- 决策：`buildReceiverCorrectionFromEdit` 继续只接受 active draft；新增 `buildReceiverCorrectionFromHistoryEdit`，只接受 confirmed receive record。两者共用 receiver correction schema，历史修正固定标记 `caregiver_history_review` 并保存 `revisionBefore/revisionAfter`。`getEffectiveReceiverHistoryEntry` 只读取同一记录最新的历史修订作为显示投影，原 record、普通 history 和 correction 审计分别持久化。
- 理由：确认记录是沟通事实，不能为了照护复盘而覆盖；纠错证据又必须能够恢复完整序列，而不能只留一个字段或单个 pictogram ID。复用既有 schema 和编辑纯函数可避免实时接收、历史 Web 与历史微信出现三套行为。
- 证据：纯核心和 repository 测试覆盖 confirmed 限制、前后快照、storage 正规化、最新投影和原记录不变；Web 组件覆盖历史换图并断言 `onHistoryChange` 零调用。CBoard Communication Support `59/421` 与 production build 通过；微信 fixture、TypeScript、ESLint、`32/115` 和 production build 通过。
- 生效范围：CBoard 中性 receiver lifecycle/storage/repository、Web 与 Taro 微信照护历史 UI。修订只影响本机显示与既有本机纠错记忆，不改变原确认记录、云端 receiver event、Settings、BoardDTO/TileDTO、AI 或语音。微信开发者工具允许后台操作但不得置顶、抢焦点；本轮未运行 GUI、预览、上传或发布。
- 记录：Codex（GPT-5.6），2026-07-19 15:34:15。

## 变动 43：`PictureLibraryArchive v1` 成为跨端图库迁移契约

- 意图：让 CBoard Web、微信和未来客户端使用同一种可审计 ZIP 格式备份、迁移和恢复本机图库，而不是各自导出互不兼容的 JSON、OBZ 或设备路径。
- 决策：归档根清单固定为 `library.json`，格式名为 `picinterpreter-picture-library`、版本为 `1`。`custom` 范围包含运行时图符、缺词关联和设备私图偏好；`full` 额外包含 BoardDTO/TileDTO、网格布局和使用顺序。导出保存标签、同义词、关联词、排除词、分类、使用次数、来源许可和全部引用图片字节，但移除 patient/workspace 身份。导入支持 `merge`（备份同 ID 覆盖）与 `skip`（本地同 ID 保留），必须先校验完整清单和图片，再原子替换本机 repository；失败时恢复旧 storage 并清理暂存文件。
- 理由：设备路径和家庭身份不能跨设备照搬，只有元数据没有图片也不能恢复；先写部分数据再报错会破坏仍可使用的图库。范围和冲突策略显式化后，用户可以理解恢复结果，平台 adapter 也只需负责二进制文件与持久存储。
- 证据：共享 archive/BoardDTO 往返及 Web ZIP helper 聚焦 `2 suites / 9 tests`；CBoard 全仓 `158 suites / 972 tests / 72 snapshots`、标准 production build 和 `git diff --check` 通过。微信备份 service、文件 port、图库 store 及回滚测试纳入全量 `35 files / 121 tests`，TypeScript、ESLint、边界检查和 production gate 通过；生产产物中 JSZip 仅存在于 `packages/backup`。
- 生效范围：CBoard Settings 导入导出、communication repository、Taro 微信独立备份分包、患者页与接收页的共享图库读取。通用 ZIP 缺少 `library.json` 时 CBoard 继续按既有 OBZ 导入；归档不含沟通历史、语音、账号令牌，也不执行云上传。微信真机分享、文件选择和跨设备恢复尚待人工验收。
- 记录：Codex（GPT-5.6），2026-07-19 16:50:21。

## 变动 44：恢复默认图库保留产品意图但不强求平台同构

- 意图：保留原 PicInterpreter“重置默认词库”的安全退出能力，同时避免把旧 Dexie seed 的清表语义错误套到 CBoard 用户 Board。
- 决策：微信的完整图库是独立、本机、可删除的 BoardDTO 快照，因此备份分包可以在二次确认后调用 `boardStore.reset()` 回退到随包 44 块默认板。该动作不得修改个人图片偏好、缺词关联、排序事件、沟通历史或账号设置。CBoard Web 的 Board/Tile 是主数据并可能参与账号同步，不提供等价批量 reset；继续使用原生编辑、导入和同步生命周期。
- 理由：跨平台复用应保持用户可逆性，而不是强制复制底层存储操作。微信缺少 reset 会让合法但错误的导入无法退出；CBoard 增加同名按钮则可能覆盖真实用户板，风险相反。
- 证据：微信 backup service `4/4` 覆盖恢复成功、失败和个人数据零写入；全量 `35 files / 123 tests`、TypeScript、ESLint、`107 app / 26 core` 边界与 production gate 通过。备份分包为 `1,349,021 B`，主包与照护分包未增长。
- 生效范围：微信 `PictureLibraryBackupPage`、`pictureLibraryBackupService` 与 `pictureLibraryStore`；CBoard Web 仅受“不得复刻 seed 清表”的边界约束。该动作不清理恢复 ZIP 的个人图片文件，不触发云同步，不等于清空应用数据。
- 记录：Codex（GPT-5.6），2026-07-19 17:09:32。

## 变动 45：设备私有图片来源说明成为共享本地契约

- 意图：纠正个人熟悉图片替换 CBoard 图卡后仍继承 Mulberry、ARASAAC 或 CBoard 公共署名的问题，并允许照护者补充本机来源和使用说明。
- 决策：个人图片偏好继续使用 `device-private` scope，但必须携带 `pictogramAttribution`。旧记录读取时自动补为“设备私有图片（未声明公开许可）”；新记录可填写拍摄者或图片提供者及使用说明。应用换图时同时覆盖 `image`、`pictogramAttribution` 和旧 `attribution` 别名；`PictureLibraryArchive v1` 保存并恢复这些字段。公开同步继续通过既有过滤器排除 `device-private` 署名。
- 理由：只替换图片地址会让家庭照片沿用原公共图符许可，形成错误来源陈述；直接要求用户声明公开授权又会把未经核验的备注冒充法律证据。设备私有默认值、可编辑本地备注和公开过滤可以同时保证可追溯、诚实表述与隐私边界。
- 证据：共享署名、个人偏好、ZIP 归档和 Web 管理界面聚焦 `4 suites / 18 tests`；CBoard 全仓 `158 suites / 975 tests / 72 snapshots`、`git diff --check` 和标准 production build 通过。微信 `35 files / 123 tests`、TypeScript、ESLint、`107 app / 26 core` 边界和 production gate 通过；未压缩主包 `296,078 B`、照护分包 `1,490,524 B`、备份分包 `1,350,055 B`。
- 生效范围：共享 `pictogramAttribution/personalImagePreferences/PictureLibraryArchive v1`、CBoard Web 个人图片管理和微信照护者个人图片管理。来源说明只是用户本机备注，不代表平台核验授权；图片仍不进入账号同步或公共图库。本轮没有打开、置顶或抢占微信开发者工具窗口，没有预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-19 17:45:38。

## 变动 46：表达确认以持久化成功为唯一完成条件

- 意图：修复 history repository 失败时 Web 仍显示“已确认”的数据一致性问题，并固化可供微信复用的 issue #29 契约。
- 决策：`buildExpressionHistoryEntry` 只负责构造记录，`persistExpressionHistoryEntry` 负责把空返回和异常规范为失败；UI 只有收到真实持久化结果才设置确认态。失败时显示 `role=alert` 错误，保留当前输出、候选和所选句，确认按钮保持可用；已确认候选反馈更新也经过同一边界。
- 理由：记录对象已构造不等于已持久化。把两者混为一谈会产生假成功，并可能让 AAC 用户失去正在表达的内容；纯函数边界也让 Taro 无需复制异常处理语义。
- 证据：核心测试覆盖成功、空返回、抛异常和输入不可变；Web 组件覆盖空返回与 quota 异常后的内容保留及二次重试。CBoard 全仓 `158 suites / 978 tests / 72 snapshots`、`72` 个快照和标准 production build 全部通过；测试表格清理后组件 `15/15` 再次通过。
- 生效范围：`expressionPipeline`、Web `ExpressionLoopPanel` 及微信共享类型/调用方；不改变 repository schema、历史内容、候选算法、TTS、AI、账号或 API。本轮未提交或推送。
- 记录：Codex（GPT-5.6），2026-07-19 18:26:19。

## 变动 47：会话场景与新对话使用同一上下文边界

- 意图：让接收端场景真正影响可选 AI 候选，同时保证开始新对话后旧场景和旧历史不再进入 AI 请求。
- 决策：`conversationSession` 固定医院、家庭、康复门诊三种场景并随活动 session 持久化；repository 只为当前 session 返回场景。Web 接收页提供选择、再次点击清除、当前状态和二次确认的新对话入口；AI 请求与 API helper 均拒绝任意场景字符串。
- 理由：场景属于会话上下文而不是全局偏好；任意字符串会形成提示注入面，GPS 会增加不必要的隐私风险。新对话必须在数据层清空上下文，不能只重置页面显示。
- 证据：场景核心、repository、AI 请求和 Web 面板聚焦 `5 suites / 45 tests`；CBoard 全仓 `158 suites / 980 tests / 72 snapshots` 和 production build 通过。API helper 聚焦 `6 passing`，Swagger 只允许三个稳定 ID。
- 生效范围：共享 `conversationSession/repository/communicationAi`、Web Communication Support 与 `cboard-api`；不删除历史、不采集位置、不改变本地 matcher、BoardDTO/TileDTO 或离线候选。
- 记录：Codex（GPT-5.6），2026-07-19 18:55:01。

## 变动 48：`CommunicationShare contract v1` 固化异步分享边界

- 意图：让表达文字与接收图片序列可以跨 Web、微信和未来客户端分享，同时确保分享是当前沟通之外的非阻塞动作。
- 决策：`buildExpressionSharePayload` 只接受当前选中句；`buildReceiverShareDocument` 最多接受 40 项并保持原顺序、逐项标准化署名；`buildReceiverShareLayout` 生成 1080px 移动可读长图；`renderReceiverShareLayout` 通过通用 Canvas 2D port 等比绘图，加载失败保留占位。Web adapter 优先 Web Share/File Share，能力不足回退 TXT/PNG 下载，用户取消不强制下载。
- 理由：分享内容、排版和平台交付是三个独立职责。将前两者放入纯核心可防止端间顺序、许可和失败语义漂移；平台 adapter 则可诚实处理浏览器与微信能力差异。
- 证据：核心、浏览器 adapter 与 Web 表达/接收组件聚焦 `6 suites / 60 tests`；CBoard 全仓 `160 suites / 992 tests / 72 snapshots`、定向 `git diff --check` 和标准 production build 全部通过。测试覆盖超限拒绝、顺序、两列布局、ARASAAC 署名、图片失败占位、非方图等比缩放、系统分享/下载回退和 UI 无语音/关闭副作用。
- 生效范围：共享 `communicationShare`、浏览器交付 adapter 和 Communication Support 表达/接收 UI；不改变 BoardDTO/TileDTO、matcher、候选句、历史、TTS、账号或 API。iOS Safari 与 Android Chrome 的真实系统分享仍需人工验收；本轮未提交或推送。
- 记录：Codex（GPT-5.6），2026-07-19 19:40:29。

## 变动 49：`LocalDeviceData v1` 固化设备交接与本机清除边界

- 意图：让 Web、微信和未来客户端对“完整本机备份”“只清私人图片”“清全部本机数据”使用同一数据范围，避免平台实现各自漏项。
- 决策：`buildLocalDeviceDataFiles` 要求完整 `PictureLibraryArchive v1`，并生成设备清单、图符、分类和表达 sidecar；`buildPrivatePictogramClearPlan` 清空所有设备私有换图，只把 `device-private` 缺词图符恢复为待处理，保留公共/在线图符。浏览器与微信分别通过平台端口清物理存储，纯核心不引用 DOM、IndexedDB 或 Taro。
- 理由：图库、表达记录和物理文件是三个不同层次；只有完整清单能支持交接，只有平台端口能诚实处理删除失败，而共享 scope 规则可以阻止误删公共图符或误称云端已删除。
- 证据：共享核心、repository、浏览器端口、ZIP helper 与 Web UI 聚焦 `5 suites / 36 tests`；CBoard 全仓 `162 suites / 999 tests / 72 snapshots` 和 production build 通过。测试覆盖完整 scope 要求、sidecar、公共图符保留、IndexedDB 优先清除、失败不刷新和二次确认。
- 生效范围：共享 `localDeviceData/repository`、Web ZIP/管理 UI 和浏览器清除端口；不删除账号或云端同步数据，不提供选择性记录删除、删除审计或自动上传。本轮未提交或推送。
- 记录：Codex（GPT-5.6），2026-07-19 20:18:20。

## 变动 50：低频设备 ZIP 导出改为按需加载

- 意图：保留完整本机备份能力，同时避免只在设置页偶尔使用的 ZIP 代码进入 CBoard Communication Support 主加载链。
- 决策：`CommunicationSupportPanel` 仅在用户触发完整设备导出后动态导入 `localDeviceDataExportAdapter`；导出 payload、错误处理、浏览器下载和 `LocalDeviceData v1` 契约保持不变。
- 理由：此前静态引入能够正确工作，但会把低频备份 helper 提前并入主 JS；按需加载可以复用同一实现而不牺牲首屏性能，也不需要新依赖或复制第二套导出逻辑。
- 证据：相关组件与管理对话框聚焦 `2 suites / 27 tests` 通过，标准 production build 成功；主 JS 相对静态版本减少约 `3.17 kB gzip`，新增约 `3.52 kB` 独立 chunk。此前完整功能门 `162 suites / 999 tests / 72 snapshots` 继续作为基线。
- 生效范围：仅影响 CBoard Web 完整设备 ZIP helper 的加载时机；不改变 ZIP 内容、清除逻辑、Settings、BoardDTO/TileDTO、账号、云同步或微信实现。本轮未提交或推送。
- 记录：Codex（GPT-5.6），2026-07-19 20:28:12。

## 变动 51：`/demo` 复用正式双向沟通但隔离全部持久副作用

- 意图：让 GitHub 访客无需账号即可验证正式 CBoard 图板与图语家双向沟通主链，而不是观看一套会与产品漂移的静态演示。
- 决策：`isDemoMode` 必须在 Redux store、持久化层和外部副作用初始化前求值。演示使用同步与异步进程内存 storage；Communication Support 的 repository、偏好和顺序也统一进入同一会话级内存。UI 继续复用 `Board`、`CommunicationSupportFeature` 和中性核心，只隐藏账号、云同步、管理、设置、分享图板及私人数据入口，并固定显示刷新即清空提示。
- 理由：组件层单独隐藏按钮无法阻止持久化 rehydrate、后台用户刷新、监控身份设置或 API 同步；复制 demo 组件又会形成第二套行为。初始化前隔离能够同时保证真实功能复用、零生产数据写入和刷新可清空。
- 证据：demoMode、localData、App、Board、Navbar、CommunicationSupport 相关 `10 suites / 50 tests / 2 snapshots`；全仓 `164 suites / 1011 tests / 72 snapshots`、ESLint、`git diff --check` 与 production build 通过。`/demo` 生产静态路由经 HTTP 返回 `200`、React 根节点和主包；主 JS gzip `1.63 MB`，Service Worker 预缓存约 `41.3 MB`。
- 生效范围：仅 CBoard Web `/demo` 的 store、repository、监控/分析与导航可见性；正常 `/`、账号和 Settings schema 不变，微信端与 API 不变。直接从外部访问或硬加载 `/demo` 才能在 store 创建前完成隔离；真实浏览器视觉和交互仍待人工验收。本轮未打开、置顶、聚焦或抢占微信开发者工具，未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-19 21:23:00。

## 变动 52：`ImageTextRecognition` 只产生可编辑文字草稿

- 意图：让照片和截图文字进入同一接收理解管线，又不允许视觉模型绕过人工复核直接决定患者看到的图卡。
- 决策：服务端 OCR 只接受已登录请求、JPEG/PNG/WebP 和最多 `2 MiB` 图片，返回 `{ text, provider, sourceStored: false }`；识别文本规范化为最多 120 字。Web 与微信 adapter 只能把结果写入接收端可编辑输入，禁止自动分词、匹配、保存、朗读或发送。微信以 15 分钟、一次性消费的本地 intent 从独立 OCR 分包返回照护页面。
- 理由：视觉提供方、浏览器文件选择和微信拍照属于平台边界，人工确认后的文字到图片属于既有纯核心。分层可以复用同一 segmentation/matcher，避免 OCR 错误扩大，也能确保原始家庭照片不进入 repository、历史或同步。
- 证据：API helper/controller/route 与 Web API/UI/规范化测试通过；CBoard 全仓 `165 suites / 1015 tests / 72 snapshots` 和 production build 通过。微信 OCR port/intent/session 测试纳入全量 `41 suites / 143 tests`，TypeScript、ESLint、边界和 production gate 通过；OCR 独立分包 `43,650 B`，不含静态媒体，OCR endpoint 未泄漏到其他分包。
- 生效范围：`imageTextRecognition` 中性规范化、CBoard Web 接收对话框、`cboard-api` OCR 路由、微信独立 OCR 分包和返回 intent；不改变 BoardDTO/TileDTO、matcher、语音、历史、账号同步或默认板。真实运行仍需要部署 API URL、服务端视觉模型凭据和支持图片输入的模型；这些配置缺失时必须明确降级，不得显示假识别结果。
- 记录：Codex（GPT-5.6），2026-07-19 22:22:59。

## 变动 53：视觉元数据建议只预填空白并由照护者写入图板

- 意图：让照护者用家庭照片创建个人图卡时减少标签录入工作，又不允许视觉模型自动决定图板内容。
- 决策：服务端只接受已登录、最多 `2 MiB` 的 JPEG/PNG/WebP，返回受限 `{ label, synonyms, category, provider, sourceStored: false }`。共享核心统一清洗建议、构造 `device-private` TileDTO、追加到指定 BoardDTO 和删除后压缩布局。Web 与微信都必须先获得本次上传同意；异步建议只填空字段，不覆盖人工输入；确认保存前照片与字段保持可编辑。微信手工路径不依赖 API，并负责清理替换、取消和删除后的本机文件。
- 理由：模型建议、图板变更和平台文件生命周期必须分层。直接自动保存会把误识别写入 AAC 图板，无同意上传会扩大家庭照片隐私风险；把低频微信编辑器放进 backup 分包可避免挤占患者主包和已经接近阈值的 caregiver 分包。
- 证据：API `23 passing`；CBoard 全仓 `166 suites / 1024 tests / 72 snapshots` 与 production build；微信 `43 files / 151 tests`、TypeScript、ESLint、边界与 production gate 全部通过。微信未压缩包体为 main `296,262 B`、caregiver `1,500,338 B`、backup `1,427,299 B`、OCR `43,650 B`；production gate 验证元数据 endpoint 未进入主包或其他分包。
- 生效范围：`pictogramMetadataSuggestion` 纯核心、CBoard Web TileEditor、`cboard-api` `/gpt/communication/pictogram-metadata`、微信 backup 分包个人图卡编辑器和本机图库 store；不改变默认板、matcher 规则、语音、OCR、历史、云同步或公共图符。生产视觉服务未配置时必须保留照片并明确回退手工填写，不得显示假建议。
- 记录：Codex（GPT-5.6），2026-07-19 23:16:31。

## 变动 54：`BackgroundRemovalPort` 保留原图并只接受透明 PNG

- 意图：为 Web、微信和未来客户端提供同一套“一键去除家庭照片杂乱背景”安全语义，而不把具体供应商、模型或平台文件 API 带入沟通核心。
- 决策：服务端端点固定为鉴权 `POST /gpt/communication/background-removal`，multipart 字段为 `image`。输入只允许 JPEG/PNG/WebP、最多 `2 MiB`；输出必须为最多 `4 MiB`、不超过 `8192 × 8192` 和 32 MP、具有真实透明通道的 PNG，并返回 `{ imageBase64, mimeType, width, height, provider, sourceStored: false, originalRetained: true }`。provider 可配置为自托管 `rembg` 或服务端 `removebg`，密钥不得进入 Web 或小程序。客户端必须逐次授权，处理结果只是可恢复候选；确认保存前保留原图，失败时不得覆盖。
- 理由：去背景质量取决于模型和真实照片，不能用简单阈值抠图伪造；客户端嵌入模型又会增加包体、内存和许可证风险。可替换服务端 provider、严格透明 PNG 响应和客户端草稿生命周期能够把处理、隐私、人工确认与最终图板写入分开。
- 证据：API provider 覆盖 rembg/remove.bg multipart、服务端密钥、未配置、错误类型、超限和透明通道；Web API/TileEditor 覆盖成功、恢复、失败和取消；微信纯端口/草稿注册表覆盖压缩、隐私响应、替换、恢复、提交和离开清理。CBoard 全仓 `166 suites / 1029 tests / 72 snapshots`；微信 `45 files / 160 tests`、TypeScript、ESLint、边界和 production quality gate；API 相关 `56 passing`。
- 生效范围：CBoard Web 新增个人图卡流程、Taro 微信 backup 分包个人图卡流程和 `cboard-api` provider 边界；不改变 BoardDTO/TileDTO、默认板、matcher、语音、历史或同步。真实服务部署和家庭照片质量是独立发布门；参考实现与服务契约见 [rembg](https://github.com/danielgatis/rembg) 和 [remove.bg API](https://www.remove.bg/api#remove-background)。
- 记录：Codex（GPT-5.6），2026-07-20 00:04:02。

## 变动 55：`BackgroundRemovalPort` 增加真实 provider 验收边界

- 意图：让跨平台背景移除契约具备可重复的真实服务验证，而不是只依赖 mock、组件测试和生产构建。
- 决策：`cboard-api` 提供 `verify:background-removal` smoke command，直接复用生产 provider adapter；输入来自显式本地路径，结果只输出尺寸、字节数、SHA-256、隐私标志和耗时，不写出图片。自托管 `rembg` 运行时、模型和样例必须放在仓库之外。
- 理由：平台客户端只应依赖稳定的 `BackgroundRemovalPort`，模型安装和部署属于服务端运维；同一 adapter 的 smoke command 可以在不启动 MongoDB、不需要客户端、不泄露图片的情况下验证 multipart 与透明 PNG 契约。
- 证据：官方 `rembg 2.0.76` localhost 服务返回 `200`；官方样例经 adapter 输出 `987×1481`、`591310 B` 透明 PNG，SHA-256 为 `19ce082978ec81b6ea03365bade95fcd1514314d694229b0b52318fa4117349e`，`sourceStored:false`、`originalRetained:true`，耗时 `251 ms`；未配置 provider 时命令失败，provider 单元测试 `6 passing`。
- 生效范围：`cboard-api` provider 部署前验收和 Web/微信共用的 `BackgroundRemovalPort` 服务契约；不证明鉴权 HTTP 全链、生产网络、客户端 UI、真机文件生命周期或家庭照片抠图质量。本轮未打开、置顶、聚焦或抢占微信开发者工具，未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 00:20:28。

## 变动 56：`DialectNormalization v1` 保留原文并隔离真实方言 ASR

- 意图：让 Web、微信和未来客户端能把粤语文字转换为更适合 CBoard 默认词库的普通话图卡词，同时保证照护者始终能看到和恢复原识别文字。
- 决策：共享纯核心只负责有界请求、粤语白名单、高置信本地词典和 source-preserving 响应校验。`cboard-api` 复用现有鉴权 AI provider，响应必须包含相同 `sourceText`、`sourceStored:false` 和可编辑 `normalizedText`。Web 可在粤语模式显式请求浏览器 `yue-HK`；微信现有 WechatSI 路径继续标记为“不保证粤语”。两端转换后都不自动运行 segmentation/matcher，只有用户再次主动生成图片才进入既有接收管线。
- 理由：音频 ASR、方言文字规范化和图文匹配是三个不同 port。将它们绑定会让供应商能力不透明，并可能把错误翻译直接放大为错误图卡；原文保留、人工编辑、恢复入口和手动继续能够控制否定、疼痛、用药、如厕、食物、时间、数量及紧急语义风险。
- 证据：共享核心、浏览器语言、Web API/接收 UI 聚焦 `5 suites / 71 tests`；API helper/controller/Swagger `25 passing`；微信 `45 files / 161 tests`、TypeScript、ESLint、`137 app / 26 core` 边界和 production build 通过。微信未压缩 main `296,262 B`、caregiver `1,507,590 B`、backup `1,435,407 B`、OCR `43,650 B`；CBoard production build 生成新的 manifest 与 Service Worker。
- 生效范围：`dialectNormalization` 共享核心、CBoard Web 接收端、Taro 微信照护接收端和 `cboard-api` 文字规范化路由。真实粤语录音、音频采集与上传同意、服务端方言 ASR provider、音频不落盘和真机语料验收仍属于下一条独立契约；本变动不得作为“粤语语音识别已完成”的证据。本轮未打开、置顶、聚焦或抢占微信开发者工具，未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 00:52:56。

## 变动 57：`DialectAudioRecognition v1` 固化真实粤语音频 ASR 边界

- 意图：让 Web、微信和未来客户端通过同一安全契约把真实粤语录音转换为可编辑原文，同时继续复用既有文字规范化、分词和图文匹配核心。
- 决策：鉴权端点固定为 `POST /gpt/communication/dialect-asr`，multipart 字段为 `audio`，方言固定为 `cantonese`。客户端必须逐次获得上传同意，只接受 MP3、最多 `3 MiB`、60 秒；微信录音使用 16 kHz、单声道、48 kbps。服务端只在内存中转，腾讯云 provider 固定 `EngineModelType=16k_yue`，响应必须包含非空 `text/provider`、`dialect:cantonese`、`engine:16k_yue`、`audioStored:false`、`providerProcessing:true` 和不超过 60 秒的时长。
- 理由：录音采集、云端 ASR、粤语文字规范化和图片匹配具有不同隐私与错误模式。稳定 port 可让平台只负责录音和临时文件生命周期，让服务端保管密钥并校验提供方，让人工在任何语义进入 matcher 前拥有最终修改权。
- 证据：共享核心覆盖大小、方言和提供方响应校验；Web 测试覆盖选择 MP3、逐次同意、鉴权上传、回填原文及零 matcher 调用；微信端口测试覆盖录音参数、上传、超限、取消、迟到响应、麦克风错误和临时文件清理。CBoard 定向 `5 suites / 72 tests` 与 production build 通过；API 聚焦 `66 passing` 加 settings `2 passing`；微信 `46 files / 167 tests`、TypeScript、ESLint、`140 app / 26 core` 边界与 production quality gate 通过。
- 生效范围：共享 `dialectAudioRecognition`、浏览器上传 adapter、Taro `RecorderManager` adapter、两端接收 UI 和 `cboard-api` 腾讯云 ASR provider。契约只产生可编辑 `sourceText`，不得自动规范化、分词、匹配、保存、朗读或发送；当前无正式腾讯云凭据和真实粤语语料，不构成生产识别质量证据。本轮未打开、置顶、聚焦或抢占微信开发者工具，未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 01:51:07。

## 变动 58：`CommunicationAccountMerge v1` 清洗私有图片并公开冲突结果

- 意图：让 Web、微信和未来客户端复用同一账号合并语义，既能同步公共常用语、历史和接收记录，又不会把设备私有图符及本机文件路径写入 CBoard settings。
- 决策：上传和读取远端 settings 都必须经过同一 device-private sanitizer。私有图符只降级为文字标签，移除私有 ID、署名、board/tile 元数据和 `blob:`、`data:`、`file:`、`wxfile:`、微信临时/用户目录路径；公共图符引用保持不变，本机 repository 原数据不因构造 payload 而改变。相同句子常用语和相同 ID 历史按 `updatedAt` 新者胜出，同时间本机胜出；preview 必须报告 localOnly、remoteOnly、conflicts、localWins、remoteWins 和 unchanged。
- 理由：账号同步的传输白名单必须覆盖所有嵌套图符，而不只是独立接收记录；确定性规则和可见摘要可以避免平台各自实现、隐私泄漏和静默覆盖。
- 证据：CBoard storage/localData/receiverSync/Settings 容器聚焦 `3 suites / 22 tests`，全仓 `168 suites / 1043 tests / 72 snapshots` 与 production build 通过；微信 cloud sync `7/7`，全量 `46 files / 169 tests`、TypeScript、ESLint、边界和 production quality gate 通过。测试同时证明旧远端私有引用会被清洗、公共引用保留且构造上传 payload 不修改本机常用语。
- 生效范围：通用 CBoard settings 的公共沟通数据、Web Settings 同步入口、微信账号合并入口和接收记录同步；不包含私人图片文件迁移、纠错、缺词、录音、匿名 ID 墓碑或 CRDT。真实多设备并发仍需独立运行验收。
- 记录：Codex（GPT-5.6），2026-07-20 02:23:24。

## 变动 59：`VersionedConfirmedReceiverSync v1` 固化不可变确认事实

- 意图：让不同平台和离线设备同步接收记录时，不会覆盖患者已经看过的文字、图卡顺序和风险语义。
- 决策：客户端上传已确认记录时发送非负 `baseVersion`，服务端保存并返回正整数 `serverVersion` 和布尔 `conflicted`。首次确认正文写入后保持不可变；当前版本允许追加去重后的 `patientFeedbackEvents`，反馈写入使版本递增。过期或正文不同的写入返回服务端规范记录并标记冲突；共享客户端把本机和远端反馈按 `type + createdAt` 合并，在下一轮以服务端版本重试。删除响应同时保留旧 `deletedRecordIds` 和新 `{ id, deletedAt, deletedBy, serverVersion }` 墓碑。
- 理由：确认记录是沟通事实而不是普通可编辑设置；服务端版本、不可变正文和追加反馈能阻止旧设备静默覆盖，而双格式墓碑允许旧客户端渐进迁移。
- 证据：共享 `receiverSync` 测试覆盖 baseVersion、服务端规范记录、冲突清除、反馈保留和结构化墓碑；API 通信测试 `59 passing`；CBoard 全量 `168 suites / 1046 tests / 72 snapshots`；微信全量 `46 files / 171 tests`、TypeScript、ESLint、边界与 production build 全部通过。
- 生效范围：已确认接收记录的 API、共享同步核心、CBoard Web Settings 和微信账号同步。草稿不上传；设备私图继续剥离；tombstone 始终优先，旧记录不得复活。常用语仍使用 settings 合并，真实数据库并发和多设备运行需另行验收。
- 记录：Codex（GPT-5.6），2026-07-20 03:05:44。

## 变动 60：`VersionedConfirmedReceiverSync v1` 增加写后并发核对门

- 意图：证明版本化确认记录在真实 Mongo 条件更新下不会把并发丢失的患者反馈误报为同步成功。
- 决策：API 在批量条件更新后重新读取规范记录，并逐项确认请求携带的 `type + createdAt` 反馈事件已经存在；事件缺失、记录被并发删除或规范记录不可见时，把该 ID 加入 `conflictedRecordIds`，由共享客户端保留本机事件并使用最新 `serverVersion` 重试。运行 smoke 使用真实公开登录和 `Promise.all` 两个同版本请求，不调用测试后门。
- 理由：两个请求都可能先读取版本 1，Mongo 只会让一个 `{ serverVersion: 1 }` 条件更新成功；只等待 `bulkWrite` 而不检查结果会让另一个请求错误返回 `conflicted:false`。写后事件核对能复用当前追加集合和冲突恢复协议，不扩大确认正文可变范围。
- 证据：新增控制器回归证明条件更新落空且本次事件缺失时返回 `acceptedCount:0/conflictCount:1`；API 通信/图卡/Blob 聚焦 `71 passing`。真实本地 HTTP/Mongo smoke 中两个同时反馈请求恰有一个返回冲突，合并重试后 `understood/not_understood` 都存在且记录收敛到版本 `3`；既有旧正文冲突、墓碑版本 `4` 和过期记录防复活继续通过。
- 生效范围：`cboard-api` 确认记录同步响应和共享客户端既有冲突重试链；不改变正文不可变、反馈去重键、删除协议、Web/微信 UI 或 storage schema。可信公网 HTTPS、两台物理手机和断网交错仍是发布前独立门。允许后台操作微信开发者工具，但不得置顶、聚焦或抢占用户输入；本轮没有调用开发者工具，也未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 03:39:34。

## 变动 61：`AnonymousAccountIdentity v1` 保留来源并以关联墓碑结束自动合并

- 意图：让 Web、微信和未来客户端共享稳定的匿名身份与账号合并生命周期，登录不再等价于无提示上传。
- 决策：设备持久化独立 `userId/patientId/workspaceId`；账号关联按账号记录 `deferred/retired` 与提示次数。登录确认只上传公共常用语、历史和已确认接收记录；私人图片、纠错、缺词和录音保持本机。只有 Settings 与接收记录都成功后才能写 retired 墓碑，失败或部分成功不得退役。
- 理由：匿名用户、患者和工作区是不同身份；来源 ID 不能因登录被删除。账号关联墓碑可以阻止重复合并提示，又不妨碍失败重试和手动同步。
- 证据：共享 repository/account identity 与 Web 容器聚焦 `4 suites / 26 tests`，CBoard 全仓 `169 suites / 1050 tests / 72 snapshots` 和 production build 通过；微信聚焦 `3 files / 22 tests`，全量 `47 files / 177 tests`、TypeScript、ESLint、边界和 production build 通过。
- 生效范围：communication repository schema 6、CBoard Web 显式同步和微信登录合并；不改变认证、patient/workspace 语义、确认记录版本协议或私人文件迁移。可信公网 HTTPS 与物理多设备仍是独立发布门；后台可操作开发者工具，但不得置顶、聚焦或抢占用户输入。
- 记录：Codex（GPT-5.6），2026-07-20 04:14:49。

## 变动 62：`VersionedSavedPhraseSync v1` 固化逐条版本和删除墓碑

- 意图：让 Web、微信及未来客户端同步常用语时，不会因整包 Settings 覆盖而丢失并发编辑或复活已删除记录。
- 决策：活动记录携带 `baseVersion/serverVersion/conflicted`，删除记录携带 `id/deletedAt/deletedBy/serverVersion`；客户端持久化待同步墓碑并在活动记录之前提交。服务端同内容旧重试保持幂等，不同内容必须匹配 `baseVersion`；墓碑始终优先。旧 Settings 常用语只补种本机不存在且未删除的记录，专用 API 为规范来源，Settings 只保留兼容镜像。
- 理由：常用语具有独立生命周期，不能继续依赖整个 settings 对象的最后写入；逐条乐观版本、服务端规范记录和墓碑已经能覆盖离线冲突、防复活与渐进迁移，无需引入完整 CRDT。
- 证据：API 常用语模型/控制器/路由 `16 passing`；CBoard 共享同步、repository、API adapter 和 Settings `5 suites / 27 tests`；微信云同步、账号端口与删除管理聚焦 `3 files / 24 tests`，全量 `47 files / 181 tests`、TypeScript、ESLint、边界和 production build 通过。
- 生效范围：communication repository schema 7、CBoard Web、微信账号同步及 `cboard-api` 常用语端点；设备私图只保留文字标签，删除不会由旧设备复活。可信 HTTPS 与物理多设备仍是独立运行门；开发者工具只允许后台操作，不得置顶、聚焦或抢占用户输入。
- 记录：Codex（GPT-5.6），2026-07-20 05:13:55。

## 变动 63：`ProductionCommunicationBackend v1` 固化统一 HTTPS 与就绪边界

- 意图：让 CBoard Web、微信小程序和未来客户端复用同一个可部署后端完成账号、公共沟通数据、在线图符、AI 与可选媒体处理，而不是为每个平台再造服务。
- 决策：客户端只依赖一个 `https://<API_DOMAIN>`；服务端公开 `GET /health`，响应严格限于 `{ status: "ok" | "degraded", database: "connected" | "disconnected" }`，数据库未连接必须返回 `503`。Mongo 不得发布宿主端口；API 不得绕过反向代理、必须非 root 运行并从部署环境读取 Mongo/JWT/session secret；Caddy 终止 TLS、主动检查 `/health` 并作为唯一公网入口。AI、OpenSymbols、粤语 ASR、去背景、邮件和媒体凭据继续是可选服务端配置，缺失不得伪装已启用。
- 理由：跨平台主链需要稳定同源 API，但密钥、数据库和提供方必须留在可信边界；进程存活不等于持久化可用。将公网 TLS、内部 HTTP、数据库就绪和 provider 能力拆开，既能完整复用 CBoard 前后端体系，也能在 Mongo 故障时安全降级而不是返回假成功。
- 证据：模板与真实临时配置校验、Compose 展开、冻结锁文件镜像构建通过；本地三容器栈返回 HTTPS `200/connected`，且 `10010/27017` 未对宿主监听。Mongo 停止后 API/Caddy 均返回 `503`，重启后 API 自动重连并恢复 `200`。健康/生产配置聚焦 `5 passing`，通信与部署相关 `94 passing`；完整 controller 基线 `202 passing / 5 pending / 7 failing`，剩余失败均依赖未配置外部服务。
- 生效范围：三端共享的后端 origin、健康语义、部署密钥和网络边界；不改变 BoardDTO、TileDTO、分词、matcher、TTS、接收记录或常用语协议。真实 DNS、公众信任证书、微信合法域名、生产凭据、双机和弱网验收仍是独立发布门。
- 记录：Codex（GPT-5.6），2026-07-20 05:59:52。

## 变动 64：`EmergencyCommunicationPackage v1` 固化安全入口与资源自包含

- 意图：让微信紧急求助在不扩大共享业务核心的前提下保持一跳可达、离线可用、可朗读并可返回原沟通方向。
- 决策：跨端继续复用 `emergencyCommunication` 纯短语/回退契约；微信平台单独使用 `packages/emergency` 页面。页面只读取本机易用性语速并调用既有 SpeechPort；8 张图由分包内清单和文件自包含，6 张 CBoard 图以稳定 Tile ID 对齐，2 张专用图保留来源清单。患者页、接收页只负责导航，不复制紧急业务状态。
- 理由：短语与失败回退属于共享业务语义，页面、分包和资源路径属于微信平台能力；把两者分层可以避免 React DOM/Taro 互相渗透，也能降低照护分包的体积压力。
- 证据：微信 `47 files / 182 tests`、TypeScript、ESLint、边界和 production build 通过；紧急分包 `35,524 B`，8 张图片产物和 CBoard tile/image 清单一致，照护分包从 `1,539,596 B` 降至 `1,520,858 B`。
- 生效范围：共享紧急短语契约与微信页面/资源 adapter；不要求 CBoard Web采用微信分包，不改变 TTS、历史、同步或默认板。真机触控、旋转和语音并行仍需新预览后验收。
- 记录：Codex（GPT-5.6），2026-07-20 06:25:25。

## 变动 65：`CommunicationManagementPackage v1` 固化管理能力的平台边界

- 意图：让常用语、历史、设置、账号和 AI 状态继续复用同一套跨端核心，同时允许微信按加载频率拆包，不把 Taro 页面结构反向写入 CBoard Web。
- 决策：常用语排序/计数、历史维护、repository、账号合并、云同步、BoardDTO 与图片个性化仍是共享纯核心或平台 port；`packages/management` 只负责微信页面编排。患者页和管理页通过一次性 `CommunicationNavigationIntent.reuseSavedPhraseId` 交接，消费后必须删除；找不到条目或无法恢复图卡时保持现有表达并显示失败提示。Web 可继续采用路由、对话框或现有 Settings 页面，不要求复制微信分包。
- 理由：业务语义和加载边界是两个不同层次。共享核心保证 Web/微信行为一致，平台分包保证患者主链轻量；一次性 ID intent 又避免跨页面复制完整 TileDTO、私有图片路径或账号数据。
- 证据：微信 `47 files / 183 tests`、TypeScript、ESLint、`146 app / 26 core` 和 production build 通过；management 分包 `438,988 B`，caregiver 降到 `1,478,153 B`，质量门验证管理页产物和账号/settings/AI 端点均在分包中。导航 intent 的保存、规范化、一次消费和清理共 `4/4` 通过。
- 生效范围：共享 `CommunicationNavigationIntent` 的可选常用语 ID、微信患者/管理页职责和构建门；不改变常用语 schema、历史、接收记录版本、云端 API、CBoard Web 路由或私人图片不上云边界。模拟器与真机导航仍需项目已打开后的后台 E2E和新预览验收。
- 记录：Codex（GPT-5.6），2026-07-20 06:46:28。

## 变动 66：`PatientActionLanguage v1` 固化患者图标优先动作语义

- 意图：让患者在 Web、微信和未来客户端中仅凭一致的图标与短标签即可完成表达、接收反馈和紧急求助，同时保留读屏所需的完整语义。
- 决策：共享纯核心定义稳定动作 ID、语义图标名、轻量字符 glyph、最长四字短标签和完整 `ariaLabel`。CBoard Web adapter 只复用现有 Material Icons；微信 adapter 只使用字符 glyph 和 Taro 原生 Button，不引入图标字体、SVG 包或组件库。患者入口、图片重排/删除、撤回/清空、优化、确认、朗读/停止、收藏/分享、全屏、理解反馈、重播和返回均消费同一契约；照护者管理操作继续允许使用解释性文字。
- 理由：患者端不能依赖长文字按钮，但把 React DOM、Material UI 或 Taro 组件写入共享核心会破坏跨平台复用。动作语义与平台渲染分层，既能保持一致，也能控制微信包体。
- 证据：CBoard 聚焦 `6 suites / 48 tests` 与整站 production build 通过，主 JS gzip 仅增加约 `4.24 kB`；微信 `48 files / 184 tests`、TypeScript、ESLint、`148 app / 26 core` 边界和 production build 通过。生产产物保留 `data-patient-action`；未压缩 main `296,510 B`、caregiver `1,484,584 B`、emergency `39,454 B`、management `440,450 B`、backup `1,453,612 B`、OCR `56,920 B`，所有分包仍低于 1.5 MiB 建议线。
- 生效范围：CBoard Web 与微信的患者直接操作表面、共享动作语义和无障碍标签；不改变 BoardDTO、TileDTO、matcher、TTS、历史、同步或照护者管理业务。真实视觉层级、系统读屏、横竖屏、安全区和物理触控仍需新预览后验收；开发者工具只允许后台操作，不得打开、置顶、聚焦或抢占输入。
- 记录：Codex（GPT-5.6），2026-07-20 07:23:27。

## 变动 67：`PersonalPictogramMutation v1` 固化个人图卡更新与跨板移动

- 意图：让 Web、微信和未来客户端用同一纯契约维护已保存个人图卡，而不是各自在页面状态中直接改 BoardDTO。
- 决策：`updatePersonalPictogramInBoards(boards, sourceBoardId, targetBoardId, tile)` 必须验证源板、目标板、源图卡和全库 ID 唯一性。同板更新保留 `layout.tileIds` 原位置；跨板移动从源板删除、压缩行数，再向目标板追加并重算行数。调用方先用 `buildPersonalPictogramTileDTO` 重建标签、朗读、同义词、分类和 `device-private` 来源说明；函数不修改输入。
- 理由：个人图卡的稳定 ID、板归属、布局和来源许可同时参与浏览、搜索、matcher、朗读、备份和删除。直接修改其中一个数组会产生幽灵图卡、重复 ID 或错误来源；纯更新契约可以被各平台单测并保持 UI 解耦。
- 证据：共享核心 `8/8` 测试覆盖原位更新、顺序保留、跨板移动、行数压缩、Board ID 更新、未知源图卡和输入不变；CBoard production build 通过。微信 wrapper `6/6` 测试覆盖只允许 `device_private_custom_*`、持久化后匹配、编辑元数据和跨板移动；TypeScript、ESLint、`148 app / 27 core` 边界与 production build 通过。
- 生效范围：共享 BoardDTO/TileDTO 个人图卡 mutation、微信 backup 照护页面和未来平台 adapter；不改变默认 CBoard 图卡、普通 TileEditor、云同步、公开上传、历史快照或设备图片文件格式。真机触控与重启恢复仍是平台验收项。
- 记录：Codex（GPT-5.6），2026-07-20 07:46:09。

## 变动 68：`PersonalBoardManagement v1` 固化个人板块安全管理

- 意图：让 Web、微信和未来客户端在不复制平台编辑器的前提下，以同一纯契约维护设备私有板块。
- 决策：个人板块 ID 必须使用 `device_private_board_` 命名空间；`createPersonalCommunicationBoard` 创建空 BoardDTO 并拒绝重复 ID/名称，`renamePersonalCommunicationBoard` 只修改个人板块，`moveCommunicationBoard` 以不可变数组调整显示顺序，`removePersonalCommunicationBoard` 只删除空、无导航引用的个人板块。内置 CBoard 板块不能通过该契约改名或删除。
- 理由：板块名称和顺序属于跨平台业务数据，页面和弹窗属于平台 UI；把 mutation 留在纯核心可验证 BoardDTO 一致性，而删除保护可以防止微信低频工具误删默认内容、个人图卡或导航关系。
- 证据：共享核心 `5/5` 覆盖规范化创建、重复拒绝、个人板改名、边界排序、内置板保护、非空板保护和导航引用保护；CBoard production build 通过。微信 storage 回归与全量 `49 files / 187 tests`、TypeScript、ESLint、`151 app / 28 core`、production build 通过。
- 生效范围：共享 BoardDTO 个人板块 mutation、微信 backup 板块页面和未来平台 adapter；不修改默认板内容、TileDTO、matcher、历史、账号同步、OBF/OBZ 导入或 CBoard Web 原生 Board editor。运行态触控和重启恢复属于平台验收。
- 记录：Codex（GPT-5.6），2026-07-20 08:10:04。

## 变动 69：`OnDeviceBrowserSpeechRecognition v1` 固化浏览器本机识别渐进增强

- 意图：让支持浏览器设备内 Web Speech 的 CBoard Web 用户在普通话语言包就绪后获得离线语音输入，同时不增加跨平台核心与微信包体。
- 决策：能力门必须同时检测 `SpeechRecognition.available` 和 `install`；检查与安装参数固定为 `langs:['zh-CN']`、`processLocally:true`。只有状态为 `available` 且语言一致时才允许显式本机识别；浏览器离线时自动优先本机。安装只能由用户动作触发；不支持、失败或未就绪必须保留可编辑输入并给出明确状态。
- 理由：设备内识别属于浏览器 adapter，不属于表达管线、分词或 matcher。以可选 port 隔离实验 API，可以复用浏览器托管语言包而不把模型、React UI 或平台对象放进共享纯核心。
- 证据：MDN `SpeechRecognition.processLocally`、`available()`、`install()` 文档和 W3C Web Speech 规范；availability、install、`processLocally` 实例与 UI 选择测试通过。CBoard 全量 `173 suites / 1075 tests / 72 snapshots`、CRA ESLint 编译和 production build 通过，主 JS gzip `1.65 MB`，本变动约增加 `1.28 kB`。
- 生效范围：CBoard Web 接收端普通话浏览器语音 adapter；不适用于微信小程序、粤语、缺少实验 API 的浏览器或尚未安装语言包的设备，也不改变在线 ASR、TTS、后端、隐私同意、BoardDTO/TileDTO 和表达管线。真实 HTTPS/localhost 下载、断网麦克风和跨浏览器兼容仍是运行门；后台可操作微信开发者工具，但不得打开、置顶、聚焦或抢占用户输入。
- 记录：Codex（GPT-5.6），2026-07-20 08:29:49。

## 变动 70：`ImportReviewGate v1` 固化解析与最终合并边界

- 意图：让 CBoard 成熟导入器继续作为跨平台内容入口，同时保证照护者在任何 Board 或个人图库状态改变前拥有最终复核权。
- 决策：解析结果必须先转换为只读 review：文件名/格式、板块数、图卡数、可导入板块数、重复 ID、损坏/不支持条目和最多 20 个板块明细。JSON/OBF/OBZ 重复 ID 默认保留本机；图语家图库归档沿用显式 merge/skip。确认前不得调用 `requestQuota`、`syncBoardsWithAPI` 或 OBF/OBZ 媒体上传；确认失败保留 review 供重试，成功后才清空。
- 理由：格式解析、风险复核与状态提交是三个不同阶段。把提交门放在现有 adapters 和同步链之间，可以避免重写 CBoard 逻辑，又能阻止取消导入产生不可见副作用。
- 证据：review 纯函数覆盖冲突、损坏条目、可导入数量和图库合并摘要；adapter 测试证明嵌入媒体不在预览阶段上传；容器测试以真实 OBF 证明确认前零同步、确认后一次同步。定向 `5 suites / 16 tests / 3 snapshots`、全量 `175 suites / 1080 tests / 72 snapshots`、CRA ESLint 编译和 production build 全部通过。
- 生效范围：CBoard Web Settings Import 的 JSON/ZIP/OBF/OBZ 与图语家图库归档；不改变共享 BoardDTO/TileDTO、导出格式、微信消费端、服务端 API 或 CBoard 原编辑器。fixture 不代表全部第三方供应商扩展、超大文件、跨板链接或真实浏览器无障碍已验收；后台可操作微信开发者工具但不得打开、置顶、聚焦或抢占输入。
- 记录：Codex（GPT-5.6），2026-07-20 08:55:50。

## 变动 71：`PictogramLibraryDTO v1` 固化概念、图片资产与板布局分层

- 意图：为 CBoard Web、微信和未来客户端提供一个平台无关的结构化 AAC 图库交换契约，同时保留 CBoard BoardDTO/TileDTO 作为实际沟通运行模型。
- 决策：顶层固定 `dtoType: PictogramLibraryDTO`、`version: 1` 和 locale。`concepts` 保存规范名称、中英文名称、语言、keyPath、语义域、同义词、关联词、排除词、关键词、标签和复核状态；`symbolAssets` 保存图片、提供方/资产 ID/来源 URL、许可、署名、作者、类型、隐私 scope 和复核状态；`conceptSymbolLinks` 表达默认图与备选图；`boards` 保存行列和稳定 tile 顺序；`boardItems` 保存图卡位置、朗读、背景色和导航。创建时按 keyPath/稳定词义去重概念、按来源资产或图片哈希去重图片；读取时限制总量、校验唯一 ID、跨表引用和布局容量，再恢复为可继续被 matcher 消费的 BoardDTO。
- 理由：概念、图片、板和位置具有不同生命周期。全部塞进 Tile 会重复许可信息且难以表达一词多图；直接把结构化数据库当运行模型又会绕开 CBoard 成熟编辑、导航和同步。独立交换契约既可审计，又不会要求微信搬运 React DOM、Material UI 或第二套板实现。
- 证据：纯核心测试覆盖概念/图片去重、来源许可、BoardDTO 往返、synonym matcher、版本拒绝、断引用和布局错误；Web 导出、解析、统计复核和确认导入聚焦 `6/25/4`，全量 `177/1086/72` 与 production build 通过；微信 storage 往返 `3/3`、全量 `49/188`、TypeScript、ESLint、`151 app / 28 core` 边界和 production build 通过。
- 生效范围：共享 `pictogramLibrary.js`、CBoard Settings 结构化 JSON 导入导出、微信 `pictureLibraryStore` 和未来平台 adapter；不替代 OBF/OBZ、PictureLibraryArchive、默认 BoardDTO/TileDTO、公开图库 API 或平台完整编辑器。自定义概念缺少英文名时允许空值；未提供逐图许可时必须保持显式待补充状态，不能推断为公共许可。
- 记录：Codex（GPT-5.6），2026-07-21 09:02:09。

## 变动 72：`AuthenticatedSettingsUpsert v1` 固化账号设置单一所有权

- 意图：让 CBoard Web、微信和未来客户端复用通用 `/settings` 同步时，每个认证账号始终只有一份规范设置，且客户端不能通过整对象回写修改服务端身份字段。
- 决策：Settings 的首次读取和更新都以认证 `user.id` 为唯一键执行 Mongo 原子 upsert；模型增加 `{ user: 1 }` 唯一索引，并把该索引加入现有 communication readiness coordinator。更新入口只接受 CBoard 既有 `language/speech/display/scanning/navigation` 与图语家中性 `communicationSupport`、旧兼容 `tuyujia` 七个域；`id/_id/user/__v`、服务端时间和未知字段均不进入 `$set`，请求对象保持不变。读取失败必须返回错误，不再把空记录冒充 `200`。
- 理由：原 `getOrCreate` 采用先查后建且吞掉数据库异常，多设备同时首次同步可能产生重复 Settings；原控制器还逐键复制请求体并按整对象更新。按认证用户原子 upsert、字段白名单和唯一索引可以继续复用 CBoard 通用 API，同时防止所有权漂移、内部字段覆盖和空成功。
- 证据：Settings controller/model/index readiness 聚焦 `13 passing`；cboard-api 全部无数据库单元回归 `179 passing`、Passport `1 passing`、Swagger、Prettier、生产部署模板和 CRLF-aware diff check 通过。CBoard Web Settings/API 契约 `3 suites / 47 tests`、微信账号端口与云同步 `2 files / 24 tests` 通过，证明两端现有 partial patch 无需改变。
- 生效范围：cboard-api `GET/POST /settings`、Settings model 唯一索引、通信 readiness，以及 CBoard Web/微信现有 Settings 客户端契约；不改变七个设置域内部 schema、确认接收/常用语专用版本 API、私人图片、BoardDTO/TileDTO 或匿名身份。真实 Mongo 现有数据必须在部署前确认没有重复 `user` 记录；本轮未启动 Mongo/Docker，未提交、推送或部署，也未调用微信开发者工具。

## 变动 73：微信账号密码恢复复用 CBoard 既有接口

- 意图：补齐微信小程序已经能注册和登录 CBoard 账号、但忘记密码后只能离开小程序求助的可用性缺口。
- 决策：不新增图语家密码协议、数据表或邮件服务；微信 `CboardAccountPort` 直接复用 CBoard Web 已使用的匿名 `POST /user/forgot`。登录表单沿用当前邮箱输入，点击后只发送规范化邮箱，并显示不泄露账号是否存在的通用提示；密码仍不进入 storage、Settings 或沟通记录。
- 理由：CBoard Web、cboard-api Swagger 和控制器已经提供完整入口，另写微信专用认证会形成第二套账号生命周期。把平台差异限制在 Taro UI 和 request adapter，既符合复用优先，也不会增加微信依赖和包体。
- 证据：微信账号端口定向 `1 file / 15 tests`，全量 `58 files / 248 tests` 与产物质量 `4/4`、TypeScript、ESLint、`169 app / 29 CBoard core` 边界、44 板/825 图卡/775 图片一致性均通过。Taro production build 成功，产物包含 `account-password-reset-button` 和 `/user/forgot`；主包 `1,249,564 B`，距 1.5 MiB 建议线 `323,300 B`。
- 生效范围：微信 `packages/management` 账号设置、`CboardAccountPort` 与既有 cboard-api 密码恢复路由；CBoard Web 原重置界面和 API 协议不变。真实邮件发送仍要求部署手机可访问的 HTTPS cboard-api 并配置其邮件服务，本轮不把 mock/构建写成真实邮件验收；没有预览、上传、发布、部署、提交或推送，也没有调用、打开、聚焦或置顶微信开发者工具。
- 记录：Codex（GPT-5.6），2026-07-22 00:33:54。
- 记录：Codex（GPT-5.6），2026-07-22 00:22:13。

## 变动 74：`MissingTokenSuggestionSet v1` 固化有界多候选人工确认

- 意图：改善在线补图只保留单张搜索结果、照护者无法在同词不同图义之间选择的问题，同时避免自行研发第二套图片推荐算法。
- 决策：继续直接复用 ARASAAC 与 OpenSymbols 的原始搜索顺序；cboard-api 和微信 ARASAAC 直连端口对每个缺词最多返回 4 张、按稳定图片 ID 去重的候选。共享缺词记录新增可选 `suggestedPictograms`，旧 `suggestedPictogram` 与 `suggestedPictogramId` 始终镜像第一张以兼容旧设备。Web 与微信必须逐张展示来源和许可，由照护者明确选择后才解析缺词；微信只下载并持久化被选择的一张。
- 理由：AAC 图片是否适合患者不能仅由图源排序证明，单张结果又会放大图源第一名不准确的问题。保留供应商顺序并提供少量人工可审查候选，比增加未经研究的评分模型更符合图语家“人做最终修正”的核心原则；4 张上限也限制响应、storage、DOM/WXML 和图片下载压力。
- 证据：共享迁移和人工选择、Web 容器/队列聚焦 `5 suites / 52 tests`，Web 全量 `180 suites / 1144 tests / 72 snapshots` 与 production build 通过；cboard-api 图源/路由聚焦 `15 passing`、无数据库全量 `180 passing`；微信全量 `58 files / 249 tests`、质量门 `4/4`、TypeScript、ESLint、`169 app / 29 core` 边界和 production build 通过。小程序 main `1,249,564 B`、caregiver `548,216 B`，均低于 1.5 MiB 建议线。
- 生效范围：共享缺词 schema/migration、cboard-api ARASAAC/OpenSymbols 搜索响应、CBoard Web 缺图维护和微信接收端缺图维护；不改变本地确定性 matcher、图源许可白名单、供应商回退次序、公开上传、AI 生图或默认板。旧单候选记录继续可读；真实公网图源、微信合法域名和手机多候选触控仍需部署后验收。本轮没有预览、上传、发布、部署、提交或推送，也没有调用、打开、聚焦、抬升或置顶微信开发者工具。
- 记录：Codex（GPT-5.6），2026-07-22 01:07:35。

## 变动 75：`CommunicationServiceReadiness v1` 分离基础服务与可选 AI 状态

- 意图：让 CBoard Web 与微信照护者能够区分“未配置 API”“API 无法访问”“数据库或通信索引未就绪”“私有图库未配置”和“AI 未配置”，避免把所有失败都误报成 AI 或网络问题。
- 决策：直接复用 cboard-api 既有匿名 `GET /health`，不新增接口、鉴权、依赖或后台探测。共享纯核心只白名单归一化 `status/database/communicationIndexes/privatePictureLibrary` 并要求 `ok + connected + ready` 才声明基础服务就绪；Web 与微信仅在用户点击时检查，且请求只带 `Accept: application/json`。认证后的 `/gpt/communication/health` 继续单独检查 AI 与后备语音。
- 理由：数据库、索引、私有 Blob、账号、AI 和 TTS 属于不同能力层；合并提示会让部署和排错失去证据。现有 `/health` 已经由 cboard-api readiness coordinator 维护，复用它比新增客户端探测协议更小、更可靠，也不会向匿名端点发送患者数据或令牌。
- 证据：共享归一化、Web API/设置容器/组件聚焦 `4 suites / 52 tests / 1 snapshot`；CBoard 全量 `181 suites / 1150 tests / 72 snapshots` 与 production build 通过，主 JS gzip 约增加 `742 B`，Service Worker 约 `41.5 MB / 979 resources`。微信端口定向 `4/4`，全量 `59 files / 253 tests`、性能质量门 `4/4`、TypeScript、ESLint、`172 app / 29 core`、44 板/825 图卡/775 图片与 production build 通过；management `471,651 B`。
- 生效范围：共享只读 readiness schema、CBoard Web Communication Support 设置、微信 management 设置与生产产物门；不改变 cboard-api 协议、登录、Settings、同步、AI provider、患者沟通或离线兜底。真实公网 HTTPS、微信合法域名、Mongo/Blob/AI 凭据和手机网络仍需部署后验收；没有预览、上传、发布、部署、提交或推送，也没有调用、打开、聚焦、抬升或置顶微信开发者工具。
- 记录：Codex（GPT-5.6），2026-07-22 01:30:44。

## 变动 76：`CommunicationEnhancementHealth v1` 统一可选增强能力报告

- 意图：让照护者在 CBoard Web 与微信设置中分别判断候选句/分词、图片识字/图卡建议、粤语录音识别、图片去背景和服务端后备朗读是否完成服务端配置，而不是把所有增强能力压缩成一条“AI 已配置”。
- 决策：继续复用认证后的 `GET /gpt/communication/health`，只在原响应中追加 `imageAiConfigured`、`dialectAsrConfigured/provider/engine` 和 `backgroundRemovalConfigured/provider`；原 AI/TTS 字段全部保留。响应只报告非敏感配置状态，不返回密钥、腾讯凭据、去背景 endpoint 或患者内容。微信读取旧 API 响应时以原 `configured` 兼容图片 AI，其余缺失能力按未配置处理。
- 理由：OCR、图卡元数据建议、粤语 ASR 和去背景端点已经存在，但原健康接口只暴露 AI 与 TTS，造成“代码已迁移、用户却无法判断后端是否配置”的运维断层。增量扩展现有接口比新增探针或在客户端复制环境判断更小，也保持 CBoard 账号鉴权和离线兜底边界。
- 证据：cboard-api 针对性 `22 passing`、全部无数据库单元/路由回归 `181 passing`；微信 `59 files / 253 tests`、性能质量门 `4/4`、TypeScript、ESLint、`172 app / 29 core`、44 板/825 图卡/775 图片及 production build 通过；Web `181 suites / 1150 tests / 72 snapshots` 与 production build 通过。微信 main `1,249,564 B`，距 1.5 MiB 建议线 `323,300 B`，management `472,623 B`；Web 主 JS gzip 约 `1.66 MB`，本轮增量 `287 B`。
- 生效范围：cboard-api 认证增强健康响应、CBoard Web Communication Support 设置、微信 management 设置及其 adapter；不改变任何增强调用端点、provider 选择、登录、Settings、患者主链或离线规则。“已配置”只证明服务端环境可构造 provider，不证明公网域名、模型图片能力、真实凭据和手机请求已经成功；`https://api.app.cboard.io/health` 当前不包含 fork 扩展，完整图语家云端能力仍需部署本 fork。官方微信插件下载体积仍须上传前用性能扫描确认。本轮未调用、打开、聚焦、抬升或置顶微信开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-22 01:56:57。

## 变动 77：CommunicationEnhancementQuota v1 固化可选增强成本保护

- 意图：让 CBoard Web、微信小程序和未来客户端继续复用同一组可选增强服务，同时防止单个认证账号、故障客户端或自动重试无限消耗 AI、TTS、OCR、粤语 ASR、图卡建议和去背景提供方额度。
- 决策：不自研分布式计数器，cboard-api 复用 ISC 许可、零运行依赖的 [rate-limiter-flexible 11.2.0](https://github.com/animir/node-rate-limiter-flexible) Mongo adapter。生产默认并强制启用每分钟 30 点和每个 UTC 自然月 1000 点；文字润色 1 点，候选句/重新分词/粤语规范化/服务端朗读 2 点，粤语音频/图片识字/图卡元数据/去背景 4 点。计数键只保存 SHA-256 用户标识与计数，不保存文字、录音、图片、token 或 provider 密钥。分钟超限和月额度用尽都返回 429，但使用独立错误码、限额响应头和准确指向下一自然月的 Retry-After；计数存储不可用时返回 503。健康接口只追加是否启用、分钟点数和月点数，Web 与微信设置页展示同一策略；微信六类端口共用一个错误适配器并继续保留本地规则、手工输入、微信朗读或原图。
- 理由：CBoard API 已有认证和 MongoDB，现成库已经提供原子 Mongo 计数和统一 consume 接口，轻量接入比另建计费服务或自行实现并发计数更可靠。按操作成本计点比所有请求等价更接近真实外部开销，同时把保护层放在 Swagger 鉴权之后、controller 之前，不会让患者核心沟通依赖网络或付费服务。
- 证据：cboard-api 额度/健康/Swagger/生产模板定向 34 项、全部无数据库单元 190 项及生产模板校验通过。微信定向 36 项、全量 59 files / 259 tests、性能质量门 4/4、TypeScript、ESLint、173 app / 29 core 边界、44 板/825 图卡/775 图片和 production build 全部通过；main 1,249,564 B，距 1.5 MiB 预警线 323,300 B，management 474,188 B。CBoard Web 181 suites / 1150 tests / 72 snapshots 和 production build 通过，主 JS gzip 1.66 MB，本轮最终增量 86 B。三仓本轮文件的定向差分检查无空白错误。
- 生效范围：认证后的 editPhrase 与八类 Communication Support 增强操作、cboard-api 生产配置和健康契约、Web/微信照护设置及微信降级提示。核心图板、表达闭环、接收闭环、本地分词/matcher、WechatSI、本地图片和手工编辑不消耗点数。该契约不是 token 账单、付费订阅、支付接入或商业套餐，也不证明 provider、公网 HTTPS、微信合法域名和真机请求已经可用；生产仍须部署 fork 并配置真实服务。官方微信插件下载大小仍须上传前在开发者工具性能扫描中验证。本轮只用后台 shell/apply_patch/测试/构建，没有调用、打开、聚焦、抬升或置顶微信开发者工具，没有预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5），2026-07-22 02:26:33。

## 变动 78：`CommunicationEnhancementLimitFeedback v1` 补齐 Web 实际操作降级

- 意图：让 CBoard Web 不只在设置页看到增强额度策略，在候选句、分词、粤语、识字和图卡编辑的真实操作失败时也能区分短时拥塞与月额度用尽，并继续完成核心沟通。
- 决策：复用微信端已经验证的 429 错误契约，在 Web 中增加无依赖纯分类器；只读取 HTTP `429` 和 cboard-api 的 `COMMUNICATION_MONTHLY_QUOTA_EXCEEDED` 标准错误码，其他 429 视为分钟级短时限流。候选句保留本地候选，AI 分词保留人工可编辑结果，粤语文字转换继续使用本地高置信词典，粤语录音和 OCR 保留手工输入，图卡元数据建议保留上传图片，去背景保留原图。服务端原始 message 不直接显示。
- 理由：设置页可诊断性不能代替任务现场的可恢复提示；如果实际操作仍统一显示“服务不可用”，照护者无法判断应稍后重试还是本月继续使用本地能力。共享纯分类器消除了六处重复解析，也不需要引入组件库、计费 SDK 或第二套网络协议。
- 证据：分类器、候选句、接收端和 TileEditor 定向 `4 suites / 49 tests / 2 snapshots` 通过；CBoard 全量 `182 suites / 1160 tests / 72 snapshots` 与 production build 通过。主 JS gzip `1.66 MB`，本变动相对上一构建增加约 `979 B`；Service Worker 仍为约 `41.5 MB / 979 resources`，本轮定向 `git diff --check` 无空白错误。
- 生效范围：CBoard Web 候选句 AI、AI 重新分词、粤语文字规范化、粤语录音识别、图片 OCR、图卡元数据建议和图片去背景；不改变 cboard-api 限额、provider、BoardDTO/TileDTO、matcher、本地 TTS、账号、同步或微信实现。CBoard Web 当前朗读仍走既有 SpeechProvider，不把未使用的服务端 TTS 端点冒充已接入。真实公网 429、生产 Mongo 并发和跨浏览器 Portal 视觉仍需部署后验收。本轮只用后台 shell/apply_patch/测试/构建，没有调用、打开、聚焦、抬升或置顶微信开发者工具，没有预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5），2026-07-22 02:43:51。

## 变动 79：`MainlandChinaAccountPhone v1` 复用原图语家账号手机号规则

- 意图：把原图语家已经验证的“注册时填写手机号、服务端唯一保存、登录后只显示脱敏号码”迁入 CBoard 全平台账号底座，同时保留 upstream CBoard 用户不填写手机号的兼容路径。
- 决策：共享纯核心统一执行“删除非数字、`^1\d{10}$` 校验、`138****8000` 脱敏”；CBoard Web 注册页把中国大陆手机号作为可选字段，小程序图语家注册页要求填写；两端只消费服务端返回的 `phoneMasked`，不得持久化或展示原始号码。cboard-api 在正式用户和邮件激活临时用户中同时检查重复，User 模型使用 sparse unique 字段，并在序列化时删除原始 `phone`。
- 理由：原 PicInterpreter 已有同样的 normalize/validate/mask 与唯一性测试，可以直接迁移而无需引入手机号 SDK。CBoard upstream 面向全球用户，强制中国大陆号码会破坏既有注册；图语家小程序的产品入口可以在平台 adapter 层收紧。格式和唯一性不能证明号码所有权，因此本变动不伪装成短信验证码。
- 证据：CBoard 手机号与 Settings 定向 `3 suites / 7 tests / 1 snapshot`，全量 `187 suites / 1233 tests / 72 snapshots`、ESLint 和两次 production build 通过；cboard-api 手机号、并发冲突与 User readiness 定向 `15 passing`，全部无数据库单元/路由 `201 passing`，健康门会显式执行 `User.createIndexes()`，隔离测试证明 `phone_1 unique + sparse` 同时存在于正式 User 和邮件激活临时 User，临时用户唯一索引竞态返回有界 `409`，其他存储错误不再泄露内部信息；微信端口与 session 定向 `2 files / 21 tests`，全量 `64 files / 277 tests`、TypeScript、ESLint、`184 app / 29 core`、默认板完整性和 production build 全部通过。
- 生效范围：CBoard Web 本地注册表单、cboard-api `/user` 注册与 User JSON、微信 management 账号注册/登录/session，以及复用同一 Web build 的 Cordova/Electron 壳。旧账号、第三方登录和不含 `phone` 的 upstream 客户端继续兼容；不包含短信发送、验证码、找回密码手机号通道、号码所有权证明或国际号码。Cordova 包已重新以 `PUBLIC_URL=.` 构建并验证 `3,952 files / 124,733,961 bytes`，source build 与 `www` 主 bundle SHA-256 一致。本轮没有预览、上传、发布、部署、提交或推送，也没有打开、聚焦、抬升或置顶任何窗口。
- 记录：Codex（GPT-5.6），2026-07-22 08:22:37。
- 补充记录：Codex（GPT-5.6），2026-07-22 08:41:19；手机号并发重复键和非重复存储错误已收口，API 全量增至 `200 passing`。
- 补充记录：Codex（GPT-5.6），2026-07-22 09:18:44；临时用户索引继承已形成无网络隔离测试，API 定向 `15 passing`、无数据库全量 `201 passing`。

## 变动 80：`PhoneRegistrationVerification v1` 固化跨端一次性手机验证

- 意图：在不拆分 CBoard 账号体系的前提下，补齐原图语家手机号注册“格式正确但未证明归属”的最后一段工程闭环。
- 决策：Web 与微信共同复用中性 `accountPhoneVerification` 判断，验证码是否有效必须同时匹配当前规范化手机号和 64 位一次性令牌；改变手机号立即失效。两端都通过 cboard-api 的公开配置、发送、确认端点取得令牌，再沿用 `POST /user` 注册。供应商签名、验证码哈希、尝试次数、限流和令牌消费全部留在 API；客户端不保存验证码令牌。
- 理由：验证码归属是账号领域契约，不应分别写进 Material UI 与 Taro 页面；供应商和安全状态又不应进入纯客户端核心。共享无副作用判断加平台 UI adapter，可以保持 upstream 邮箱注册兼容，并防止令牌被换绑到另一个手机号。
- 证据：CBoard Web `189 suites / 1238 tests / 72 snapshots` 和 production build 通过；cboard-api 无数据库回归 `221 passing`、生产模板与 frozen lock 通过；微信 `64 files / 278 tests`、质量门 `7/7`、TypeScript、ESLint、`184 app / 29 core` 边界和 production build 通过。腾讯云官方 SDK与既有 Mongo 限流库均直接复用。
- 生效范围：CBoard Web 注册、微信账号注册、cboard-api 中国大陆手机号 challenge/confirm/registration；不改变登录、邮箱激活、第三方账号、患者离线沟通、分词、matcher、图板、语音或同步。真实短信仍需腾讯云套餐、已审核签名/模板、独立凭据、生产 HTTPS 和物理手机收码验收。本轮没有发送短信、产生费用、打开或置顶任何窗口，也没有提交、推送、部署、预览、上传或发布。
- 记录：Codex（GPT-5.6），2026-07-22 10:28:30。

## 变动 81：`BrowserAudioLevelMonitor v1` 补齐真实麦克风音量反馈

- 意图：补齐图语家 issue #16 在 CBoard Web 的真实语音反馈，让照护者能判断麦克风是否采到声音，同时不再使用与说话无关的循环动画或延迟文字回调冒充波形。
- 决策：不引入第三方波形依赖，直接复用浏览器原生 `getUserMedia`、`AudioContext`、`AnalyserNode.getByteTimeDomainData()`；以 256 点时域样本计算 RMS，扣除小噪声底后归一化为 `0..1`，每 80 ms 采样并按 `0.05` 量化以限制 React 重绘。语音识别 `onstart` 后异步启动音量监测，不等待授权或 AudioContext，因此不阻塞首个识别结果；重启、停止、结束、报错、卸载和延迟授权竞态均停止 MediaStream track、断开 source、关闭 AudioContext。UI 七段柱只由真实数值控制且无 keyframe；不支持或权限失败时显示静态监听状态。微信继续保留 WechatSI 静态状态，因为插件不暴露原始振幅；Cordova 插件激活时也不冒充浏览器音量可用。
- 理由：MDN 将 `getByteTimeDomainData()` 和 `getUserMedia()`列为跨浏览器成熟能力；使用 Web 标准比引入 waveform npm 包更小、更可维护，也避免依赖长期状态。RMS 足以表达麦克风活动强弱，但不是频谱或诊断级声压，因此界面明确称为“实时麦克风音量”。WechatSI 只有延迟文字事件，另启 RecorderManager 可能争用麦克风，诚实静态状态优于伪实时动画。
- 证据：新核心覆盖静音归零、递增/截断、量化、真实采样、权限拒绝、资源回收和延迟授权取消；Hook 覆盖启动、数值暴露、停止、结束和卸载；UI 覆盖七段 meter、无障碍百分比与无波形降级。聚焦 `3 suites / 35 tests`、CBoard 全量 `190 suites / 1249 tests / 72 snapshots` 和 production build 全部通过；主 JS gzip 相对上一构建约增加 `1.54 kB`、CSS 增加 `265 B`，无新依赖或静态资源。`git diff --check` 无空白错误。
- 生效范围：CBoard Web 普通浏览器的 Communication Support 接收端和复用同一 Web build 的 Electron；需要 HTTPS 或 localhost 以及用户麦克风权限。不会保存、上传或播放监测流，也不改变 SpeechRecognition 自身是否使用远端服务、最终文字/分词人工修改、matcher、TTS、微信 RecognitionPort 或 Cordova 设备内识别。真实浏览器权限、不同设备噪声底和 Electron 麦克风仍待人工验收。本轮没有调用、打开、聚焦、抬升或置顶任何窗口，也没有预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-22 10:50:04。

## 变动 82：`CommunicationAiUsage v1` 只读展示服务商实际 Token

- 意图：让 CBoard Web、微信和未来客户端通过同一 CBoard API 查看当前账号本月真实模型用量，而不是各自在设备上猜测 Token 或只看到请求点数额度。
- 决策：规范来源为认证 `GET /gpt/communication/usage`；客户端只消费 `month/requestCount/reportedRequestCount/unreportedRequestCount/promptTokens/completionTokens/totalTokens/providerReported`，不接收患者正文或账本内部用户 ID。Web 与微信把它追加到既有增强服务状态文案；请求失败或旧服务器返回 404 时不影响原健康检查和离线沟通。
- 理由：Token 计量属于服务端提供商响应事实，客户端无法准确重算；只读摘要能保持跨端一致，也不会把账本写入 Settings、storage 或沟通历史。
- 证据：CBoard API 客户端与设置容器聚焦 `49/49`，Web 全量 `190 suites / 1251 tests / 72 snapshots` 与 production build通过；微信端口 `8/8`、全量 `64 files / 279 tests`、类型、Lint、边界和 production build通过。Web 主 JS gzip 增量约 `219 B`，微信无新增依赖、插件或媒体。
- 生效范围：CBoard Web Communication Support 设置、微信 management 增强状态和未来 API 客户端；不改变模型调用、Token 价格、点数额度、支付、患者主链或本地降级。真实 provider/Mongo、公网部署与手机 UI仍待验收；本轮未打开、聚焦、抬升或置顶窗口，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-22 11:48:32。

## 变动 83：增强状态不得由空账本或限流误报为已配置

- 意图：保证照护者点击“检查增强服务”时，页面表达的是当前真正可调用的服务，而不是因为存在空 Token 账本或服务端限流策略就显示“已配置”。
- 决策：Web 先由健康响应中的文字 AI、图片 AI、粤语 ASR、去背景或后备朗读任一实际 provider 配置计算 `enhancementConfigured`；只有该值为真时才查询并展示 Token 用量和成本保护。所有 provider 均未配置时直接保留“AI 未配置”，不把空账本或单独限流列入能力清单。
- 理由：账本是历史审计事实，限流是保护策略，两者都不是当前 provider 可用性的证据。把它们单独当成 capability 会让用户误以为云增强已经配置，也会掩盖部署缺口。
- 证据：新增“所有 provider 未配置但限流开启”回归，聚焦 `1 suite / 11 tests`；CBoard 全量 `190 suites / 1252 tests / 72 snapshots` 和 production build全部通过，主 JS gzip 相对上一构建只增加约 `40 B`。API 账本聚焦 `50 passing`、无数据库全量 `232 passing`。
- 生效范围：CBoard Web Communication Support 设置中的增强服务状态；不改变 cboard-api 健康/用量契约、微信显示、实际模型调用、限流、离线沟通或历史账本。真实 provider、公网部署和手机展示仍待外部验收；本轮没有预览、上传、发布、部署、提交或推送，也没有打开、聚焦、抬升或置顶任何窗口。
- 记录：Codex（GPT-5.6），2026-07-22 12:01:46。

## 变动 84：`CommunicationAiLiveProbe v1` 复用候选句端点

- 意图：把原图语家设置页的真实后端 AI 测试迁入 CBoard，而不是用 health 或配置字段冒充模型可调用。
- 决策：探针只通过现有认证 `POST /gpt/communication/sentences` 发送固定 `pictogramLabels: ['我', '喝水']` 和 `candidateCount: 1`；不传患者输入、历史、反馈或场景。非空候选才成功，响应最多展示 120 字；限流与月额度沿用共享分类器，其他错误统一为本地文案。按钮在访客态和请求进行中禁用，并明确一次成功探针会消耗增强额度、记录 provider usage。
- 理由：真实业务端点可以同时验证认证、API、provider、模型、限流和响应解析，信息量高于配置检查；复用现有调用链也避免新增 SDK、探针路由和第二套日志。
- 证据：容器测试精确断言固定 payload，覆盖非空成功和月额度错误脱敏；组件快照、TuYuJia 包装 fixture 与 production build 通过。全量结果为 `190 suites / 1254 tests / 72 snapshots`，包装层告警修正后聚焦 `1 suite / 2 tests` 通过；主 JS gzip 约 `1.66 MB`，相对前一构建增加约 `566 B`。
- 生效范围：CBoard Web Communication Support 设置及复用同一 Web build 的 Cordova/Electron；不自动发送患者数据，不改变 health、usage、候选生成语义、本地回退、套餐或支付。真实 provider 和部署环境仍需人工触发验收。本轮未打开、激活、聚焦、抬升或置顶窗口，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-22 12:21:04。
- 补充记录：Codex（GPT-5.6），2026-07-22 12:38:49；恢复原图语家真实 AI 测试的 10 秒超时语义。仅该入口向现有 sentence API 传入 Axios timeout，`ECONNABORTED` 映射为本地脱敏提示并释放 busy 状态；普通表达候选调用保持原超时策略。API/容器聚焦 `2 suites / 22 tests`，全量 `190 suites / 1256 tests / 72 snapshots` 与 production build通过，主 JS gzip 增加约 `159 B`。未打开、激活、聚焦、抬升或置顶窗口，未预览、上传、发布、部署、提交或推送。

## 变动 85：`CrossPlatformTileVoiceRecording v1` 复用浏览器与 Cordova 录音

- 意图：让 CBoard 既有图卡声音编辑能力在 Web、Electron、Android 和 iOS 使用各平台成熟录音实现，而不是把 WebView 是否恰好支持 `MediaRecorder` 当成原生端契约。
- 决策：`VoiceRecorder` 只消费统一 session；浏览器/Electron session 继续使用标准 `getUserMedia + MediaRecorder`，Android/iOS session 复用 ccboard 已安装的 Apache Cordova Media/File 插件。两条路径最终都产出原有 data URL 并交给 `TileEditor.handleSoundChange`，因此 `TileDTO.sound`、保存、上传和 `expressionPlayback` 不变。原生临时文件只位于私有 cache，读出后立即删除；录音最长 30 秒，并在停止、错误和卸载时释放全部资源。ccboard iOS 声明明确的 `NSMicrophoneUsageDescription`。
- 理由：现有 `TileEditor`、`VoiceRecorder`、声音上传和混合播放已经形成主链，ccboard 也已有 `cordova-plugin-media@7.0.0`；薄平台适配比新增 SDK、复制小程序录音端口或修改数据模型更符合完整复用 CBoard 的决策。
- 证据：适配器、组件、TileEditor、表达混播和翻译 `5 suites / 22 tests / 3 snapshots`，目标 ESLint与 production build 通过；build 产物包含原生适配标记。ccboard `10/10` 测试确认 Media 插件、Android 录音权限及 iOS用途声明存在。本机 upstream `430303dcf693d69849d6f1e758f6fe9734b6bae7` 仍只有浏览器实现，故本变动是 fork 的真实平台补线而非重复同步。
- 生效范围：CBoard Web/Electron/ccboard Android/iOS 的图卡录制、试听、清除和声音混播；不改变微信录音、BoardDTO/TileDTO、语音识别、TTS、API 或同步。Android/iOS 真机权限与录放仍待物理设备验收；未打开或置顶窗口，未提交、推送、部署、预览、上传或发布。
- 记录：Codex（GPT-5），2026-07-26 15:46:18。

## 变动 86：`AndroidCoreRecordingBuildGate v1` 验证最终原生包

- 意图：让 Android 图卡录音能力以最终 APK 而不是源码声明或 Web 测试作为发布前证据。
- 决策：复用 ccboard 隔离构建器、Cordova Android 14.0.1、Apache Cordova Media/File、本地语音识别插件和本机已有 SDK/JDK/Gradle。核心构建注册表必须包含 `cordova-plugin-media` 与 `cordova-plugin-speechrecognition`，必须排除 `cordova-plugin-firebasex`；报告固定输出录音/识别布尔证据、APK 字节数和 SHA-256。CBoard Web 先以 `PUBLIC_URL=.` 重新打包，源仓库不落地 `platforms/` 或 `plugins/`。
- 理由：配置和单元测试不能证明 Cordova 解析、Manifest 合并、Web 资源复制及 Gradle 装配后的最终结果；在既有脚本中增加失败即停的断言，比自建原生工程、复制播放器或人工逐包检查更小且可重复。
- 证据：CBoard 全量 `201 suites / 1368 tests / 72 snapshots` 与 production build 通过，Cordova Web 包为 `3960 files / 124,925,656 B`；ccboard `10/10` 测试通过。真实 debug APK `57,970,464 B`，SHA-256 `801859632c5303698171a41bf6d7b1ec5a35e1100c411b661d79c3f32f479764`；最终插件注册表含 Media/语音识别且不含 Firebase，主 JS 含原生录音 adapter 标记，Manifest 含 `android.permission.RECORD_AUDIO`。
- 生效范围：ccboard Android 核心调试包和原生录音构建门；不改变 TileDTO/BoardDTO、CBoard Web 行为、iOS、微信录音、生产签名、Firebase 生产构建或服务端。物理 Android 设备上的权限、录音、播放、后台切换和恢复仍待验收；未打开或置顶窗口，未提交、推送、部署、预览、上传或发布。
- 记录：Codex（GPT-5），2026-07-26 16:18:12。

## 变动 87：`GlobalSymbolsServerAdapter v1` 固化跨端授权图源契约

- 意图：在 Global Symbols v1 即将停用前，把 CBoard 原有直接搜索迁成 Web、微信和未来客户端均可复用的服务端图源契约，并保持公开图卡的许可可追溯。
- 决策：规范入口为 cboard-api `POST /pictograms/globalsymbols/search` 与 `GET /pictograms/globalsymbols/{token}/image`。v2 key 只参与服务端 `X-Api-Key` 上游请求；图片 URL 必须为 `globalsymbols.com` 或其子域 HTTPS，无账号信息，之后以独立 HMAC secret 签名并用既有 Sharp helper 转为有界 PNG。运行时只接受含 `provider/originalId/name/license/sourceUrl` 的完整 v2 归因；Web 编辑器可在新 API 不存在时暂时回退 v1，但不得为 v1 结果伪造许可证。客户端只信任 API 同源代理图片。
- 理由：官方 v2 认证要求不能安全下放到浏览器、Cordova 或小程序；Global Symbols 原始图可能是 SVG，微信兼容和内容边界需要统一 PNG。把 provider 放入已有 `PictogramAttribution`、`RuntimePictogram` 和 `/pictograms/search` 管线，可以继续复用候选排序、照护者确认、设备缓存和离线恢复，而不复制第二套图源模型。
- 证据：cboard-api Global Symbols、归因、运行时降级和 Swagger 路由 `33/33`，无外部服务单元 `365/365`；CBoard Web `201 suites / 1373 tests / 72 snapshots` 与 production build；微信 `75 files / 329 tests`、类型、Lint、边界、质量门和 production build 全部通过。测试覆盖服务端 key 不泄漏、独立 secret、主机白名单、HMAC 拒绝、SVG→PNG、ARASAAC 优先、v1 编辑器兼容、API 同源绝对地址、候选归因传递及 Tile 写回。
- 生效范围：cboard-api 图源适配与部署模板、CBoard Web `API/SymbolSearch/TileEditor`、共享公开归因核心，以及微信 `/pictograms/search` 同源候选下载；不改变 BoardDTO/TileDTO 版本、ARASAAC 审核索引、OpenSymbols、设备私图、分词、matcher、语音、AI、账号或同步。真实 key、生产部署、公网域名和真机仍待外部验收；本轮未提交、推送、部署、预览、上传或发布。
- 记录：Codex（GPT-5），2026-07-26 17:10:26。

## 变动 88：`PictogramAttributionPreview v1` 固化选图前归因可见性

- 意图：把公开图符的来源与许可从“保存后元数据”提升为“家属选择前可见”的交互契约。
- 决策：CBoard `SymbolSearch` 复用 `formatPictogramAttribution`，只有 `normalizePictogramAttribution` 接受的完整元数据才显示图集、作者和许可；无归因候选维持原尺寸和布局。Global Symbols v2 候选显示后仍把同一对象传给 TileEditor，禁止 UI 自行猜测或补造许可。
- 理由：归因不是装饰信息，而是公开图符被收纳进个人板前的知情依据；使用已经跨端验证的纯核心可避免搜索、接收展示和分享各自形成不同格式。
- 证据：组件回归覆盖有归因显示、无归因不占空间和选择后写回，连同纯核心共 `2 suites / 10 tests / 1 snapshot`；production build 通过，JS/CSS gzip 增量分别约 `42 B`/`96 B`，无新增依赖。
- 生效范围：CBoard Web、Electron 与 Cordova 共用的 SymbolSearch 候选 UI；微信继续使用其既有缺词候选归因展示。契约不改变 `PictogramAttribution`、TileDTO/BoardDTO、搜索排序或服务端 provider；真实 Global Symbols v2 key、生产部署和移动端视觉仍待外部验收。本轮未提交、推送、部署、预览、上传或发布，也未打开或置顶窗口。
- 记录：Codex（GPT-5），2026-07-26 17:23:38。

## 变动 89：`CboardAiEngineGlobalSymbolsV2 v1` 固化生成板图源契约

- 意图：让 CBoard 官方 AI engine 与 Web/API 已采用的 Global Symbols v2、公开归因和 Open Board 图片契约保持一致。
- 决策：引擎默认使用 v2，API key只保留在初始化它的服务端进程，并限定发往 Global Symbols HTTPS 主机；Suggestion 的每张公开图可携带真实归因，OBF image 使用图库自身许可。Core Board 图片按原词索引，缺失图只让对应按钮无 `image_id`，不得把下一词的图前移；上游请求保持顺序并限制四并发。
- 理由：官方 engine 已经提供成熟的 OpenAI 建议、ARASAAC/Global Symbols 查图和 OBF 生成，修复适配器比复制第二套生成器更可维护；数组位置绑定在任一词缺图时会生成危险错图，虚构统一许可则破坏归因审计。
- 证据：6 项 `node:test + tsx` 无网络回归、TypeScript、CJS/ESM/DTS production build和差分检查通过；测试覆盖 key 主机白名单、恶意图片域拒绝、真实 CC BY-SA 4.0、SVG content type、有界并发及缺图索引。官方文档证明 v2 key/限流，官方引擎 README证明旧默认仍为 v1。
- 生效范围：`cboard-ai-engine` 生成建议与 Core Board OBF，供未来 CBuilder/API 服务端复用；不会在 Web/微信客户端保存密钥，不改变现有双向沟通运行管线。真实 key、AI provider、CBuilder集成和生成板人工质量仍待外部验收；v1 只作为显式临时兼容，公共投稿与动画符号不在本契约内。本轮未提交、推送、部署、预览、上传或发布，也未打开或置顶窗口。
- 记录：Codex（GPT-5），2026-07-26 17:38:30。

## 变动 90：`EncryptedPrivatePictureSnapshot v2` 固化账号私人图片密文边界

- 意图：在保留“私人图片”和“完整私有数据”两个独立账号快照的前提下，阻止 CBoard API、数据库和对象存储读取家庭照片明文。
- 决策：继续复用共享 `PictureLibraryArchive v1` 作为解密后的图片载荷，并复用已经跨 Web/微信验证的 Noble `scrypt + XChaCha20-Poly1305` 与 `PIE2EE01` 信封；浏览器只在内存构建 ZIP、以至少 12 字符恢复密码加密后上传 `.pijenc`。图片端点固定为 `picinterpreter-private-picture-library-encrypted` contract v2，完整数据端点继续使用独立格式；旧明文图片快照只允许查看迁移提示和删除，读取返回 `409 PRIVATE_PICTURE_LIBRARY_REENCRYPTION_REQUIRED`。
- 理由：认证和私有 Blob 只能限制访问者，不能形成服务端不可读的端到端加密；复用同一经审计纯核心比自研第二套密码学更安全，也让 Web、微信和未来客户端保持同一恢复格式。两个端点继续独立则不会把沟通历史悄悄混入“只备份图片”的用户承诺。
- 证据：CBoard API 客户端、导入导出容器、组件和加密 adapter 聚焦回归通过；CBoard 全仓 `203 suites / 1401 tests / 72 snapshots` 全通过，production build 成功并生成加密动态分块。cboard-api 图片归档与路由 `14/14`、全部无外部服务控制器 `374/374`；微信 `76 files / 339 tests`、TypeScript、ESLint、边界、质量门和 production build 全部通过。
- 生效范围：CBoard Web/Electron/Cordova 共用的 Settings 私人图片上传与恢复、共享密码/加密核心，以及 cboard-api `/communication/private-library`；不改变本机明文 ZIP 导入导出、默认板、患者表达、分词、matcher、语音、普通 Settings 或独立完整私有数据快照。真实 HTTPS/Azure/Mongo、两台物理设备、弱网、低内存 KDF 延迟和忘记密码仍待部署与真机验收；本轮未提交、推送、部署、预览、上传或发布，也未打开或置顶窗口。
- 记录：Codex（GPT-5.6），2026-07-27 02:19:50。

## 变动 91：私人图片密文快照进入 CBoard 生产浏览器运行门

- 意图：把变动 90 的纯核心、组件和 production build 证据推进到真实生产页面操作，证明桌面和移动视口都能完成“端侧加密上传 → 错误密码拒绝 → 正确密码解密复核 → 恢复持久化”。
- 决策：复用项目现有 Playwright、生产静态服务器、Settings 页面、Redux Persist 和浏览器 repository；测试只在 BrowserContext 内替代认证 API/Blob 存储边界，不替代归档、密码学、上传表单、下载、解密、复核或恢复代码。上传必须具有 Bearer token、`.pijenc` 文件名和 `PIE2EE01` magic，且不得以 ZIP magic 开头。移动布局按 Material UI v4 的真实 DOM 结构处理：`ListItemSecondaryAction` 是卡片根节点的相邻兄弟，窄屏时让它回到父容器文档流，不使用强制点击掩盖遮挡。
- 理由：单元测试和构建成功不能证明生产路由、动态加密分块、multipart 上传、Material UI Portal、浏览器持久化及移动触控可以共同工作；API 边界内存替身可在不需要真实账号、云存储或外部凭据的情况下重复验证客户端隐私不变量。
- 证据：最终 `npm run build` 成功；合并后的 `tests/offline/private-cloud-encryption.spec.js` 中私人图片用例在 desktop Chrome、Pixel 5 竖屏和 Pixel 5 横屏 `3/3` 通过，分别约 `8.3 s / 12.8 s / 8.0 s`。测试真实捕获 multipart 密文字节，验证错误密码不产生恢复结果、正确密码进入 Import review，并在确认后轮询 localStorage 中恢复的个人图、图卡与板数据。失败诊断曾证明下一张完整数据卡片拦截私人图片按钮，改用相邻兄弟响应式布局后真实 click 通过；production build 的既有 AAC vendor ESLint 警告未新增。
- 生效范围：CBoard Web Settings 私人图片账号快照的生产浏览器桌面/移动布局与离线 API 边界运行证据，以及复用同一 Web bundle 的 Electron/Cordova UI；不代表真实 HTTPS、Azure、Mongo、两台物理设备、Cordova 原生 WebView、弱网中断、低内存 KDF 或忘记密码已验收。本轮未操作微信开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 03:00:18。

## 变动 92：完整私有数据密文快照进入 CBoard 生产浏览器运行门

- 意图：补齐完整账号快照只有纯核心、容器和构建证据的缺口，证明常用语、删除墓碑、双向沟通历史、接收纠错和候选反馈能够由生产 Settings 页面加密上传并在另一轮本机状态中恢复。
- 决策：把私人图片与完整数据合并到同一 `private-cloud-encryption.spec.js` 和通用 multipart/API helper；两类快照继续使用不同端点、文件名、格式和恢复按钮。完整数据测试先向真实 browser repository 写入六类 sidecar，上传时直接审计 `.pijenc`、Bearer、`PIE2EE01` 和非 ZIP magic；随后清空全部六类 storage，以错误密码验证零写入，再以正确密码进入现有 Import review 并确认恢复，最后刷新页面复查持久化。
- 理由：复用同一生产运行门能避免复制认证、密文截取和移动视口编排；单独验证图片不能外推到完整数据，因为后者还经过 compact archive、严格 sidecar parser、身份重绑定、合并策略和六个 repository key。错误密码测试必须检查 storage 仍为空，不能只看通知文案。
- 证据：同一已成功的 production build 上，desktop Chrome、Pixel 5 竖屏和 Pixel 5 横屏各执行私人图片与完整数据两条用例，共 `6/6 PASS`，总用时约 `1.1 min`；完整数据单条约 `8.1 s / 12.9 s / 8.5 s`。恢复后六类集合共 6 条记录，ID、患者/工作区身份和刷新后内容逐项验证；`node --check`、目标 ESLint、未跟踪文件空白检查均通过，Playwright 临时目录已删除。
- 生效范围：CBoard Web Settings 完整私有数据账号快照的生产浏览器桌面/移动运行证据，以及与私人图片共享的测试基础；不改变加密算法、API、归档 schema、业务 UI、微信实现或真实云状态。不等同于 Azure/Mongo/HTTPS、跨两台物理设备、Cordova WebView、弱网中断、低内存 KDF 或忘记密码验收；未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 03:08:21。

## 变动 93：`/demo` 双向沟通进入生产浏览器三视口运行门

- 意图：把图语家免登录演示从“代码、组件和 HTTP 可达”推进到真实生产页面闭环，证明访客可以体验患者表达与照护接收，同时不会进入账号/设置或污染正常 CBoard 数据。
- 决策：继续复用 CBoard 正式 `BoardContainer`、Redux 板导航、`CommunicationSupport`、Material UI 全屏 Dialog 和现有 Playwright production harness，不建立演示专用图板或第二套沟通页面。演示模式的板切换只更新 CBoard 自己的 board/navHistory，不再把地址从 `/demo` 改写为 `/board/*`；普通模式保持原 `history.push/replace` 调用。演示横幅遵循 Material UI 层级，固定在普通页面上方但低于 Dialog `1300`，避免遮挡全屏返回键。离线 E2E 仅同步当前管理对话框的可访问标题，不改变纠错或匹配语义。
- 理由：生产 trace 证明首次默认板加载会把 `/demo` 改成 `/board/root`，导致 Navbar 按普通模式重新显示账号；真实 click 又证明原横幅 `z-index: 1600` 会覆盖全屏接收端返回按钮。沿用 CBoard 的板状态并只隔离浏览器路由，比复制 demo 状态机更小、更可靠；沿用 Material UI 标准层级比强制点击或提高单个按钮层级更可维护。
- 证据：容器、Board、Navbar、App 与 demo 聚焦 `5 suites / 23 tests / 2 snapshots` 通过；目标 ESLint、`git diff --check` 和 `npm run build` 通过，构建只保留既有 AAC vendor 警告。`communication-support-demo.spec.js` 与原离线闭环在 desktop Chrome、Pixel 5 竖屏、Pixel 5 横屏共 `6/6 PASS`；演示用例真实验证账号/设置入口缺席、患者点图与候选确认、照护输入转图片、全屏反馈、双向历史、刷新清空会话，以及预置正常 localStorage 逐项不变。失败 trace 和临时目录均已清理。
- 生效范围：CBoard Web fork 的 `/demo`、演示模式内部板路由、演示横幅与 Web 双向沟通生产运行门；普通 `/` 和 `/board/*` 路由、BoardDTO/TileDTO、账号、云同步、matcher、分词、微信小程序与 API 均不变。不等同于公开 GitHub Pages 部署、真实辅助技术或物理移动设备验收；本轮未打开或置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 03:36:09。

## 变动 94：候选反馈进入 CBoard 生产浏览器持久化运行门

- 意图：证明“有帮助/不符合”不是候选句上的装饰字段，而是能在真实患者表达页面即时保存、随确认并入历史并在刷新后继续可用的反馈闭环。
- 决策：继续复用 `CandidateFeedback v1`、ExpressionLoopPanel、浏览器 repository、表达历史和既有 production offline Playwright；不新增反馈 API、页面或测试专用存储。运行门在候选句同级反馈组中使用可访问名称点击“有帮助”，先审计独立草稿 key，再确认表达并审计草稿清除和 `history[].candidates[].feedback`，最后在离线刷新后复查同一反馈。
- 理由：组件测试能证明回调参数，却不能证明真实候选 DOM、触控区、localStorage repository、草稿到确认记录的 ID 迁移和 Service Worker 离线刷新共同工作。沿用原离线沟通用例可以复用同一患者点图、TTS 停止、双向历史和三视口环境，避免第二套夹具。
- 证据：目标 ESLint 与 `git diff --check` 通过；`communication-support-offline.spec.js` 在 desktop Chrome、Pixel 5 竖屏和 Pixel 5 横屏 `3/3 PASS`。每个视口都验证 `aria-pressed=true`、本机保存提示、草稿中 `feedback: up`、确认后草稿数组为空、表达历史候选含 `feedback: up`，以及离线 reload 后历史反馈仍存在；临时测试产物已清理。使用的是变动 93 已成功的同一 production build。
- 生效范围：CBoard Web/Electron/Cordova 共用的患者候选反馈生产运行证据和 issue #12 覆盖状态；不改变反馈 schema、登录后同步、AI 上下文、候选算法、TTS、微信实现或 API。微信真机反馈触控与播报并行仍待单独验收；本轮未打开或置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 03:43:24。
- 补充证据：同一业务源码状态的 CBoard 全仓 `203 suites / 1404 tests / 72 snapshots` 全部通过，production build 成功；本轮后续仅增强 Playwright 运行门与文档，没有改变生产 bundle。记录：Codex（GPT-5.6），2026-07-27 03:59:20。

## 变动 95：照护历史复盘进入 CBoard 生产浏览器三视口运行门

- 意图：把 issue #22 的“历史候选评价”和“已确认接收图片修正”从组件与 repository 证据推进到真实生产页面，证明照护者可以事后复盘，同时不覆盖患者当时看到的原始记录。
- 决策：继续扩展既有 production offline E2E，复用正式照护管理入口、`CandidateFeedback v1`、`ReceiverCorrection v1`、浏览器 repository 和 Service Worker。用患者与照护者在同一真实会话生成的记录执行候选“有帮助 → 不符合”和已确认接收序列换图；直接审计历史原记录、`caregiver_history_review` 前后快照及 reload 后最新投影。照护工具切换按钮由共享 helper 按 `aria-expanded` 幂等打开，避免测试反向收起菜单。
- 理由：单元测试中的回调不能证明生产路由、Material UI 对话框、触控、localStorage、只追加审计和离线恢复共同可用；直接覆盖历史又会抹掉患者实际看到的事实。沿用既有纯核心与同一离线用例，比新增测试页、第二套存储或强制点击更接近真实产品，也没有新增运行依赖。
- 证据：desktop Chrome 单独运行通过；desktop Chrome、Pixel 5 竖屏和 Pixel 5 横屏 `3/3 PASS`，并与 `/demo` 隔离用例合并回归 `6/6 PASS`。逐项验证历史候选反馈变为 `down`、已确认接收原 history 对象逐字段不变、修正记录包含 `context: caregiver_history_review` 及 `revisionBefore/revisionAfter`、页面显示最新“当前图片”，离线 reload 后反馈与修订投影均恢复。目标 ESLint 通过；同一业务源码状态的全仓 `203 suites / 1404 tests / 72 snapshots` 与 production build 已通过。
- 生效范围：CBoard Web/Electron/Cordova 共用的照护历史复盘运行证据、production Playwright helper 和 issue #22 Web 覆盖状态；不改变历史、候选反馈或接收修正 schema，不修改生产业务代码、微信实现、API、AI、语音、matcher 或分词。真实登录同步、物理移动设备与微信模拟器/真机仍分别受其既有验收边界约束；未打开或置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 03:59:20。

## 变动 96：浏览器实时麦克风状态进入 production API 边界运行门

- 意图：把 issue #16 的浏览器语音状态从 hook/组件测试推进到真实 production 页面，证明音量反馈由时域样本而不是循环动画驱动，最终识别文字仍可人工修正并进入原 matcher。
- 决策：复用正式 `SpeechRecognition`、`createBrowserAudioLevelMonitor`、ReceiverLoopPanel 和 Playwright production harness；测试只在 BrowserContext 初始化时替代不可稳定自动化的浏览器麦克风、AudioContext 和 SpeechRecognition 事件边界，不替代业务 hook、meter、输入框、分词或 matcher。共享 Joyride helper 最多等待 2 秒再真实点击“跳过”，避免异步遮罩造成假失败。
- 理由：单元测试能证明采样公式与状态回调，却不能证明 production bundle、React 生命周期、Material UI 对话框、移动触控、识别结果回填和资源释放能够共同工作；自动 CI 又不能证明物理麦克风、设备噪声底或真实 ASR 质量。明确的浏览器 API harness 能覆盖跨层接线，同时不把合成样本冒充真人语音。
- 证据：desktop Chrome 单独通过；desktop Chrome、Pixel 5 竖屏、Pixel 5 横屏语音状态 `3/3 PASS`，与 demo、离线双向沟通合并回归 `9/9 PASS`。每个视口都验证静音 `aria-valuenow=0`、有声样本上升、再次静音归零、识别结束 meter 隐藏、“想喝水”可改为“想要苹果”并全部匹配，以及 MediaStream track 与 AudioContext 各释放一次；目标 ESLint 通过。同一生产业务源码状态的全仓 `203 suites / 1404 tests / 72 snapshots` 和 production build 已通过。
- 生效范围：CBoard Web/Electron/Cordova 共用浏览器语音 adapter 的 production 页面接线证据、Playwright 浏览器边界 harness 和 issue #16 Web 状态；不修改 production 业务代码、语音算法、Web Speech 服务、微信 WechatSI、API、分词或 matcher。真实浏览器麦克风权限、设备噪声底、识别准确率与端到端延迟仍需物理设备人工验收；未打开或置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 04:07:26。

## 变动 97：表达文字与接收长图进入 production Web Share 边界运行门

- 意图：把 issue #18 从纯分享核心、adapter 与组件测试推进到真实 production 页面，证明患者分享当前选中句、照护者分享按确认顺序生成的 PNG，且分享不会打断或清空当前沟通。
- 决策：复用正式 `CommunicationShare contract v1`、`browserCommunicationSharePort`、Canvas renderer、PatientActionButton、ReceiverDisplay 与 Playwright production harness。BrowserContext 只替代无头浏览器不能打开的系统 `navigator.share/canShare` 面板，记录实际传入的文字和 File 元数据；文字选择、图片加载、Canvas 布局、PNG Blob/File 生成及页面状态全部走 production 代码。
- 理由：单元测试不能证明真实候选选择、全屏接收端、图片加载、Canvas、移动触控和异步分享状态共同可用；测试专用图片或第二套分享实现又会绕过最容易失败的生产路径。标准 Web Share API 边界 harness 可以验证客户端交付的最终载荷，同时不把“捕获 API 调用”冒充操作系统分享面板已被真人完成。
- 证据：desktop Chrome 单独通过；desktop Chrome、Pixel 5 竖屏、Pixel 5 横屏分享 `3/3 PASS`，与 demo、离线历史和语音状态合并回归 `12/12 PASS`。逐项验证文字分享标题与非空当前句、接收 PNG 文件名/`image/png`/非零字节、分享成功提示，以及分享后候选、当前输出、全屏、输入文字和图片序列保持不变；目标 ESLint 通过。同一生产业务源码状态的全仓 `203 suites / 1404 tests / 72 snapshots` 与 production build 已通过。
- 生效范围：CBoard Web/Electron/Cordova 共用分享页面接线、Web Share API 文件/文字边界和 issue #18 Web 运行证据；不修改 production 业务代码、分享 schema、Canvas 算法、微信原生分享、账号、API、历史、语音、分词或 matcher。真实 iOS Safari/Android Chrome 系统分享面板、系统取消和目标应用兼容性仍需物理设备验收；下载回退继续由既有 adapter 自动化覆盖。未打开或置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 04:12:45。

## 变动 98：场景状态与真正的新对话进入 production 三视口运行门

- 意图：把 issue #13/#23 从组件、repository 与 AI payload 测试推进到真实 production 会话，证明照护者场景可显式选择/清除，而“新对话”会建立新 session、清场景并保留可复盘历史。
- 决策：继续扩展既有 production offline E2E，不新增状态表或测试页面。真实接收端先选择“医院”，再次点击同按钮清除，再重新选择并审计 `cboard_communication_active_session.scene`；随后走二次确认的新对话入口，检查新 session ID、空场景规范化、界面“未选择”及原表达/接收历史数量。AI 只消费活动 session 的约束继续复用既有 `communicationAi` 自动化。
- 理由：文案显示“已开始新对话”不能证明 session ID 真正变化，场景按钮高亮也不能证明 repository 落盘；直接检查生产 UI 与活动 session 可防止旧上下文隐式泄漏。复用同一 offline 主链比复制会话模型或伪造页面更可靠，也保持 CBoard/微信共享纯核心边界。
- 证据：desktop Chrome、Pixel 5 竖屏、Pixel 5 横屏 offline E2E `3/3 PASS`；逐项验证“医院”选择、重复点击清除、重新选择、持久化 `scene: hospital`、新 session ID、空场景省略/`null` 等价清除、界面回到“未选择”和双向历史保持 2 条。目标 ESLint 通过；前序同一生产业务源码的核心合并回归 `12/12 PASS`、全仓 `203 suites / 1404 tests / 72 snapshots` 与 production build 均通过。
- 生效范围：CBoard Web/Electron/Cordova 共用活动会话、接收场景 UI 和 issue #13/#23 Web 运行证据；不修改 production 业务代码、session schema、AI、API、微信实现、历史、语音、分词或 matcher。不采集 GPS；微信运行态与真实登录 AI 请求仍按各自既有边界验收。未打开或置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 04:20:22。

## 变动 99：缺词在线补图进入 production 三视口持久化运行门

- 意图：把 issue #19 的公共图源补图从纯核心、组件和 API 单元证据推进到真实 CBoard production 页面，证明照护者可以恢复待处理缺词、查看来源许可、逐项确认，并让同一句话立即及刷新后复用新图。
- 决策：继续复用 `MissingTokenQueue`、`API.searchCommunicationPictograms`、`RuntimePictogram`、浏览器 repository 和现有 production Playwright，不建立测试专用业务入口。API 边界一次返回本轮全部缺词的 ARASAAC 候选，页面按真实分词逐项确认；BrowserContext 只替代本地不可用的服务端响应和图片字节，其余外网保持阻断。离线测试服务器默认使用合法的 `localhost`，避免 CBoard 原域名推导生成非法 `api.127.0.0.1`；该用例显式绕过 production CSP 仅为命中受控本地 API 路由，不改变 production bundle 或线上策略。
- 理由：`量子海狸` 会被既有分词拆成两个缺词，只确认其中一个却断言整句全部匹配会产生错误证据；逐项确认既保留分词语义，也验证批量搜索、人工采用和运行时复用的完整关系。单元测试无法证明 Material UI、API adapter、来源许可、localStorage 和 reload 能共同工作，而真实公共网络又不适合确定性回归。
- 证据：目标 ESLint 通过；`communication-support-missing-token.spec.js` 在 desktop Chrome、Pixel 5 竖屏和 Pixel 5 横屏 `3/3 PASS`，真实验证缺词生成、忽略、恢复、单次批量 API 请求、ARASAAC/`CC BY-NC-SA 4.0` 展示、逐项确认、storage 中完整归因、整句全部匹配及 reload 后继续匹配。包含 demo、离线双向沟通、语音、分享、完整本机恢复和两类密文快照的 production 三视口全组 `24/24 PASS`；使用的是同一已通过全仓 `203 suites / 1404 tests / 72 snapshots` 和 production build 的业务源码。
- 生效范围：CBoard Web/Electron/Cordova 共用缺词维护的 production 页面运行证据、Playwright 本地 API harness 和 issue #19 Web 覆盖状态；不修改 production 业务代码、分词、matcher、默认板、API 契约、微信实现或图源排序。不等同于真实 cboard-api HTTPS、ARASAAC/OpenSymbols/Global Symbols 公网、微信合法域名、物理设备或 AI 图像模型已验收；未打开或置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 04:42:16。

## 变动 100：浏览器存储写入结果进入表达确认契约

- 意图：修复 issue #29 在真实浏览器中的隐藏缺口，确保历史写入失败时患者表达不会被误标为“已确认”，并能在原页面直接重试。
- 决策：共享 KeyValueStore 继续保持同步和平台无关；浏览器 adapter 写入成功返回 `true`，配额、权限或不可用失败返回 `false`。repository 的统一 `writeStorageValue` 只在结果严格为 `false` 时抛出，因此微信 `setStorageSync` 和旧自定义 adapter 成功返回 `undefined` 仍向后兼容。`persistExpressionHistoryEntry` 继续捕获该错误并返回空值，ExpressionLoopPanel 已有失败文案、图片/候选保留和重试 UI 无需复制。
- 理由：原浏览器 adapter 吞掉 `localStorage.setItem` 异常并返回 `undefined`，repository 随后仍构造成功记录；组件测试虽然覆盖了 `onAppendHistory` 返回空值或抛错，却不能发现真实 adapter 永远不把失败传上来。显式布尔失败比读回比较更小且不会增加大历史序列化成本，并保留微信原生抛错语义。
- 证据：adapter、repository 和 ExpressionLoopPanel 聚焦 `3 suites / 27 tests` 通过；目标 ESLint、production build 通过。CBoard 全仓 `203 suites / 1405 tests / 72 snapshots` 全通过；production E2E 在 desktop Chrome、Pixel 5 竖屏和横屏 `3/3 PASS`，首次只让历史键写入抛 `QuotaExceededError` 后真实显示失败、历史仍为空、输出和全部候选逐字保持、确认按钮可用，第二次写入成功后才变为已确认。包含其余核心闭环的完整 production 三视口回归 `27/27 PASS`。
- 生效范围：CBoard Communication Support 浏览器 KeyValueStore、repository 所有统一业务写入、Web/Electron/Cordova 患者表达确认和 issue #29 运行证据；微信 adapter 成功返回值与失败抛错保持不变。不改变历史 schema、候选算法、TTS、账号、API、分词或 matcher；repository 初始化迁移的直接写入语义本轮不扩展。未打开或置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 05:00:34。

## 变动 101：候选句自动播报进入 production 三视口运行门

- 意图：把 issue #36 从控制器、组件和构建证据推进到真实 CBoard production 页面，证明空闲计时、主动取消、表达变化重计、顺序播报和照护者关闭设置形成同一个可操作闭环。
- 决策：继续复用中性 `candidateAutoplay` 控制器、CommunicationPreferences、ExpressionLoopPanel、CBoard SpeechProvider 和既有 Playwright production harness；BrowserContext 只替代无头环境不可稳定自动化的系统 SpeechSynthesis 边界，记录 production 代码实际提交的文字、语言、语速和 voice URI。用两张真实 CBoard 图卡生成候选，先手动朗读并等待超过 5 秒确认旧计时已取消，再通过患者“右移”改变表达序列触发新计时并核对全部候选顺序，最后经“照护工具 → 显示与易用性 → 候选句自动播报 → 关闭”保存偏好并证明后续不再自动播放。失败 trace 同时发现设置 Dialog 的视觉标题没有成为可访问名称，因此以 `aria-labelledby` 正式关联标题并由同一 E2E 按名称进入。
- 理由：控制器单测不能证明 production bundle 中触摸/点击、输出签名、React 生命周期、TTS 队列、照护设置持久化和移动视口共同接线；直接依赖物理系统语音又会让 CI 受操作系统声音、设备和权限影响。只替代浏览器 TTS 最外层、保留全部业务管线，可以提供确定性跨层证据；修复 Dialog 名称则避免为通过测试而使用坐标、强制点击或无语义 CSS 选择器，并让辅助技术能够识别设置页面。
- 证据：目标 ESLint通过；候选控制器、偏好和设置对话框聚焦 `3 suites / 14 tests`，CBoard 全仓 `203 suites / 1405 tests / 72 snapshots` 全通过；production build 成功，只有既有 AAC vendor 警告。`communication-support-autoplay.spec.js` 在 desktop Chrome、Pixel 5 竖屏和 Pixel 5 横屏 `3/3 PASS`，完整 production 离线回归 `30/30 PASS`；逐项核对手动朗读后无额外播报、表达变化后 5 秒触发、候选文字顺序、重播状态、偏好落盘为 `0` 和关闭后超过 5 秒仍无新调用。
- 生效范围：CBoard Web/Electron/Cordova 共用患者候选播报、照护者显示设置、设置 Dialog 可访问名称及 issue #36 production 运行证据；不改变候选生成、默认 15 秒、语音供应商、微信 WechatSI、API、历史、分词或 matcher。BrowserContext 只证明交给系统 TTS 的最终调用，不等同于真实 iOS/Android/Windows 声音、物理触控或微信真机已验收；未打开或置顶微信开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 05:27:50。

## 变动 102：匿名 `.obla` 研究副本禁止恢复为私密沟通历史

- 意图：落实严格匿名研究日志“不可逆、不可恢复”的既有产品承诺，避免照护者把 `.obla` 重新导入后得到 `:fringe-*` 占位语句并污染患者本机历史。
- 决策：继续复用 OpenAAC `open-board-log-0.1` 与既有共享 `historyManagement`，不增加第二套解析器。导入器在格式校验后、读取 session/event 前检查根节点 `anonymized=true`；命中时返回明确失败、零新增和规范化后的原历史，并带回 `anonymized: true`。CBoard Web 与微信管理服务均沿用同一纯核心，私密 `.obl` 的追加、幂等和容量保护保持不变。新增 production Playwright 从真实照护管理页下载 `.obla`，逐字段审计九项匿名化、伪 ID、时间平移、完整自由文本遮蔽和字段白名单，再把同一下载文件送入真实导入入口，验证明确拒绝及 localStorage 不变。
- 理由：匿名研究副本与私密迁移文件用途相反；允许匿名文件进入历史既无法恢复原文，又会把脱敏占位符冒充患者表达。把拒绝放在共享纯核心可让 Web、Electron、Cordova 和微信获得同一隐私边界，比在各平台文件选择器上仅限制扩展名更可靠，也避免复制 OpenAAC 逻辑。
- 证据：目标 ESLint、共享核心 `1 suite / 12 tests` 通过；CBoard 全仓 `203 suites / 1406 tests / 72 snapshots`、production build 通过。`.obla` production E2E 在 desktop Chrome、Pixel 5 竖屏和 Pixel 5 横屏 `3/3 PASS`，完整 production 离线回归 `33/33 PASS`。微信 TypeScript、ESLint、`213 app / 32 CBoard core` 边界、`76 files / 339 tests`、质量门 `7/7` 和 production build 全部通过；未压缩主包 `1,249,738 B`，六个分包均低于 `1.5 MiB` 建议线。
- 生效范围：CBoard Web/Electron/Cordova 与微信小程序共用的 OpenAAC 日志导入纯核心、Web 照护管理导入入口、微信管理服务及隐私运行证据；不改变严格 `.obla` 导出算法、私密 `.obl` 导入导出、普通文本、历史 schema、表达、接收、分词、matcher、图卡、语音、AI、账号同步或 API。不包含研究平台上传、第三方 `.obla` 真实性认证或原文恢复；未打开或置顶微信开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 05:54:55。

## 变动 103：图片去背景进入 CBoard production 三视口运行门

- 意图：把 issue #82 从“provider、单元测试和构建已通过但 Web UI 待验收”推进为真实 CBoard production 页面闭环，证明照护者能够在保留原图的前提下生成、恢复并保存透明背景图卡候选。
- 决策：继续复用既有 `BackgroundRemovalPort`、cboard-api 可替换 provider 契约、CBoard `TileEditor`、图片压缩器和媒体上传路径，不引入浏览器抠图模型。production Playwright 只替换认证 API 边界：真实进入默认面板、持久化登录态、兼容快速解锁/四击保护、关闭既有订阅提示、新建图卡并上传图片；首次服务响应 `503` 验证原图不变，随后返回符合 `rembg` 契约的透明 PNG，验证候选、恢复原图、再次处理和以 `pictogram-no-background.png` 保存。共享登录态夹具先等待 redux-persist 初次回填完成，消除初始化写回覆盖测试用户的竞态。
- 理由：provider smoke 和组件单测不能证明 Redux 登录态、CBoard 解锁、订阅提示、Material UI Portal、浏览器图片压缩、原生确认框、API 鉴权、multipart、对象 URL、恢复动作和媒体保存真正接线。只控制最外层网络响应，保留全部 production 组件和状态流，比复制 UI、强制点击或在浏览器重新实现去背景算法更接近用户实际路径。
- 证据：新增去背景 production E2E 在 desktop Chrome、Pixel 5 竖屏和 Pixel 5 横屏 `3/3 PASS`；抽取后的认证夹具原私密图片/完整私有数据 E2E `6/6 PASS`；CBoard 全量 `203 suites / 1406 tests / 72 snapshots`、production build 与完整离线 production E2E `36/36 PASS`。每个视口都检查隐私确认文字、Bearer token、multipart `image`、失败后原 blob URL 不变、透明候选使用新 blob URL、恢复后回到原 URL、保存上传文件名和新图卡落到面板。
- 生效范围：CBoard Web、Electron 和 Cordova 共用的 TileEditor 去背景 UI 与媒体保存接线，以及 production E2E 登录夹具；不改变 provider、API schema、输入输出上限、TileDTO、默认板、matcher、分词、语音、微信实现或订阅规则。受控网络边界不等于已部署 cboard-api 的真实鉴权 HTTP 全链，也不证明家庭成员、餐具或辅助器具照片的主体边缘质量；这些仍须部署 provider 后用真实照片和物理设备验收。本轮未打开、聚焦或置顶微信开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 06:33:22。

## 变动 104：候选反馈草稿在表达面板重建后恢复

- 意图：修复候选反馈草稿已经写入浏览器 repository，但刷新或组件重建后“有帮助/不符合”高亮消失、用户无法继续原草稿的问题。
- 决策：在既有 `CandidateFeedback v1` 纯核心中增加最新草稿解析，不新增 storage key 或 API。草稿先按 `sessionId + outputSignature` 限定，再按候选句文本对齐到当前候选；没有任何相同句子时拒绝恢复，避免 AI 或本地候选变化后按下标错贴评价。`CommunicationSupportPanel` 只提供 repository 草稿和当前会话，`ExpressionLoopPanel` 首次挂载恢复条目与草稿 ID，并阻止原首挂载 effect 立即清除该草稿。
- 理由：草稿可写不可恢复只是隐藏数据，不是可用功能；候选顺序和内容可能被 AI 改变，按数组下标复原会产生错误学习信号。共享纯函数让 Web、Electron、Cordova 和微信使用同一匹配语义，平台 UI 不复制恢复算法。
- 证据：核心、表达面板和容器聚焦 `3 suites / 42 tests`，CBoard 全仓 `203 suites / 1409 tests / 72 snapshots` 全通过；标准 production build 成功，主 JS 仅增加约 `322 B gzip`，既有 AAC vendor 警告未新增。production offline E2E 在 desktop Chrome、Pixel 5 竖屏和横屏 `3/3 PASS`，每个视口都在确认前离线 reload，验证反馈仍 `aria-pressed=true` 且草稿内容逐项不变，随后继续确认、历史改评和刷新复盘。
- 生效范围：共享 `candidateFeedback`、CBoard Communication Support 表达候选与浏览器 repository 消费；不改变 schema、登录同步、AI 请求、候选生成、TTS、分词、matcher 或 API。测试浏览器不等于物理设备；本轮未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5），2026-07-27 07:27:25。

## 变动 105：板块可见性成为共享患者导航投影

- 意图：把照护者的板块隐藏偏好从“设置页记录了一个 ID”提升为患者端真正不可进入的导航契约，并让 CBoard 与微信保持同一 BoardDTO 语义。
- 决策：在既有 `communicationPreferences` 纯核心中增加 `projectVisibleCommunicationBoards`，按隐藏 ID过滤板块，同时移除指向隐藏目标的 `loadBoardId/loadBoard` 图卡并同步 `layout.tileIds` 与旧 `grid.order`；无变化时保持结构共享。CBoard Communication Support 面板和微信患者页均消费该投影，不建立平台专用副本。
- 理由：仅过滤顶层板块无法移除其他板块中的跨分类文件夹入口，会让患者仍能导航到隐藏内容；直接修改源 BoardDTO 又会把可逆偏好变成数据删除。共享纯投影既保留 CBoard 全平台基础，也避免微信迁移重新定义兼容字段。
- 证据：共享偏好核心和 CBoard Web 面板 `2 suites / 29 tests` 通过，覆盖隐藏板块、导航图卡、`layout/grid` 同步、普通叶子保留与结构共享；CBoard production build 成功。微信复用声明、真实 44 板块/825 图卡 fixture 回归、`77 files / 342 tests`、质量门 `7/7`、TypeScript、ESLint、`214 app / 32 core` 边界和 production build 全通过；官方模拟器进一步证明隐藏、重建和恢复闭环。
- 生效范围：CBoard Web/Electron/Cordova 与微信患者页的板块可见性和跨板块导航；源板块、图卡与偏好保持可逆，不改变编辑器、匹配、分词、语音、AI、API 或云同步。全部隐藏时沿用既有安全回退；未提交、推送、预览、上传、发布或部署。
- 记录：Codex（GPT-5），2026-07-27 12:09:31。

## 变动 106：成人照护默认板进入 CBoard production 三视口离线运行门

- 意图：证明同源成人照护默认内容不仅被 CBoard JSON、matcher 和微信消费，也能在 CBoard Web 正式图板、路由、接收全屏和 Service Worker 离线环境中形成运行闭环。
- 决策：继续复用既有 Playwright production offline harness、真实 `boards.json`、CBoard Tile/Router、Communication Support 面板和 Service Worker；只把原离线 spec 内的 Service Worker 等待函数抽到共享 helper，并新增独立成人照护默认板 spec。场景不注入测试板，不复制 matcher，也不控制组件内部状态；桌面、Pixel 5 竖屏和横屏都先由 Service Worker 接管，再切断浏览器网络。
- 理由：Jest 和 build 不能证明 42 张首页图卡、两个新增子板、路由、Material UI Dialog、接收匹配和全屏署名在 production bundle 中共同接线。复用现有真实断网测试比新建演示页面、mock BoardDTO 或另造浏览器脚本更接近 CBoard 底座，也保持 Web 与微信使用同一内容源。
- 证据：新增 `communication-support-adult-care-defaults.spec.js` 在 desktop Chrome、Pixel 5 竖屏和横屏 `3/3 PASS`：首页 42 项和 11 个新增照护叶子存在，核心词 15 项与修正澄清 9 项通过真实板路由进入；“要不要叫医生”为 `1/2`，成功匹配行和预览都只有“请叫医生”；“叫医生”全部匹配并进入独立全屏，显示 ARASAAC 与 `CC BY-NC-SA 4.0`。抽取 helper 后原完整离线沟通 spec 同样 `3/3 PASS`。首轮仅因对整个对话框断言“不含想要”而被固定示例“想要苹果”触发，收窄为成功匹配行唯一性后通过，业务结果从首轮起即为正确。
- 生效范围：CBoard Web/Electron/Cordova 默认图板、生产路由、Service Worker 离线壳、Communication Support 接收与图符署名，以及共享 Playwright helper；不改变 BoardDTO、matcher、API、账号、语音或微信业务。无头 Chrome 不替代物理设备触控、系统读屏、横竖屏旋转过程或患者理解研究；未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5），2026-07-27 15:09:08。
