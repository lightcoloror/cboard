# Communication Support 患者表达端闭环开发记录

状态：实现与验证完成；提交状态以 Git 历史为准
记录时间：2026-07-15 14:20:49
最终验证时间：2026-07-15 14:36:49
记录工具 / 模型：Codex（GPT-5）
对应底座：`cboard` fork 的 `feature/tuyujia-mvp` 分支

## 本轮目标

在不复制 Cboard 既有输出栏、Tile、Redux 和 TTS 能力的前提下，把图语家 MVP 已验证的“患者选图 → 中文候选句 → 选择并播报 → 收藏或确认 → 保存历史”重构成可测试、可维护的中性纵向闭环。

## 变动 1：新增纯表达流水线

**意图**

确保候选句、收藏短句和确认历史始终来自同一份患者选图快照，避免 UI 状态变化造成句子与图片错配。

**决策**

新增 `src/common/communicationSupport/expressionPipeline.js`，集中负责输出签名、不可变 Tile 快照、候选句状态、候选选择、收藏条目和确认历史构造。空输出不再生成“请先选择图片”占位候选。

**理由**

这些规则属于沟通数据语义，不属于 React 组件。放在纯函数层后，未来本地模板或 AI 候选生成器可以替换，而收藏和历史的一致性规则不需要重写。

**证据**

`expressionPipeline.test.js` 覆盖快照不可变、空输出、选中句、收藏、确认历史、自定义收藏句复用和非法索引回退。

**生效范围**

只影响 Communication Support 患者表达链路；不改变 Cboard Board、Tile 或输出栏数据模型。

## 变动 2：表达播报复用 Cboard SpeechProvider

**意图**

让图语家表达端自动继承 Cboard 已有语音、语速、音调、语言、本地/云端引擎和跨平台适配，避免维护第二套浏览器 TTS。

**决策**

从 `CommunicationSupportPanel.container.js` 注入 Cboard 的 `speak` 和 `cancelSpeech` action；删除父组件直接调用 `window.speechSynthesis` 的实现。旧 `TuyujiaPanel` 兼容容器使用相同接线。

**理由**

Cboard SpeechProvider 已经是全站 TTS 的单一入口。直接调用浏览器 API 会绕过用户语音设置，也会破坏 Android、iOS、Electron 和云端语音引擎的一致行为。

**证据**

容器测试验证 `onSpeak` / `onCancelSpeech` 产生 Cboard thunk；表达组件测试按真实 `onend` 时序验证四句顺序播报和单句播报。

**生效范围**

适用于中性 Communication Support 入口和 TuYuJia 兼容入口；不改变 Cboard 原输出栏的播报实现。

## 变动 3：抽出独立 ExpressionLoopPanel 并作废陈旧候选

**意图**

把患者表达和照护者接收拆成两个可独立测试的闭环，并消除患者更换 Tile 后仍能收藏或确认旧候选句的风险。

**决策**

新增 `ExpressionLoopPanel.component.js`。输出签名变化时立即停止旧播报、清除候选状态并要求重新生成；点击某个候选只播该句，不再从该句继续播放后续候选；确认和收藏分别提供一次性状态反馈。

**理由**

旧父组件同时承担同步、接收、表达和 TTS 状态，且单句点击实际会继续播后续句子。独立组件能把用户闭环边界固定下来，也让父组件回到编排职责。

**证据**

组件测试验证：初始不显示伪候选、生成后顺序播报、单句点击只调用一次 TTS、输出变化清除旧候选、自定义收藏句可继续确认。

**生效范围**

影响 Communication Support 面板的“患者表达”页签；“接收理解”继续使用既有 `ReceiverLoopPanel`。

## 变动 4：表达历史保留候选和 Tile 快照

**意图**

保留患者确认时的上下文，使历史记录能够回答“患者看到了哪些候选、最终选择哪一句、对应哪些 Tile”，而不是只保存标签文本。

**决策**

在现有 communicationSupport history 条目中增加可选 `output` 和 `candidateSentences`。旧记录没有这两个字段时保持原样；仍复用本地存储和 Cboard API 通用 Settings 桶，不新增接口。

**理由**

图语家 MVP 已保存候选句和图片标识。Settings schema 当前允许 communicationSupport 自由对象，增加可选字段即可保留核心语义，无需扩展专用 API。

**证据**

`localData.test.js` 验证写入和重新读取后 Tile 快照及候选句不丢失；既有 legacy key 兼容测试继续通过。

**生效范围**

只扩展新的表达历史条目；接收历史、旧本地数据和旧 `tuyujia` Settings 数据继续兼容。

## 最终验证

- CI 模式核心回归：23 个测试套件、62 项测试、3 个快照全部通过，退出码 0。
- 生产构建：CRA `Compiled successfully`，退出码 0。
- Service Worker：`build/service-worker.js` 已生成，预缓存 977 个资源、约 41 MB。
- 测试中的 Google Analytics `window.gtag`、Material UI 弃用和既有测试 PropTypes 警告不影响断言或构建。
- 验证命令改为 `CI=true` 的直接 CRACO 入口，防止当前 npm 版本吞掉 Jest 参数后残留 watch 进程。

## 明确不在本轮

- 不接入新的 AI API；候选句继续使用本地确定性模板。
- 不修改 Cboard 默认板和分类。
- 不新增 cboard-api endpoint 或数据库模型。
- 不修改 ccboard 原生包装和 cboard-ai-engine。
- 不提交、不推送本轮代码。

## 推送前复核（2026-07-16）

**意图**

确认表达闭环在接收端、跨端契约和存储重构合入后仍复用 CBoard SpeechProvider，且没有恢复第二套浏览器 TTS。

**决策**

保留独立 ExpressionLoopPanel、纯 expression pipeline、12 秒完成保护和输出签名失效机制，不把本地 Playwright 或构建兼容文件纳入本功能边界。

**理由**

表达闭环必须与 CBoard 的语音配置和跨平台实现保持单一来源，同时避免本地环境文件扩大未来 PR。

**证据**

2026-07-16 00:11:32 使用 Codex (GPT-5) 完成聚合回归：31 suites / 114 tests / 3 snapshots 通过；拟提交源码范围 ESLint 通过。

**生效范围**

Communication Support 与 Tuyujia 兼容入口的患者表达页；不修改全局 SpeechProvider。
