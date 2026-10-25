# 图语家 Web 个人图库保存可靠性：只读审查

时间：2026-10-23 16:33（Asia/Shanghai）  
执行：Codex（本次运行具体模型标识未独立核验）  
仓库：`<WORKSPACE>/fork-cboard/cboard`  
边界：只读源代码与已安装依赖；未编辑产品源码，未运行测试或浏览器验收。主任务代理负责实现与基线。

## 结论

不需要新建图库系统。应保留现有 CBoard Board/Tile、Redux 和 redux-persist/localForage，补一条绑定当前 store 实例的“派发 → flush → 严格读回 → 比较本次目标”的确认接口，并把个人图库涉及的四个保存动作统一改为等待确认。

仅把 `savePerson` 改成 async、或仅等待 `persistor.flush()`，都不足以证明保存成功。还必须处理旧存储回退、稳定 ID 重试、已在内存更新但未确认落盘的情况，以及旧回调覆盖新输入的问题。

## 已确认的当前链路

| 环节 | 具体位置 | 当前行为/影响 |
|---|---|---|
| 人物保存 | `src/components/Board/CommunicationSupport/PersonalImageManager.component.js:318`，`savePerson` | 根据 DTO 构造整板，调用 `onBoardSave` 后立即清空 person 并显示成功；新人物 ID 每次提交现场生成。 |
| 中间转接 | `CommunicationSupportPanel.component.js:956`，`handleCuratedBoardSave` | `Boolean(onUpdateCommunicationBoard(...))`；若下层改成 Promise，这里会立即得到 true，必须一起修改。 |
| Redux 接入 | `CommunicationSupportPanel.container.js:63`，`onUpdateCommunicationBoard` | `dispatch(updateBoard(board)); return true;`，只证明 action 已派发。 |
| 原生 reducer | `src/components/Board/Board.reducer.js:236`，UPDATE_BOARD | 整板替换并更新 lastEdited/syncMeta；无本地落盘确认。不存在的 board 也不会抛错。 |
| 创建个人板 | 上述三个文件中的 `createPersonalBoard` / `handleCreatePersonalBoard` / `onCreateCommunicationBoard` | 同步返回 ID；CREATE_BOARD 与 ADD_BOARD_COMMUNICATOR 两次派发。CREATE_BOARD reducer 直接 push，同 ID 重试未去重。 |
| 持久化实例 | `src/store.js:8`，`configureStore` | persistor 只在返回值中；`getStore()` 为模块全局，新增确认服务应绑定实例，避免测试或重新 configureStore 后串用。 |
| 当前存储后端 | `src/reducers.js:35,99,143` | 正常模式为 migratingStorage，写入委托 localForage（cboard/cboard_store）；demo 为独立 memory storage。 |
| redux-persist 行为 | `node_modules/redux-persist/lib/createPersistoid.js`，writeStagedState/onWriteFail/flush | `storage.setItem(...).catch(onWriteFail)` 吞掉 rejection；flush 只返回当前 writePromise。写失败不自动重新排入队列。 |
| getStoredState | `node_modules/redux-persist/lib/getStoredState.js` | 可复用其两层反序列化及 transforms；它本身不负责确认“读的是当前权威后端”。 |

`createMigratingStorage.getItem` 在 IndexedDB 读取抛错时仍继续读旧 localStorage，并可能把旧值重新写回新后端。这可用于现有启动兼容路径，但不能用于保存后验收。`src/__test__/reducers.test.js` 当前还明确测试了这个回退行为；不应为本次修复无差别改写整个迁移契约。

## 建议的最小实现

### 1. 共享现有持久化实例，增加严格确认入口

在 `reducers.js`/`store.js` 的现有构造路径共享 root config、实际 storage 与 strict-read storage：

- 正常写入继续经过 redux-persist；确认读取直接访问同一个 localForage 实例，任何读取失败向上传递，不能回退旧 localStorage，也不能触发迁移。
- demo 的确认读取必须使用本次 createReducer 真正拿到的那一个 memory storage，不能另建一份。
- 使用 `getStoredState({ ...rootConfig, storage: strictStorage })` 解码；不要手写第二套 root 序列化格式。
- 只在 persistor 已完成 bootstrapped 后执行确认保存。等待失败和未启动不能返回成功。
- 派发后从 `store.getState()` 获取 reducer 真正生成的目标 board 快照（包含实际 lastEdited），等待 flush，再严格读回目标 board；至少比较完整 tile 内容、身份、布局和必要元数据，并确认 board 未 tombstone。不得只比较 ID 是否存在或 tile 数量。
- 创建板还需确认本次 ADD_BOARD_COMMUNICATOR 对应的成员关系确实在读回的 root 中；否则会出现“板存在但导航找不到”。

