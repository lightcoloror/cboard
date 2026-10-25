# 个人图库持久化确认服务：实施与定向验证

时间：2026-10-23 16:50（Asia/Shanghai）  
执行：Codex（本次运行具体模型标识未独立核验）  
范围：主代理分配的 reducers/store/确认服务及测试；未修改 container、Panel 或 PersonalImageManager。

## 可接入接口

```js
import { saveVerifiedBoard } from '../../../common/communicationSupport/verifiedBoardPersistence';

await dispatch(saveVerifiedBoard(nativeBoard, {
  expectedBoard: nativeBoardBeforeEdit, // 更新必须显式提供原生基线；创建传 null
  create: false,
  guard: () => requestStillCurrent()   // 调用者负责档案、隐私 epoch 和 UI 请求身份
}));
```

更新成功返回 `true`，创建成功返回 `board.id`；失败 reject，error.code 为 `BOARD_PERSISTENCE_FAILED`、`BOARD_SAVE_CONFLICT` 或 `BOARD_SAVE_CANCELLED`。上层需要 await/catch，不得 Boolean(Promise)。

## 已实现

- `src/reducers.js`：新增 `createOrderedStorage`，同一 backend 共用读写/删除队列；单次失败保持 rejection，对队列后续操作不造成永久阻塞。新增 `createPersistenceContext`，共享 rootConfig 与 strictStorage；正常启动仍保留原迁移兼容契约，保存核验严格读取当前后端；demo 使用本实例真正写入的 memory storage。
- `src/store.js`：使用 `thunk.withExtraArgument` 注入当前 store 的确认服务。服务不依赖全局 getStore，不会因第二次 configureStore 而确认到其他实例。
- `src/common/communicationSupport/verifiedBoardPersistence.js`：沿用 createBoard/updateBoard/addBoardCommunicator 原动作；确认服务校验 bootstrapped、基线、完整 board、tombstone、账号/active communicator 与调用者 guard；flush 后通过原 getStoredState 解码、严格读回、完整内容比对。创建同时核验 communicator 成员关系。
- 服务记录本次 attempted 快照；同 ID 的确认失败可安全重试，并重新触发 persist 更新（单独 flush 不会重试已吞掉的失败写）。未知同 ID、已修改基线、已删除 board 拒绝；不回滚整板、不在 await 后重放旧快照。
- `src/__test__/store.test.js` 与新的 `verifiedBoardPersistence.test.js`：增加实例隔离和故障驱动测试。

## 基线与执行记录

1. 先新增定向测试，再运行：测试文件因新服务模块尚不存在而失败（1 suite failed，0 tests；这是接口缺失基线，不当作运行旧逻辑的故障复现）。旧逻辑的具体缺口此前已通过源码审查记录。
2. 首次通过 npm 转发参数的命令被当前 shell/npm 环境错误解释，未保留 runInBand，Jest worker spawn 报 EPERM。改为现有 `node node_modules/@craco/craco/dist/bin/craco.js ...` 直接入口，未安装依赖、未升级工具或权限。
3. 第一轮实现：3 suites、25 tests 全通过。
4. 补充更多真实持久化链路与并发测试后，一项 tombstone 测试因合成初始 state 缺 navHistory 失败；补齐测试 fixture，未改产品 reducer 来迁就 fixture。
5. 最终定向检查：3 suites、32 tests 全通过；无 snapshot 更新。`git diff --check` 未报告内容空白错误，仅现有 Git 行尾策略提醒 LF 将来转 CRLF。

最终命令（cwd 为 `<WORKSPACE>/fork-cboard/cboard`）：

```text
node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand --runTestsByPath src/common/communicationSupport/verifiedBoardPersistence.test.js src/__test__/reducers.test.js src/__test__/store.test.js --silent
```

最终结果：`Test Suites: 3 passed, 3 total`；`Tests: 32 passed, 32 total`；耗时约 2.4 秒。工具仍报告 caniuse-lite 数据过旧提醒；本任务未升级依赖。

## 覆盖内容与限制

已覆盖：底层 setItem rejection 被 redux-persist 吞掉、静默无写入、严格读失败禁止旧存储回退、写成功读回失败的重试、创建成员核验与同 ID 去重、后续修改不被旧重试/迟到完成覆盖、前后 scope guard、队列顺序与错误后恢复、未 bootstrapped 拒绝、删除板与未知同 ID 拒绝、完整图片内容核验、可序列化可选字段、同 backend 二次 store rehydrate、两份 demo store 实例隔离。

本实现仅提供确认保存基础设施与故障验证。UI 异步传播、稳定 pending 人物/板 ID、失败后保留输入、个人照片偏好严格预读由主代理衔接。未运行 build、浏览器、部署、网络服务或全量测试；上述合成 memory/backend 集成不能替代真实浏览器 IndexedDB 与重启验收。
