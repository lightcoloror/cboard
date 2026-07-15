# 图文匹配质量收口记录

- 状态：实现与验证完成；提交状态以 Git 历史为准
- 执行者：Codex (GPT-5)
- 记录时间：2026-07-15 19:03:23
- 目标：在不替换 CBoard 默认板和分类的前提下，复用 PicInterpreter 已验证的中文分词、同义词、语义消歧和危险词防护经验。

## 证据基线

- PicInterpreter 的本地管线已实现 `Intl.Segmenter + 后处理`、精确/同义/词典/局部四阶段匹配、语义域加分、排除词硬阻断、低置信度 AI 重分词和在线 AAC 图符回填。证据：`D:\used-by-codex\picinterpreter\picinterpreter-github\src\utils\segment-text.ts`、`text-to-image-matcher.ts`、`concept-disambiguation.ts`、`ai-resegment.ts`。
- PicInterpreter 的高风险回归明确要求区分“想/要”、“药/吃药”、“手机/打电话”、普通疼痛/具体疼痛，并阻断“开心果 -> 开心”和“苹果手机 -> 苹果”。证据：`src\utils\__tests__\high-risk-token-regression.test.ts`、`disambiguation-regression.test.ts`。
- CBoard 默认 `zh-CN` 数据存在可复现的错译和碰撞：`doctor -> 法师`、`milk -> 牛肉`、`tea -> 茶色`、`coffee -> 咖啡座`、`appleJuice -> 苹果`，而水果苹果也是“苹果”。证据：`src/translations/zh-CN.json`与 `src/api/boards.json`的真实数据回归。

## 变动 1：默认概念画像

- 意图：使沟通匹配不再盲信有问题的显示翻译，同时不修改官方板数据。
- 决策：新增 `src/common/communicationSupport/cboardConceptProfiles.js`，以稳定 `labelKey` 映射中文首选名、同义词、排除词和语义域。显式 `tile.label` 始终高于内置画像。
- 理由：`labelKey` 比翻译文本稳定，可以在不 fork 整份官方图片库的情况下修正中文语义；让显式标签优先可以保护用户自定义。
- 证据：真实默认板测试已证明“医生”使用 doctor 图块却不再显示“法师”，“苹果”选中 `symbol.foodFruit.apple` 而不是 `symbol.drinkType.appleJuice`。
- 生效范围：仅作用于 `communicationSupport` 目录中的匹配目录；不修改 `boards.json`、`zh-CN.json`、图片资产或普通 CBoard 看板的显示。

## 变动 2：语义边界拆分

- 意图：防止候选不足时将一个概念退化成另一个看似相近但用途不同的图块。
- 决策：在 `chineseLexicon.js` 中拆开“想/要”、“药/吃药”、“手机/打电话”、“痛/头痛/肚子疼/胸口疼”；将“难受”和“不舒服”保留为独立医疗概念。
- 理由：对 AAC 来说，把“不要”理解为“要”、把“难受”理解为“痛”都可能改变患者意图，不能为了表面匹配率而合并。
- 证据：PicInterpreter 最新 seed 中对应为 `p_want/p_need_want`、`p_medicine/p_take_medicine`、`p_phone/p_make_call`、`p_pain/p_headache/p_stomachache`等独立概念；新增 `chineseLexicon.test.js` 锁定这些边界。
- 生效范围：仅改变中文沟通词典的归一化结果；不影响 CBoard 普通点选、用户自定义同义词或英文使用。

## 变动 3：分词与否定意图

- 意图：修正 `Intl.Segmenter` 将“要喝”合成一词，或将“不喝”拆成肯定动作的跨环境差异。
- 决策：扩展“想/要 + 吃喝去看玩”安全拆分规则；将“不 + 想要去吃喝”重新合并成完整否定概念。
- 理由：不同 Chromium/Node ICU 版本会给出不同分词；安全后处理能保持离线、零依赖和可测试性。
- 证据：本机真实 `Intl.Segmenter` 将“要喝牛奶”的前两字合并为“要喝”；`segmentation.test.js` 已覆盖情态动词拆分和否定词合并。
- 生效范围：仅作用于文字转图的本地分词；不引入第三方分词库或 AI 请求。

