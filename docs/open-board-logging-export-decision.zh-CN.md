# 图语家 Open Board Logging 标准导出决策

## 2026-07-23 00:57:05 | Codex（GPT-5）

- Action：在 CBoard Web 与微信小程序的共享沟通核心中加入 OpenAAC Open Board Logging 0.1 导出。
- Files：src/common/communicationSupport/historyManagement.js；CommunicationManagementDialog.component.js；cboard-wechat-poc HistoryManager.tsx 与 management.ts。
- Summary：保留现有易读文本导出，新增用户主动触发的私密 .obl 标准日志；不上传、不写姓名/设备/网络/位置，也不把含原文的文件宣称为匿名 .obla。

### 意图

让图语家的双向沟通历史可以使用 AAC 社区已有的开放格式流转，而不是继续增加只能由图语家识别的自定义 JSON。标准导出应同时适用于 CBoard Web 和微信小程序，并保持患者沟通原文的隐私边界可见。

### 决策

- 复用 [OpenAAC Open Board Logging 规范](https://www.openboardformat.org/logs) 的 open-board-log-0.1 契约，不搬运其 Rails 文档站或引入新的运行时依赖。
- 共享纯核心新增 **buildCommunicationHistoryOpenBoardLog**；平台层只负责下载或调用微信文件能力。
- 每个本机沟通会话映射为 type=log 的 session，按时间升序排列；每条已保存历史映射为 utterance event。
- 患者表达使用 modeling=false，照护者输入给患者理解的接收记录使用 modeling=true；方向、图片标签和患者反馈只放在 ext_picinterpreter_ 前缀扩展字段。
- 导出时重新生成 session-N、event-N 和临时 user_id，不暴露内部 history/session ID；不写 user_name、device_id、网络、位置或图片 URL。
- 保留真实沟通文字和时间，因此文件默认是私密 .obl；不设置 anonymized=true，不生成 .obla，也不声称已完成 timestamp shift、jitter 或 fringe masking。
- Web 与微信继续保留原来的易读文本导出；标准日志入口单独显示隐私提示，只有用户主动操作才生成文件。

### 理由

- OpenAAC 已把 .obl 定义为 AAC 使用日志的开放交换格式，并要求只有完整执行全部匿名化步骤后才能宣称 .obla。
- 现有文本导出适合照护者阅读，但无法让其他 AAC 工具按会话、事件和角色解析。
- OpenAAC 官方仓库采用 MIT 许可证，但当前公开实现是 Rails 文档站，规范仍把解析和验证列为后续工作；没有值得为此引入的成熟 TypeScript 运行库。按规范写最小纯函数比复制不相关技术栈更小、更可审查。
- 双向沟通中的接收记录不是患者本人操作；使用规范已有 modeling 语义比自创第二套事件类型更兼容。

### 证据

- 官方规范要求 format=open-board-log-0.1、字符串 ID、ISO 8601 UTC 时间、按时间排序的 session/events，并将完整句子定义为 utterance event；[OpenAAC 官方仓库](https://github.com/open-aac/openboardformat) 为 MIT。
- 共享核心测试覆盖格式、顺序、角色、扩展字段、内部 ID 去除、空日志拒绝和不得宣称 anonymized。
- CBoard 聚焦 2 suites / 16 tests；全量 194 suites / 1319 tests / 72 snapshots；production build 通过，主包 gzip 1.67 MB，本切片增加 785 B。
- 微信全量 65 files / 294 tests、质量门 7/7、TypeScript、ESLint、186 app / 29 core 边界和 production build 通过。
- 微信包体：main 1,249,564 B，management 512,636 B，caregiver 571,172 B，emergency 94,003 B，backup 599,098 B，ocr 64,693 B；全部低于 1.5 MiB 建议线。

### 生效范围

- 生效于 CBoard Web 和微信小程序的本机沟通历史手动导出，以及两端共享的纯核心。
- 不改变历史持久化、云同步、表达/接收、分词、匹配、TTS、ASR、个人图片或患者反馈语义。
- 暂不包含 .obl 导入、严格 .obla 匿名化、研究数据上传、云端日志收集或第三方验证器；这些能力需要独立隐私评审和互操作样本。
- 本轮未新增依赖，未预览、上传、发布、部署、提交或推送；全程后台执行，没有打开、激活、聚焦、抬升或置顶任何窗口。

## 2026-07-23 08:01:42 | Codex（GPT-5）

- Action：在既有 OpenAAC Open Board Logging 0.1 导出基础上，补齐 CBoard Web 与微信小程序的本机标准日志导入。
- Files：`src/common/communicationSupport/historyManagement.js`、`storage.js`、`CommunicationManagementDialog.component.js`；`cboard-wechat-poc/src/features/communication/management.ts`、`HistoryManager.tsx` 及对应测试和类型声明。
- Summary：两端复用同一个受限纯解析器导入 `.obl` 的 `utterance` 事件；导入记录只保存在当前设备、不进入账号云同步，不覆盖既有历史，重复导入保持幂等。

### 意图

让照护者可以把其他 AAC 工具产生的 OpenAAC 标准沟通日志带回图语家查看和继续管理，形成“标准导出 -> 外部流转 -> 标准导入”的本机互操作闭环；同时避免外部日志中的身份、设备和网络字段扩大患者隐私面。

### 决策

- 继续复用 [OpenAAC Open Board Logging 规范](https://www.openboardformat.org/logs) 的 `open-board-log-0.1` 契约，不新增 JSON/日志解析依赖，也不复制官方 Rails 文档站。
- 共享纯核心新增 `importCommunicationHistoryOpenBoardLog`；Web 使用浏览器文件输入，微信复用既有 `CommunicationFilePort`，平台层不各自实现解析规则。
- 字符串输入按规范从第一个 `{` 开始解析，因此兼容官方建议的单段 `/* ... */` 警告前缀；同时接受已解析对象，便于测试和其他平台复用。
- 只导入 `utterance` 文字事件；`modeling=true` 默认映射为照护者接收记录，其余映射为患者表达。图语家导出的 `ext_picinterpreter_direction`、标签和患者反馈扩展在有效时恢复。
- 校验格式、字符串 `user_id`、会话、事件 ID、时间和文字；限制输入为 1 MiB、最多 200 个会话、2,000 个事件、单条文字 5,000 字符和 40 个标签。
- 忽略 `user_name`、外部 `user_id`、设备、网络、位置、URL 和其他身份字段；本机稳定 ID 不使用外部 `user_id`。
- 导入记录标记 `localOnly=true` 和 `importSource=open-board-log`；本机存储保留标记，构造云端 settings 时明确过滤，不把外部患者日志上传到账号。
- 导入是追加式和幂等的：保留现有历史，重复文件不重复添加；达到 100 条本机历史上限时跳过超出容量的外部记录，而不是删除本机记录腾位。
- 不验证或宣称外部文件已经匿名；`.obla` 严格匿名化、研究共享和远程日志导入仍保持独立评审边界。

### 理由

- OpenAAC 已经定义日志容器、会话、事件和 `modeling` 语义，直接复用可避免图语家再发明私有导入格式。
- 官方仓库采用 MIT 许可证，但没有成熟的 TypeScript OBL 解析器可直接复用；用现有纯函数与平台文件端口实现受限解析，比引入整套 Rails 应用或未经维护的第三方库更小、更安全。
- 外部日志可能包含患者原文和身份元数据。默认仅本机、拒绝云同步和非破坏式容量策略，能在实现互操作的同时避免隐私扩散与本机历史丢失。
- 只导入可恢复为图语家双向沟通历史的 `utterance`，并明确统计不支持、无效、重复和容量跳过项，比静默猜测其他事件类型更易审查。

### 证据

- 官方规范明确 `.obl` 为 JSON、`format=open-board-log-0.1`、文件内 ID 为字符串，并建议解析器搜索第一个 `{` 以兼容警告前缀；[OpenAAC 官方仓库](https://github.com/open-aac/openboardformat) 为 MIT。
- 共享核心测试覆盖警告前缀、身份字段忽略、表达/接收映射、标签、患者反馈、幂等、容量保护、不兼容格式和无 `utterance` 拒绝；storage 回归证明 `localOnly` 在本机保留但不进入云端 settings。
- CBoard 聚焦 3 suites / 21 tests；全量 195 suites / 1324 tests / 72 snapshots；production build 通过，主 JavaScript gzip 1.67 MB，本切片增加约 1.43 kB。
- 微信聚焦 2 files / 4 tests、全量 65 files / 294 tests、质量门 7/7、TypeScript、ESLint、186 app / 29 CBoard core 边界和 production build 全部通过。
- 微信包体：main 1,249,564 B，management 517,758 B，caregiver 571,294 B，emergency 94,125 B，backup 599,220 B，ocr 64,815 B；全部低于 1.5 MiB 建议线。
- `git diff --check` 通过，仅报告既有 Windows LF/CRLF 转换提示；没有新增依赖、图片或音频资源。

### 生效范围

- 生效于 CBoard Web 与微信小程序的照护管理页、本机沟通历史 repository/storage、OpenAAC `.obl` 手动导入和两端共享纯核心。
- 不改变表达、接收、分词、图文匹配、TTS、ASR、个人图片、默认板或既有文本导出；不新增 API，也不把导入记录同步到 cboard-api。
- 不包含严格 `.obla` 匿名化、远程 URL 导入、研究数据上传、第三方验证器或非 `utterance` 事件语义恢复。
- 本轮未预览、上传、发布、部署、提交或推送；全程后台执行，没有打开、激活、聚焦、抬升或置顶任何窗口。

## 2026-07-26 09:46:41 | Codex（GPT-5.6）

- Action：在既有私密 `.obl` 导出旁新增严格匿名 `.obla` 研究日志导出，并由 CBoard Web 与微信小程序复用同一纯核心。
- Files：`src/common/communicationSupport/historyManagement.js`、`CommunicationManagementDialog.component.js`；`cboard-wechat-poc/src/features/communication/management.ts`、`HistoryManager.tsx`、类型声明及对应测试。
- Summary：用户主动导出的 `.obla` 不保留可恢复沟通原文、真实身份、真实 ID、原始时间、位置、网络、设备、URL 或扩展字段；不上传研究平台，也不把匿名文件用于本机历史恢复。

### 意图

补齐 OpenAAC 日志互操作中“可供研究使用但不暴露患者原始沟通内容”的独立导出路径，同时继续保留私密 `.obl` 作为可恢复的原文交换文件。两种用途必须在入口、文件扩展名和提示中清楚分开。

### 决策

- 继续复用 [OpenAAC Open Board Logging 0.1](https://www.openboardformat.org/logs) 契约，不引入新的日志 SDK、云端研究服务或上传 API。
- 共享纯核心新增 `buildCommunicationHistoryAnonymizedOpenBoardLog`；CBoard Web 和微信平台层只负责保存 `.obla` 文件，不复制匿名化算法。
- 严格执行规范列出的九项保护：`id_pseudonymization`、`timestamp_shift`、`timestamp_jitter`、`geolocation_masking`、`net_masking`、`fringe_masking`、`name_masking`、`url_stripping`、`extras_removed`。只有全部完成时根节点才设置 `anonymized=true`，每个 session 同时声明完整清单。
- 所有用户、会话和事件 ID 重建为文件内伪 ID；首个会话平移到 `2000-01-01T00:00:00.000Z`，后续时间保持顺序并在相邻事件和会话边界内加入随机抖动。
- 图语家历史是自由文本，无法可靠证明哪些词属于可公开核心词汇，因此采用保守的完整 fringe masking：每条原文替换为唯一 `:fringe-N`，并设置 `redacted=true`，不尝试保留或猜测患者敏感文字。
- 仅保留规范根节点、session 和 event 的必要字段；删除姓名、设备、位置、网络、URL、图片标签、患者反馈、方向和所有 `ext_*` 扩展。
- `.obla` 是不可逆研究副本，不能恢复为原沟通历史；需要迁移和恢复时继续使用私密 `.obl`。当前只允许用户手动导出，不自动生成、不上传、不云同步。

### 理由

- OpenAAC 只允许在全部九项匿名化完成后把日志声明为 `.obla`；部分遮盖仍可能通过时间、自由文本、扩展字段或稳定 ID 重新识别患者。
- 中文患者表达、地址、姓名、医院和家庭关系无法仅靠词典稳定区分。完整替换自由文本牺牲词汇内容，但能把“严格匿名”变成可验证契约，而不是未经证明的承诺。
- 复用现有 `.obl` 构造器后再做纯函数净化，可以保证两端会话语义一致，也比在 Web、微信各写一套正则脱敏更容易审计和回归。
- 规范仍处于早期版本，官方仓库没有成熟 TypeScript 匿名化库；移植 Rails 文档站或自行建立研究上传服务都会扩大依赖和隐私责任，本轮没有这样做。

### 证据

- [Open Board Logging 官方规范](https://www.openboardformat.org/logs)与 [OpenAAC 官方仓库](https://github.com/open-aac/openboardformat)列出上述九项保护，并说明只有完整匿名化日志才可使用 `.obla`；仓库采用 MIT 许可证。
- 共享核心测试验证空日志、完整九项声明、伪 ID、固定时间平移、顺序内抖动、每条原文 redaction，以及姓名、地址、家庭、医院、账号 ID、URL 和扩展字段均不出现在结果中。
- CBoard 聚焦 `2 suites / 21 tests`、全量 `200 suites / 1353 tests / 72 snapshots` 通过；隔离输出目录 production build 成功。标准构建首次仅因 Windows 占用 `.eslintcache` 失败，禁用该构建内 ESLint 插件后编译成功，测试与目标差分检查独立通过。
- 微信聚焦 `1 file / 2 tests`、全量 `73 files / 325 tests`、质量门 `7/7`、TypeScript、ESLint、`204 app / 30 CBoard core` 边界和 production build 通过。未压缩包体为 main `1,249,620 B`、caregiver `566,763 B`、emergency `94,125 B`、management `520,390 B`、backup `832,869 B`、ocr `64,815 B`，全部低于 `1.5 MiB` 建议线。

### 生效范围

- 生效于 CBoard Web 与微信小程序照护管理页的本机沟通历史手动导出，以及两端共享的 Open Board Logging 纯核心。
- 不改变私密 `.obl` 导出/导入、普通文本导出、本机历史、表达、接收、分词、matcher、图卡、语音、AI、账号同步或 API schema。
- 不包含研究平台上传、云端日志收集、第三方验证器、外部 `.obla` 可信性认证或从匿名文件恢复原文；`.obla` 的不可逆性已在两端 UI 明示。
- 本轮未新增依赖、媒体或插件，未预览、上传、发布、部署、提交或推送；全程后台执行，没有打开、激活、聚焦、抬升或置顶任何窗口。

## 2026-07-27 05:54:55 | Codex（GPT-5.6）

### 意图

把上节“`.obla` 是不可逆研究副本，不能恢复为原沟通历史”的决策落实为共享导入器的强制边界，并用真实 production 页面证明导出与拒绝导入属于同一闭环。

### 决策

- 继续复用 OpenAAC `open-board-log-0.1` 和既有跨端 `historyManagement`，不新增依赖、平台专用解析器或第二套日志格式。
- 根节点 `anonymized=true` 的日志在格式校验后立即拒绝；拒绝发生在 session/event 解析和任何 repository 写入之前，返回零新增、明确中文原因和未改变的原历史。
- 私密 `.obl` 仍可按既有规则追加导入；文件扩展名或 UI `accept` 不是安全边界，最终判定以解析后的根节点语义为准。
- CBoard production E2E 使用真实照护管理入口下载 `.obla`，审计顶层/session/event 字段白名单、九项匿名化声明、伪 ID、时间平移和自由文本遮蔽，再通过真实文件输入尝试导回。

### 理由

- 匿名文件中的 `:fringe-N` 是研究占位符，不是患者表达；把它导入本机历史会制造错误沟通记录，也与“不可恢复”的提示矛盾。
- 仅依靠 `.obl` 文件选择器过滤无法阻止改扩展名、程序化输入或其他平台文件端口；共享内容语义校验才能覆盖 Web、Electron、Cordova 和微信。
- 官方 OpenAAC 契约已经给出匿名日志语义，现有纯核心也已实现严格净化；最小修复应补齐拒绝契约和运行门，而不是再造格式或引入未成熟解析 SDK。

### 证据

- 共享核心新增匿名导入拒绝回归，聚焦 `12/12` 通过；CBoard 全仓 `203 suites / 1406 tests / 72 snapshots` 与 production build 通过。
- production `.obla` E2E 在 desktop Chrome、Pixel 5 竖屏和横屏 `3/3 PASS`；完整离线生产回归 `33/33 PASS`。真实下载内容只含规范白名单，九项匿名化完整，原句、姓名、地址、内部 ID、真实年份和 `ext_picinterpreter` 均不存在；导回后明确拒绝且 localStorage 原记录逐项保留。
- 微信管理服务复用同一核心并新增集成断言；TypeScript、ESLint、`213 app / 32 core` 边界、`76 files / 339 tests`、质量门 `7/7` 和 production build 全部通过。主包 `1,249,738 B`，全部分包低于 `1.5 MiB` 建议线。

### 生效范围

- 生效于共享 OpenAAC 导入核心、CBoard Web/Electron/Cordova 的照护管理导入和微信管理服务。
- 不改变 `.obla` 导出净化算法、私密 `.obl` 恢复、研究平台上传、账号云同步、沟通历史 schema、表达、接收、分词、matcher、图卡、语音或 AI。
- 不宣称可验证外部 `.obla` 制作者是否诚实完成匿名化；本产品只拒绝把任何声明为匿名的日志恢复为私密历史。
- 本轮未打开或置顶微信开发者工具，未预览、上传、发布、部署、提交或推送。
