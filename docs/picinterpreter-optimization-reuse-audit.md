# PicInterpreter 优化经验复用审计

- 状态：审计、实现与验证完成；提交状态以 Git 历史为准
- 执行工具 / 模型：Codex (GPT-5)
- 记录时间：2026-07-15 19:36:02
- 推送前复核：2026-07-16 00:11:32，Codex (GPT-5)
- 原项目证据：`D:\used-by-codex\picinterpreter\picinterpreter-github\docs` 与 `src`
- 当前实现：`D:\used-by-codex\fork-cboard\cboard`
- 总边界：继续使用 CBoard 默认板、分类、Tile、TTS、PWA、设置、扫描和导入导出能力；图语家差异逻辑只进入中性 `communicationSupport` 层。

## 审计结论

PicInterpreter 的经验不能按“把组件搬过来”理解。它包含产品约束、失败降级、数据边界、匹配规则和真实设备风险。对当前 CBoard fork，最合适的处理分为三类：

1. CBoard 已有且更成熟：板与格位、显示尺寸、扫描辅助、离线应用壳、联网提示、板导入导出、多语种 TTS、云端与本地音色、Tile 编辑和跨平台包装。直接复用，不建立第二套实现。
2. 图语家已经验证且不会改变 CBoard 内容结构：中文匹配与消歧、质量反馈、词级匹配来源、异步防串线、浏览器语音环境降级、TTS 完成保护。放入中性层并补回归。
3. 需要额外产品或隐私决策：AI 重分词、在线图符回填、患者画像、纠错学习库、缺词维护队列、专用紧急面板和患者自定义照片。先保留扩展位，不静默引入后端、账号或新数据库。

## 文档与代码对照矩阵