## 变动 4：接收端显示与输出一致

- 意图：避免算法已选对图块，但预览、换图、全屏或 TTS 仍显示/朗读错译。
- 决策：匹配目录增加 `displayLabel`；`ReceiverLoopPanel` 和 `createCommunicationOutputFromMatches` 统一优先使用它，无显式 vocalization 时也使用校准名称。
- 理由：匹配、显示和语音必须表达同一概念，否则照护者仍然无法判断系统是否理解正确。
- 证据：真实默认板回归断言 doctor 的输出标签与 vocalization 均为“医生”；组件测试断言原始标签“我想”以校准名“想”展示。
- 生效范围：接收端匹配列表、换图对话框、输出栏、历史与全屏展示；不覆盖用户显式编辑的 label/vocalization。

## 变动 5：只提供默认板可闭环的示例

- 意图：避免用户点击官方示例后立即看到大量问号，误以为功能完全失效。
- 决策：将依赖“厕所、不舒服、头晕、吃药动作、医院”的示例替换为“想喝水、要喝牛奶、想要苹果、头疼、开心、渴”，并共享一个中性常量。
- 理由：CBoard 默认高级板经查证没有上述缺失概念，也没有独立“我”和“吃”图块；示例必须与实际资源能力一致。
- 证据：`symbolMatching.test.js` 直接加载官方 `boards.json` 和 `zh-CN.json`，使用真实分词逐条断言 6 条示例的未匹配词为空。
- 生效范围：接收端示例按钮和输入框占位文案；不限制用户输入任意自然语言。

## 保留边界与未完成项

- 本轮没有替换 CBoard 默认板、分类或图片，没有修改官方翻译，也没有引入 PicInterpreter seed 图库。
- 默认板仍缺少厕所、头晕、恶心、发烧、不舒服、医院、手机、吃药动作、打电话动作和胸口疼等独立概念。这些词当前会保持未匹配，不会硬猜。
- PicInterpreter 的“低匹配率 AI 重分词”和“ARASAAC/OpenSymbols 在线图符回填”尚未接入本轮。如继续，应做成中性、可注入、可关闭的低置信度 fallback，不应改写默认板。

## 验证结果

- 真实默认板与新增语义回归：通过。
- Communication Support、Tuyujia 兼容层、Settings、TileEditor、Board 集成回归：28 suites / 96 tests / 3 snapshots 通过。
- 本轮变动文件的 ESLint 定向检查：通过。
- 独立输出目录生产构建：退出码 0，产物位于 `.codex-logs/build-verify-matching-20260715-191725`。由于标准 `build/` 和 ESLint 缓存在开发进程下存在 Windows 文件锁，本轮使用 `BUILD_PATH` 隔离输出并关闭内置 ESLint 插件，同时已独立执行定向 ESLint。
- 测试日志中仍有项目既有 Google Analytics、Material UI 弃用提示和 TileEditor PropTypes 警告，无本轮失败。

## 推送前复核（2026-07-16）

- 意图：确认匹配优化与后续接收契约、历史来源和跨端 DTO 仍保持同一语义。
- 决策：保留 CBoard 默认板与分类；匹配类型和阶段置信值统一由 receiverContract 提供，历史导入不再把 partial、online 或 ai 的缺省置信值夸大为 1。
- 理由：匹配算法、UI 解释和持久化若各自维护映射，旧数据恢复后会出现来源与质量不一致。
- 证据：2026-07-16 00:11:32 使用 Codex (GPT-5) 完成 31 suites / 114 tests / 3 snapshots 聚合回归；ESLint 通过。
- 生效范围：communicationSupport 匹配与接收历史归一化；普通 CBoard 板和 Tile 不变。