如果测试模拟底层写入完成乱序，需在这一条现有 storage 适配器内串行化 setItem/removeItem，并让严格读回等待此前已排队操作；否则旧 root 写入仍可能在较新写入之后落盘。保持 Promise 队列在错误后可继续执行，不把 rejected 队列永久挂死；错误仍交给对应操作的确认结果处理。不要另建图库 DB、第二份 root 快照或旁路手工持久化整个 Redux state。

### 2. 保留现有同步 action，新增有确认语义的薄包装

`createBoard`/`updateBoard` 是其他 CBoard 编辑流程复用的普通 action creator，不应全局变成异步或改变其返回值。个人图库 container 使用新的薄 thunk/实例服务：

1. 验证当前 scope、目标板存在且未删除；
2. 在最新 Redux board 上校验基线并执行这次变更；
3. 派发原有 action；
4. 通过上述确认入口验证；
5. 返回明确的 true/ID（或统一结构），异常/未确认返回失败。

不在 await 之后重新派发提交时捕获的整板，也不在失败时把旧整板回滚进去。失败后 Redux 内可能已经含有该修改，界面应说明“未确认保存，当前输入保留”，重试负责核对。

### 3. 稳定身份与可重试操作

可以直接借鉴现有 `favoriteState.js:createFavoriteStateStore.commit` 和 `expressionDraft.js:createExpressionDraftService` 中的 captured scope、expected/head、attemptedWrite 和精确读回模式；这两个实现已覆盖写成功但读回失败后，只认可自己那次尝试的情形。

- 新人物：第一次提交前确定并保留 tile ID、目标 board ID、本次 tile 快照。写失败或读回失败后重试仍使用同 ID。
- 仅固定 ID 不够：第一次 dispatch 已把 tile 加入 Redux，继续用 `appendPersonalPictogramToBoard` 会因 ID 已存在失败。重试应先核验同 ID 是否为本次 attempted tile；相同则确认/重写当前 board，需要修改则按当前 board 做局部替换。
- 检测到同 ID 已被后续编辑，返回冲突并保留输入；不能把旧 attempted tile 覆盖回去。读取到不属于本次尝试的同 ID 不能当成成功。
- 创建个人板同样保留 pending board ID；重试不得再次 CREATE_BOARD 同 ID，也不得生成新 ID 绕过未确认结果。
- 公开图卡收纳/移除沿用现有 curation helpers，但要兼容“已完成内存变更、仅持久化确认失败”的重试；例如已移除不应自动恢复旧板后再移除。
- 普通 redux-persist flush 不会强迫未变化的 slice 再写。若上次写确实失败，重试必须产生一次新的合法持久化更新，或由当前保存服务重新提交最新 state；不能只再次 flush 并期待自动重试。

### 4. 防止迟到结果覆盖新输入

现有 PersonalImageManager 已有 mounted、selection ref 和 imageOperationEpoch，可扩展为每次操作的 request token，而非另建生命周期框架。

- 在保存/图片读取前捕获 requestId、scopeKey、privacy epoch、person draft revision/selected candidate 与目标板。
- `getCommunicationStorageScopeKey()` 在 Panel 已存在；management dialog 已用 scopeKey 作为 React key。但只靠重挂载不足以阻止晚到服务写入；服务与 UI 都要校验。
- 每次 await 后，成功和 catch 路径都先验证 mounted/request token/scope/epoch。旧失败也不能覆盖新操作的 notice。
- 只清空“刚才被确认的那一份 person”。如果用户已经换人、改名字、换图片或更换目标板，保持新输入。
- saving 期间禁用重复提交；若允许继续编辑，用 revision 判断是否可清空，不要只依赖 disabled。
- 账户/档案切换、隐私清理、组件卸载后取消后续提交/提示；已派发的本地写入不可谎称取消成功，也不能在旧 Promise 完成后回灌旧内容。

目前两处读图 catch 都直接 setNotice，缺少与成功路径等价的过期判断；这属于同一迟到结果问题。

## 必须一起改为异步等待的调用点

| 文件/函数 | 修改要求 |
|---|---|
| `CommunicationSupportPanel.container.js`：onUpdateCommunicationBoard / onCreateCommunicationBoard | 接到确认持久化的服务/thunk，Promise 完成前不报告 true/ID。 |
| `CommunicationSupportPanel.component.js`：handleCuratedBoardSave | async；`await` 后再判断结果，去除 Promise 的 Boolean 转换。 |
| 同文件：handleCreatePersonalBoard | async；等待创建确认，pending ID 由操作上下文保留，失败不可重新发号。 |
| `PersonalImageManager.component.js`：savePerson | await onBoardSave；失败保留 person/ID；成功仅清空同一 draft；重复点击与过期响应保护。 |
| 同文件：createPersonalBoard | await onCreatePersonalBoard；失败保留名称/ID；成功且未过期才设置目标板和 notice。 |
| 同文件：curatePublicPictogram / removeCuratedPictogram | await onBoardSave；不得把 Promise 当 truthy；失败与已完成写入后的重试区分。 |
| `CommunicationManagementDialog.component.js:1027` | 目前仅 props 透传；通常无需另写保存逻辑，可传递现有 scopeKey。 |

