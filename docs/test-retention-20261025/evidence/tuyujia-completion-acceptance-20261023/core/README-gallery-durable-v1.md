# Web 核心实际 UI 验收 — gallery-durable-v1

Codex，2026-10-23，Asia/Shanghai。范围是本机构建与合成资料；不是线上、临床或手机验收。仅新增本目录测试与证据，没有修改产品源码或部署。

候选 `<WORKSPACE>\fork-cboard\cboard\.local-build-20261023-gallery-durable-v1`，构建总指纹由主任务提供：`92ccb64cfe4f5b9c2acea64cac4b3e1c1cdfb20ca77e500be17092ce6cd605a5`。脚本验证页面 main JS 属于主任务的构建清单。来源仅 `127.0.0.1:4209`。

最终运行 `core-run-04.log`：3 个完整工作流，1 个通过，2 个因实际 UI 缺口失败。失败使用 soft assertion 后继续完成独立步骤；不能把所有步骤已执行视为所有步骤通过。先前 run01–03 留作诊断，不计为额外通过次数。

## 精确结果

| 路径 | 结果与限制 |
|---|---|
| 输入 `我今晚不回家吃饭，明早七点半回家` → 分词/配图记录 → 全屏原文 | 原文、词序与记录通过；公共图片实际显示失败：`我`、`不`两个图片引用对应 Cache API 未命中，页面没有 img。run03 等待 18 秒仍未出现。 |
| 按原文分段 → 下一段 → 再说一次 | 通过。段切换没有自动 TTS；主动按钮只请求读 `明早七点半回家`。使用可观测 TTS 替身，未验扬声器。 |
| 没明白 → 重展原记录 → 改说 → 浏览器真正退出 → 新进程离线恢复 → 取消 | 通过。重展不增历史；草稿有 repairOfRecordId；离线恢复原草稿；取消回原句/原图序列。 |
| 改说 → 重复全屏确认 → 没明白 → 换图 → 右移 | 通过。双确认只新增一条；保留原记录；顺序变化导致映射不可靠时禁用分段，并提示改用整句。换图的视觉解码因公共图缓存缺口未通过。 |
| 常用语准备 → 双保存 → 修改取消 → 修改草稿 → 新进程离线恢复 → 更新 | 通过。仅一条收藏；取消不改变原收藏；更新保留原 ID/创建时间。恢复会合法更新 updatedAt，语义字段不变。 |
| 以此准备新句 → 另存 → 分类取消/保存 → 按生活情境筛选 | 通过。新 ID；原收藏未被覆盖；分类取消不写、确认保存、筛选可见性正确。 |
| 文件导入 → 预览 → 取消 → 再导入双确认 | 预览和取消零写入、确认只新增一条通过；确认后 UI 同步失败。存储 3 条而界面 2 条，并报“常用语已变化”。真实独立浏览器重开后导入项才可见。 |
| 查看整句 → 主动整句播报 → 纯文本常用语重用 | 通过（在导入后的明确重开恢复之后）。预览静默；主动 TTS 是原整句；重用纯文本项载入沟通区。 |
| 3 条常用语连续删除 → 连续撤销 | 仓库事务通过，UI 同步失败。仓库全删后 UI 仍显示旧 3 条；撤销恢复 3 个新 ID，原句/图序列/分类保持，但新 ID 在 UI 不可见。新进程离线重开后显示正确；会话撤销不可再用。 |
| 同名人物两个新合成图 → 主动选第二人 → 草稿离线重开 → 保存收藏 → 收藏离线重开 | 全通过。两个 40×40 合成纯色图经产品文件控件上传并保存；第二人的 personId、data URI 与图序列保持。草稿和收藏两次真实独立进程恢复均实际解码；RGBA SHA-256 相同，静默展示。 |

## 已定位缺陷

1. 导入、删除、撤销均已由对应本地服务提交规范仓库；`CommunicationManagementDialog.component.js` 随后调用 `onSavedPhrasesChange`。`CommunicationSupportPanel.component.js` 的 `handleManagedSavedPhrasesChange` 又用旧 React `savedPhrases` 作为 expectedPhrases 执行 overwrite，比较并交换冲突导致 state 不刷新。建议区分“待持久化修改”与“已提交结果刷新”，避免第二次写入。证据是 `import-immediate-diagnostic.json`、`delete-immediate-diagnostic.json`、`undo-immediate-diagnostic.json`。最终 run04 的 deleteImmediate.remainingRows=5 使用宽 ID 前缀，含两处非条目控件；其正文、已知条目 ID 与存储证明实际仍显示旧 3 条。脚本后续已收窄到已知条目 ID。
2. `ReceiverLoopPanel` 的匹配预览和 `ReceiverDisplay` 全屏均使用 `Symbol localOnly`，`LocalSnapshotImage` 对 packaged URL 只读取 Cache API。冷环境这两个构建自带图片没有缓存，本地 build 内虽有文件，当前流程也未加载它们，因此整条接收流程无公共图片。缺图提示存在，不是人物身份丢失。应按产品意图区分“新匹配构建自带公共图”与“恢复的历史快照”，或通过离线准备使公共图字节可用；不能自动联网恢复私人或远程图片。证据 `receiver-cold-display-cache.json`。

## 证据与隔离

- 接收：`local-core-receiver-1792750236358.json`，2 个不同浏览器 PID。
- 常用语：`local-core-favorites-1792750268168.json`，4 个不同 PID，包含明确的导入 UI 恢复重开。
- 人物：`local-core-namesake-1792750290122.json`，3 个不同 PID。
- 9 个测试浏览器进程均确认退出；3 个带 ownership marker 的隔离 profile 已移除；4209 测试服务器已停止。没有接入用户已有浏览器资料。
- 页面请求边界阻断外部来源、API、非 GET/HEAD；离线恢复从 launch 即 offline。三个流程均 0 私密/AI/计费违规请求、0 modelAttempt、0 pageError。该证据是浏览器 context 请求与离线边界，不是 OS 全局防火墙证明；API 健康 GET 被分类并阻断，不冒充模型请求。
- 所有最终草稿和收藏均由 UI 操作生成；未直接写 localStorage/IndexedDB 最终结果。只读规范 `cboard_communication_favorite_state_v1`，避免旧 legacy key 不生效导致误报。
- 截图在 `browser-artifacts/`；完整测试断言在 `core.spec.js`；`browser-report.json` 是 run04。

本轮未覆盖全部 12 条起步句、99/100 容量边界、过期导入预览冲突、写入/回执故障；这些不能计为通过。父任务另有故障注入验收。