| 优化主题                     | PicInterpreter 文档证据                                                                        | PicInterpreter 代码证据                                                                 | CBoard 当前判断                                                              | 决策                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 中文分词、同义词和危险词消歧 | `symbol-matching-research.md`、`chinese-aac-matching-test-cases.md`、`high-risk-token-list.md` | `segment-text.ts`、`text-to-image-matcher.ts`、`concept-disambiguation.ts` 及高风险回归 | CBoard 原生不是中文自然语言匹配器                                            | 已移植到中性层，并用真实默认板回归                         |
| 低匹配率与未匹配反馈         | `decision-index.md` 的 Text pipeline、`ADR-001-receiver-data-model.md`                         | `ReceiverPanel.tsx` 使用 `matchRate < 0.6` 与缺词触发降级                               | 管线已有 `matchRate`，此前 UI 未显示                                         | 已显示匹配数量、部分匹配和缺词复核提示                     |
| 匹配来源与最终确认序列       | `ADR-001-receiver-data-model.md`                                                               | `MatchedToken.matchType`、Receiver 手工换图                                             | 历史此前只保留 labels，无法解释结果来源                                      | 已为确认历史保存向后兼容的 `pictogramSequence`             |
| 快速输入和异步防串线         | `architecture.md` 的接收流水线                                                                 | `ReceiverPanel.tsx` 的 generation counter 与 `AbortController`                          | 当前 30ms 延迟匹配可被旧结果覆盖                                             | 已加入代次失效、定时器取消和卸载清理                       |
| 语音输入环境降级             | `prd.md` 的语音输入与错误提示                                                                  | `use-web-speech.ts`、`tts-environment.ts`                                               | 原入口未检查 `isAvailable`，微信内可能显示无效按钮                           | 已在微信和不支持环境禁用入口，保留文字输入                 |
| 语音实例竞态                 | 代码经验，文档未单列                                                                           | `use-web-speech.ts` 的 abort/cleanup 思路                                               | 旧 Recognition 回调可能污染新一轮状态                                        | 已用实例身份检查忽略过期回调                               |
| TTS 卡死保护                 | `prd.md` 的播报失败兜底                                                                        | `web-speech-tts.ts` 的 12 秒超时                                                        | CBoard TTS 更完整，但候选句轮播只等待 `onend`                                | 复用 CBoard TTS，仅在表达管线外围增加 12 秒完成保护        |
| 固定格位和肌肉记忆           | `tuyujia-v1-board-layout-draft.md`、核心图库研究                                               | `pictogram-order.ts`、Settings 固定顺序                                                 | CBoard 已有 Board/Grid/FixedGrid 和手工布局                                  | 继续使用 CBoard 板序，不默认按热度重排                     |
| 快捷表达与紧急表达           | `prd.md`、`aac-reference-inventory.md`                                                         | `QuickAccessBar.tsx`、`EmergencyPanel.tsx`                                              | CBoard 默认板和自定义板可承载整句 Tile；另建浮层会形成第二套导航             | 暂不复制组件，先做默认板覆盖审计后再决定内容增量           |
| 常用语、历史和导入导出       | `prd.md`、`phrase-transfer.ts` 说明                                                            | repositories、Dexie、`phrase-transfer.ts`                                               | 当前中性层已有本地/云端 settings、JSON 导入和旧 `tuyujia` 兼容               | 复用现有闭环；会话分组留作后续版本                         |
| 离线与版本更新               | `decision-index.md`、`implementation-task-index.md`                                            | service worker、`use-pwa-update.ts`                                                     | CBoard 已注册 Service Worker、监听在线状态并提供离线通知                     | 不搬 PicInterpreter PWA；以后只补真实设备验收              |
| 显示、触控和扫描辅助         | `decision-index.md` 的 Patient UI、`user-research-playbook.md`                                 | Settings、Onboarding、44px 控件                                                         | CBoard 已有字号/元素尺寸、扫描策略和 Scannable Tile                          | 复用基础；Communication Support 控件的扫描接入另开独立切片 |
| 图片加载与本地缓存           | `debug-image-loading-2026-05-07.md`                                                            | `generate-placeholder-svg.ts`、seed gate                                                | CBoard `Symbol` 已优先读取 ARASAAC IndexedDB，但远程图片加载错误没有专用占位 | 暂不改全局 Symbol；先以接收端边界测试和真实设备证据决定    |
| AI 重分词和在线补图          | `decision-index.md`、`architecture.md`                                                         | `ai-resegment.ts`、`runtime-pictogram-search.ts`、AAC search server                     | 可提升覆盖率，但会引入服务、许可、缓存与默认板边界                           | 只允许做成可关闭、可注入、结果不得劣化的 provider          |
| 缺词队列和纠错学习           | `ADR-001-receiver-data-model.md`、`implementation-task-index.md`                               | 原项目仍主要是设计和待实现任务                                                          | 涉及患者/工作区身份、隐私和迁移                                              | 本轮只保存确认结果来源，不创建学习库或同步草稿             |
| 个性化图片                   | metadata schema v2、core library proposal                                                      | `PatientConceptPreference` 为设计方案                                                   | CBoard Tile 编辑可改图，但还没有“患者 + 概念”非破坏性覆盖层                  | 等患者身份和隐私范围确定后再实现                           |
| 用户研究与临床边界           | `user-research-playbook.md`、`caregiver-feedback-form.md`                                      | 无单一运行时代码                                                                        | 属于验收与证据治理，不应伪装成算法能力                                       | 保留匿名、非诊疗、不可用于紧急医疗替代的边界               |

## 本轮变动 1：匹配质量和来源可见

- 意图：让照护者在发送前知道系统匹配了多少项、哪些结果需要重点复核，并看懂匹配依据。
- 决策：新增纯函数 `buildReceiverMatchQuality()`；接收端显示 `已匹配数量 / 总数`，部分匹配或缺词时显示复核提示；将运行时来源映射为中文文案。
- 理由：匹配率只存在于内部对象无法支持人工把关；直接显示 `exact`、`partial` 等英文实现术语也不适合照护者。
- 证据：原 `ReceiverPanel.tsx` 以匹配率和缺词决定降级；`ADR-001` 要求保留统一匹配来源。新增纯函数和组件回归已通过。
- 生效范围：仅 Communication Support 接收复核区；不改变匹配算法、不阻止人工发送、不影响普通 CBoard Tile。

## 本轮变动 2：确认历史保存词级来源