其他原 CBoard 编辑入口：`Board.container.js` 的 handleEditTileEditorSubmit（642）、handleAddTileEditorSubmit（654）以及多处 updateBoard 也没有本地落盘确认；`TileEditor.component.js:301` 虽声明 async，调用 onEditSubmit/onAddSubmit 没有 await（334/336/372）。本次可复用其 Board/Tile 数据路径，但不能因此宣称原生整个编辑器已具备可靠保存。若主任务范围包括原生编辑器，则额外接同一确认服务并保留编辑状态；否则明确作为未覆盖入口，不为补图库故障而重写整个编辑器。

## 个人熟悉图片偏好：现成能力与剩余缺口

这一路不是 Redux board，而是 `localData.savePersonalImagePreference → repository.savePersonalImagePreference → writeStorageValue`。`repository.js:529` 已对 personalImagePreferences 写入做精确字符串读回，值得复用其约定。

但 `loadAllPersonalImagePreferences:995` 仍使用 `safeParse(..., [])`；`adapters/browserStorage.js:getItem` 对该 key 的读错误仍返回 null（只有部分常用语 keys 抛错）。因此预读异常/坏 JSON 可被当成空列表，后续保存有覆盖旧列表风险。最小改法：对图库持久化 key 使用严格读取与 shape 校验（复用已有 `readRequiredShape`），读取失败时阻止写入，而不是把 null 当成“真不存在”。补入 adapter 的严格读取范围或提供严格读取方法；不要把所有未知错误一律吞掉。

`handleImageChange` 已读到的新照片目前仅是局部变量；onSave 返回 false 后没有可直接再次提交的候选。因此若本次验收要求偏好换图失败也“保留输入重试”，需保留已验证 image+attribution+tile/board/scope 到现有组件 state/ref，并给出重试动作，不要求再次选文件。不能把照片写到另一个图库系统。

## 只跑相关故障验证的建议

本次审查未执行以下测试。主任务可按实际实现选择相应文件，使用现有 `craco test --watchAll=false --runInBand --runTestsByPath ...` 的定向入口，不需要全套测试。

1. **真实 redux-persist 单元集成**：底层 setItem reject，flush resolve，确认服务仍失败；读回返回旧值/静默不写同样失败。
2. **严格后端**：新后端 read reject、旧 localStorage 恰有相同 board，确认仍失败，且不迁移/回写旧值。
3. **解码与实例**：getStoredState 使用当前 root config；demo memory 和正常实例隔离；未 bootstrapped/不存在的 board/tombstone 均不成功。
4. **创建完整性**：board 与 communicator 成员关系都读回；二者缺一失败；重试只有一个 board ID、一份成员关系。
5. **人物写失败**：姓名、照片、目标板与 pending tile ID 保留；再次提交可成功且无重复人物。
6. **写成但读回失败**：严格后端实际存了本次快照；下一次重试核对后认可同一次操作，不重复追加。
7. **真正并发**：保存 A pending 时发生后续 board 修改 B；A 失败/成功返回不得回滚 B；用可控 deferred storage 故意改变完成顺序检测旧 root 覆盖。
8. **旧编辑冲突**：重试时同 ID 的 tile 已被其他操作修改，返回冲突且不重放旧整板。
9. **UI 异步传播**：Panel 收到 Promise.resolve(false)/reject 不返回 true；创建、人物、公开收纳、移除四处 pending 时均无成功提示。
10. **迟到结果**：保存期间改名/换图/换人/换板，旧 success 不清空新输入，旧 rejection 不覆盖新 notice；卸载/scope 切换/privacy epoch 同理。
11. **偏好预读失败**：localStorage getItem 抛错/坏 JSON/非数组时不调用 setItem；写后读回失败保留本次照片供重试。
12. **最小重载证明**：使用同一合成 storage 建两个 store，第二个 rehydrate 后目标 tile 的完整图片和元数据仍在。真实浏览器持久化/图片解码需要另作浏览器验收；jsdom mock 和内存 fixture 不能替代。

对应现有测试位置：`src/__test__/reducers.test.js`、`CommunicationSupportPanel.container.test.js`、`CommunicationSupportPanel.component.test.js`、`PersonalImageManager.component.test.js`、`repository.personalImagePreferences.test.js`、`storagePorts.test.js`。既有 Panel 保存测试目前只用同步 false/true；必须增加 deferred Promise 才能发现本问题。

## 交付限制

以上是当前工作树和已安装 redux-persist 5.10 源码的静态审查；尚未证明具体修复通过测试、真实浏览器落盘或重启恢复。个人图库中的照片仍应留在现有本机私有数据边界，不能为保存确认引入上传、模型调用或新的同步入口。
