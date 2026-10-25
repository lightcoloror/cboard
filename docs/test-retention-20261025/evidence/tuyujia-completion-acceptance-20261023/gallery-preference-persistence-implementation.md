# 熟悉图片偏好：严格预读、保留候选和安全重试

记录时间：2026-10-23 17:35:46 +08:00。执行：Codex subagent `/root/gallery_persistence_audit`（运行模型未独立核验）。

范围：`<WORKSPACE>/fork-cboard/cboard` 的熟悉图片偏好 adapter / repository / 本地读取和个人图片管理 UI。复用原 JSON 列表、动态作用域存储、图片操作 epoch 与上一批的 UI 异步操作封装。没有新增数据库，没有更改 Board/Tile 数据格式，没有提交、部署、构建或运行浏览器。

## 失败基线

先加入严格预读回归测试，运行 2 个相关文件：5 项失败、13 项通过。确认两条机制：

- repository 构造时的通用列表迁移把 `{broken`、`{}`、`null`、`[null]` 原文写成 `[]`；尚未触发实际图片保存便已丢弃无法读取的数据。
- browser adapter 在熟悉图片 key 的 getItem 异常时返回 null，使调用方无法区分“没有偏好”和“读取失败”。

另增加空字符串的坏 JSON 校验；旧的通用 readRequiredShape 对空字符串视作不存在，因此此处使用只接受 null/undefined 为不存在的专用读取。

## 实现

- `adapters/browserStorage.js`：熟悉图片 key（包括 scoped 前缀）读取失败和不可用端口直接抛错；其他旧端口语义保持。写入仍使用原端口。
- `repository.js`：从通用迁移中移除个人图片列表的自动修复写入。实际读取必须成功解析为数组且每个条目可识别，失败保留原文。保存前读取当前完整列表，再沿用原 upsert、原 key 和写后精确读回。
- 保存同一个候选 entry 时，用 WeakMap 保留仅本次未确认尝试的 expected/desired 快照。读回失败后可接受自己已写入的精确快照；有后续同一图卡改动则拒绝覆盖。成功后删除尝试记录，不增加持久化字段。retry 仍先读取最新列表并合并其他人物的条目。
- 保存前后核对动态 account/family/profile scope 及 patient/workspace 身份。预读期间切换或将未确认的旧 entry 转到另一身份会失败。
- `localData.loadPersonalImageRuntime`：渲染失败时使用原板图片并返回明确 error；写入口继续严格读取。Panel → ManagementDialog → PersonalImageManager 显示该错误，成功刷新后消除。
- `PersonalImageManager`：新照片读入后保留候选预览，await 保存回执；false/reject 后显示未确认和“重试保存”，不要求重新选文件。修改来源备注后仍可用同一候选图“保存新照片”。旧操作的成功、失败和读取错误均受 mounted/revision/scope/epoch 约束；候选重试也核对原 scope/epoch。
- 图片说明、恢复默认入口也改为 await 及现有同步 busy ref，避免把 Promise 当作成功。此项不等同于新增跨操作的删除事务回滚。

## 本批定向验证

使用已有 Node + CRACO/Jest、`--watchAll=false --runInBand --runTestsByPath ... --silent`，没有全套测试。

第一组 3 suites / 30 tests 全部通过：

1. `src/components/Board/CommunicationSupport/PersonalImageManager.preferences.test.js`（新）
2. `src/components/Board/CommunicationSupport/PersonalImageManager.component.test.js`
3. `src/common/communicationSupport/localData.test.js`

第二组 6 suites / 102 tests 全部通过：

1. `src/common/communicationSupport/repository.personalImagePreferences.test.js`
2. `src/common/communicationSupport/repository.migration.test.js`
3. `src/common/communicationSupport/storagePorts.test.js`
4. `src/components/Board/CommunicationSupport/PersonalImageManager.persistence.test.js`
5. `src/components/Board/CommunicationSupport/CommunicationSupportPanel.component.test.js`
6. `src/components/Board/CommunicationSupport/CommunicationManagementDialog.component.test.js`

合计 9 个相关测试文件、132 项通过。覆盖真实 repository 坏列表拒写后 UI 原图重试、false/reject、drop write、写后读回异常、安全重复重试、其他图卡保留、后续修改冲突、预读期间换 scope、旧尝试换身份、迟到结果、改备注、隐私 epoch 与卸载。图片解码在 JSDOM 中使用 fixture；这些不是浏览器实测或真实设备结果。

本批文件定向 `git diff --check` 通过。整个脏工作区的检查另显示 `CommunicationSupportPanel.css:1931` 存在 EOF 空行（本批未改该文件，已告知 root）。既有 LF/CRLF 提示不是本批行为失败。原 core32 已在上一批通过，本批没有修改其模块，未机械重跑。

已通知 root 源码就绪可开始构建；本 subagent 未构建。

## 原生 CBoard TileEditor：仅调查，未修复

`src/components/Board/TileEditor/TileEditor.component.js:301` 的 `handleSubmit` 虽是 async，334/336 的 onEditSubmit 和 372 的 onAddSubmit 均未 await；随后直接撤销预览并清空输入。`UNSAFE_componentWillReceiveProps:201` 又会重新生成 tile id，不适合作为失败重试的稳定标识。

`src/components/Board/Board.container.js:642` 的 `handleEditTileEditorSubmit` 直接调用 editTiles，登录分支调用 handleApiUpdates 后即切换选择模式。`:654` 的 add 入口还包含创建子板、communicator 关联、featured board 转换、上传和云端更新。这些都不因本次个人图库接入而自动得到核验。

现有 `saveVerifiedBoard(board,{expectedBoard,create,guard})` 能直接复用于“在现有本机板新增/修改普通图卡”的最终 native board 快照核验；不需新数据库。最小接入至少涉及上述 2 个生产文件及对应 2 组测试：container 构造最新 expected/desired 板并返回核验 Promise；TileEditor await 明确成功才清空，同时保留稳定 tile id、候选媒体及 scope/epoch。新建导航/子板会跨两个 board 和 communicator，需要定义顺序与幂等重试；登录上传/远端同步必须区分本机核验与云端确认。不能仅给当前回调加一个 await 就称完整完成。

因此本次完成的是个人图库的板保存链路及熟悉图片偏好的严格预读/候选重试；没有宣称全 CBoard 图库、原生 TileEditor、跨设备云端写入故障全部完成。