- 意图：让最终展示过的接收结果可追溯，而不是只剩一组无法解释的中文标签。
- 决策：`buildReceiverHistoryEntry()` 增加 `contractVersion: 1`、输出快照和 `pictogramSequence`；记录图符 ID、显示名、来源板、规范化 match type、非概率型阶段置信值和原 token；无效复核项会被安全忽略；接收管线与历史导入共用 receiverContract，旧 lexicon-synonym 会归一为 lexicon，缺省置信值按阶段恢复。
- 理由：确认结果是未来纠错、迁移和回归的基础；只存 labels 无法区分自动精确匹配和照护者手工选择。
- 证据：`ADR-001` 定义了 `PictogramSequenceItem` 与规范化来源；本地 settings 归一化测试已验证新字段保留，同时旧历史仍可读取。
- 生效范围：只写用户主动“发送到输出栏”的确认历史；不保存草稿、不新建患者身份、不建立或同步纠错事件表。

## 本轮变动 3：接收端异步结果防串线

- 意图：避免快速连续输入、重置或组件退出后，旧匹配结果重新覆盖当前界面。
- 决策：每次匹配分配代次；新输入、重新输入和卸载会使旧代次失效并清除待执行定时器；匹配按钮在本轮处理中禁用；离开接收页签或收起面板时主动停止正在使用的麦克风。
- 理由：当前虽然只有 30ms 本地延迟，也已经存在可复现的状态竞态；未来接入可选 provider 后风险会进一步放大。
- 证据：原 `ReceiverPanel.tsx` 同时使用 generation counter 和 AbortController；新增回归断言重置后旧匹配不会执行。
- 生效范围：当前本地接收匹配调度；未来网络 provider 仍需另外接入 AbortSignal，本轮未发起网络请求。

## 本轮变动 4：浏览器语音安全降级

- 意图：在微信 WebView 或不支持 SpeechRecognition 的环境里，避免提供一个注定失败的按钮，同时防止旧识别实例回写新输入。
- 决策：增加微信环境识别；`isAvailable` 同时取决于 API 与环境；UI 隐藏无效语音按钮并明确保留文字输入；Recognition 回调必须属于当前实例才生效。
- 理由：原图语家已验证微信内 Web Speech 不稳定；只检查构造函数存在并不足以代表功能可用。重复启动时旧实例的异步回调也可能污染新会话。
- 证据：`tts-environment.ts` 和 `use-web-speech.ts`；新增环境测试与过期实例回调测试通过。
- 生效范围：Communication Support 浏览器语音输入；不影响 CBoard TTS、不增加微信服务端 ASR、不请求新权限。

## 本轮变动 5：候选句播报完成保护

- 意图：避免浏览器或语音引擎漏发 `onend` 时，表达端永久停在播放状态。
- 决策：每句播报增加 12 秒完成保护；超时按本次播报失败处理，显示文字提示并允许继续选句；卸载时清理所有保护定时器。
- 理由：原图语家已为 Chrome 后台标签页和部分 Android 设备记录同类问题；CBoard 全局 TTS 功能更完整，但 Communication Support 的 Promise 仍只依赖回调结束。
- 证据：原 `web-speech-tts.ts` 的 `SPEAK_TIMEOUT_MS = 12000`；新增组件测试模拟永不回调的引擎并验证自动恢复。
- 生效范围：只包裹 Communication Support 候选句轮播；不修改 CBoard SpeechProvider、音色、语速、队列或全局错误策略。

## 本轮变动 6：推送前契约与生命周期加固

- 意图：避免通过单元路径验证但在跨端导入、模式切换或重复图符场景中失效。
- 决策：收紧 BoardDTO/TileDTO 外部断言；浏览器存储调用异常时降级；接收模式退出时停止语音输入；全屏重复图符使用唯一序列 key。
- 理由：这些问题分别位于数据边界、平台边界和 React 生命周期，不能依赖正常路径输入或人工操作顺序来规避。
- 证据：新增 DTO 一致性、storage denial、接收模式退出和重复图符四组回归；聚合测试提升到 31 suites / 114 tests / 3 snapshots。
- 生效范围：中性 communicationSupport 契约、浏览器 adapter 与新增接收 UI；默认板、分类、全局 TTS 和 cboard-api 不变。

## 暂缓决策

