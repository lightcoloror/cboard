# 个人图库 UI 接入持久化确认：实施记录

时间：2026-10-23 17:16（Asia/Shanghai）  
执行：Codex（本次运行具体模型标识未独立核验）  
范围：主代理授权的 Web 个人图库四个保存动作；保留原始工作树已有改动，未提交、部署、构建或运行浏览器，未触及 mini/webKit 环境。

## 已修复的行为

- container 的创建/更新调用 `dispatch(saveVerifiedBoard(...))` 并返回确认 Promise，不再在 action 派发后返回成功。
- Panel 的创建和更新处理函数等待 Promise，拒绝 `Boolean(Promise)`；更新向下传递原生 `expectedBoard`。它同时捕获当前 communication scope 与 image-operation epoch，并组合调用方 guard，在调用前和完成后核验。
- PersonalImageManager 的人物保存、个人板创建、公开图卡收纳、公开图卡移除共用轻量 pending operation。该对象保留本次目标 DTO、原生基线和成功/失败处理，等待确认再提示成功。
- 同步 busy ref 阻止同一事件批次内双击；按钮在确认期间禁用。
- 人物第一次保存分配稳定 ID，失败保留姓名、照片、目标与 ID。重试直接复用本次快照；即使 Redux 已加入 tile，也不会再 append 第二张。失败后修改姓名仍可基于自己的 attempted tile 更新同一个身份。
- 对既有人物保存选中时的 tile 基线；选中后该 tile 被其他动作修改时拒绝覆盖。人物草稿已尝试保存时不跨板重放，提示回到原个人板确认后再操作。
- 新板创建复用 pending ID；公开收纳复用 pending tile ID；移除复用精确目标快照。创建/删除已改变 Redux 导致原按钮消失时，独立“重试保存”按钮仍能重试确认。
- 输入/选择变更增加 revision；成功与失败都检查 revision、mounted、scope、privacy epoch。旧结果不会清空新姓名、人物选择或写入新通知。人物照片读取也检查相同生命周期条件。
- 相同照片可对应不同人物身份，仍按 tile ID/私有来源 originalId 区分，不按图片或名字合并。

## 文件

产品代码：

- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.container.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.component.js`
- `src/components/Board/CommunicationSupport/PersonalImageManager.component.js`

测试：

- `src/components/Board/CommunicationSupport/PersonalImageManager.persistence.test.js`（新增）
- `src/components/Board/CommunicationSupport/PersonalImageManager.component.test.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.container.test.js`
- `src/components/Board/CommunicationSupport/CommunicationSupportPanel.component.test.js`

## 故障基线与验证

先添加 deferred false / rejection 测试运行旧 UI，两个测试都确实失败：Promise 尚未完成，姓名已从“合成人物甲”清空。这是本次 false-success 的可复现运行基线。

实现后更新旧同步断言为异步确认断言，并新增：

- deferred false/rejection 保留姓名照片和稳定 ID；
- 同步重复点击只有一次提交；
- 改输入后旧成功/失败均不覆盖新内容；卸载/隐私清理后 guard 失效；
- 真实 configureStore + redux-persist + 合成 backend 的写失败后重试、不重复人物；
- 后续板修改不会被旧重试覆盖；既有人物选中后出现其他修改时阻止旧表单覆盖；
- 两个人使用同一照片仍有不同 tile ID/原始私有来源 ID，切换人物后旧结果不清空新选择；
- 创建已在内存出现、删除已使按钮消失时仍可重试；公开收纳不重复；
- Panel 保留显式原生基线，在 scope 切换后拒绝旧成功；创建重试保持同 ID；
- 创建、收纳、移除的 deferred rejection 都没有提前成功提示。

最终命令（cwd 为 `<WORKSPACE>/fork-cboard/cboard`）：

```text
node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand --runTestsByPath src/components/Board/CommunicationSupport/PersonalImageManager.persistence.test.js src/components/Board/CommunicationSupport/PersonalImageManager.component.test.js src/components/Board/CommunicationSupport/CommunicationSupportPanel.container.test.js src/components/Board/CommunicationSupport/CommunicationSupportPanel.component.test.js --silent
```

最终结果：**4 suites / 72 tests 全部通过，0 snapshot 更新**；耗时约 6.3 秒。`git diff --check` 无内容问题，仅仓库既有 LF/CRLF 提醒。此前核心持久化 3 suites / 32 tests 未机械重复；新增 UI 集成测试通过实际核心服务验证主要接线。

## 未覆盖

熟悉图片偏好的严格预读、读后写失败时保留照片候选重试仍属下一批；本次未顺带扩展。原 CBoard TileEditor 的保存入口仍未接入本确认服务，不能声明整个 CBoard 编辑器已完成可靠保存改造。此报告仅记录合成测试和源码实现，真实浏览器落盘/重载验收由主代理继续完成。