### 可选 AI 与在线图符 provider

- 意图：未来补足默认板没有的概念，同时保持离线核心可用。
- 决策：暂不实现；后续必须使用中性接口，默认关闭，先本地匹配，只接受不劣于当前结果的返回，并保留许可和缓存来源。
- 理由：该能力涉及 API、费用、隐私、图片许可和离线策略，不能作为一次 UI 优化偷偷进入。
- 证据：原 `ReceiverPanel.tsx` 已有“不更差才接受”的保护；`decision-index.md` 仍将具体阈值列为开放问题。
- 生效范围：当前版本无网络匹配；默认 CBoard boards 完全不变。

### 缺词维护、草稿和纠错学习库

- 意图：把长期重复的错图和缺图转成可维护数据。
- 决策：只保留最终确认来源；患者 ID、workspace ID、草稿、纠错事件和 missing token 状态机暂缓。
- 理由：原文档已明确这些是隐私敏感的本地维护数据，而且原 MVP 自身也将多项实现列为待办；直接塞进通用 settings 会混淆确认历史和学习日志。
- 证据：`ADR-001`、`implementation-task-index.md` 的 #57、#60、#62、#64。
- 生效范围：不新增数据库表，不改变 cboard-api schema，不同步未确认输入。

### 独立快捷/紧急界面

- 意图：保留高频和紧急表达的一步可达能力。
- 决策：暂不复制 `QuickAccessBar` 或 `EmergencyPanel`；优先检查并利用 CBoard 默认 Quick Chat 和用户自定义板。
- 理由：独立浮层会绕开 CBoard 固定格位、扫描、编辑和跨平台导航，反而破坏技术底座复用目标。
- 证据：CBoard `Board`、`FixedGrid`、`TileEditor`、扫描设置已经提供成熟承载；原图语家研究强调固定格位和肌肉记忆。
- 生效范围：本轮不新增板或分类；内容覆盖缺口以后作为可审阅的板内容变更处理。

### Communication Support 的完整扫描与显示设置适配

- 意图：让运动障碍和低视力用户也能操作新增闭环。
- 决策：列为独立后续切片，不在本轮把普通按钮伪装成已支持扫描。
- 理由：CBoard 的扫描依赖 `Scanner/Scannable` 生命周期和焦点顺序，必须做键盘、自动扫描和真实设备验收，不能只加 CSS。
- 证据：CBoard `Board.component.js`、`Tile.component.js`、Settings Scanning 与 Display 测试。
- 生效范围：现有默认 Board/Tile 继续完整复用扫描与显示设置；新增面板当前主要面向直接触控和照护者操作。

## 验证记录

- 新增与受影响定向回归：最终聚合为 `31 suites / 114 tests / 3 snapshots` 通过，其中首轮聚焦验证为 `6 suites / 23 tests`。
- 覆盖：接收质量、确认历史来源与空值保护、延迟匹配取消、微信语音降级、过期 Recognition 回调、TTS 永不结束恢复、原接收与表达闭环、Settings、TileEditor、Board 及 `Tuyujia` 兼容包装层。
- 静态检查：受影响文件 ESLint 通过；`git diff --check` 通过，仅报告工作树既有的 LF/CRLF 转换提醒。
- 生产验证：CRA 在隔离 `BUILD_PATH` 下编译成功；使用同一份 `sw-precache` 配置的隔离路径版本完成 PWA 打包并生成 `service-worker.js`（约 41.1 MB、977 个预缓存资源）；本地开发页 `http://127.0.0.1:3000/` 返回 HTTP 200。
- 已知环境限制：项目脚本末段的原始 `sw-precache-config.js` 固定读取标准 `build/`，该目录当前被 Windows 进程锁定，故标准路径写入报 `EPERM`；隔离路径的等价编译与 Service Worker 打包均已成功，未为此修改功能 PR 边界。
- 未修改：`src/api/boards.json`、`src/translations/zh-CN.json`、默认分类和图片资产。
- 未执行：浏览器自动视觉验收。Codex 内置 Browser Use 此前连续导致桌面应用闪退，本项目继续只做 shell/HTTP 自动验收，视觉检查留给外部浏览器。
