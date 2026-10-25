# 未完成表达保存与安全恢复：独立审阅

- 时间：2026-10-21（Asia/Shanghai）
- 工具：Codex 子代理，PowerShell 只读源码检查。
- 范围：共用 `expressionDraft.js`、Web AI transport、小程序 AI transport、人物恢复、确认及隐私清理入口。
- 状态：源码检查完成；本记录不代替测试结果、生产浏览器验收或小程序运行环境重启证据。
- 本审阅未修改产品代码、未启动浏览器或开发者工具、未部署、未调用模型。

## 已报告并在当前源码核对到修正的问题

小程序 `communicationAiPort.ts` 原 `requestAuthenticated` 的异常白名单没有传递 `EXPRESSION_DRAFT_*`。发送前保存失败虽然阻断了请求，但 UI 会收到“网络不可用”的无代码提示。已通知根代理；再次只读检查发现 catch 已保留草稿错误的原 code 和 message，共用写入失败也已归一为 `EXPRESSION_DRAFT_STORAGE_FAILED`。

需要由根代理的 transport 回归确认：抛出和静默失败均使实际 HTTP 调用次数为零，界面显示本机保存错误而非联网错误。

## 核对结果

| 项目 | 源码证据 | 结论与边界 |
|---|---|---|
| 本地人物快照 | `expressionDraft.js` 保留完整有序 `outputSnapshot`，不按标签或图卡 ID 重新查图库 | 同名、重复 ID 的具体身份不会在规范化时合并 |
| 匿名请求恢复 | `attachExpressionDraftRequest` 只恢复先前匿名 wire body；当前有序快照重新建立 non-enumerable 人物映射 | wire body 不带人物映射；映射摘要参与已有 journal 的 request identity |
| 原扣费范围 | `prepareAi` 校验原 `scope`、`requestId`、`fingerprint`；Web/Taro dispatch 前冻结当前 scope | 账户、档案、额度、人物映射不同不能使用新编号伪装原重试 |
| 存储先于发送 | Web `api.js:625`、Taro `taroCommunicationAiPort.ts:78` 的 `beforeDispatch` 位于实际 HTTP 调用之前 | 草稿写入或读回不一致会在 dispatch 前失败；真实行为仍以 transport 测试为准 |
| 陈旧写入 | service 捕获作用域与已读 head；repository 使用 expected record 与读回校验 | 切换作用域、其他页面改版、隐私清理之后，旧实例不能覆盖新草稿 |
| 确认幂等 | 确认要求当前选中句及完整 output 一致；历史 ID 为稳定草稿派生值；写后读回；最后更新 confirmed 标记 | 历史已写而草稿收尾失败时，原草稿 ID 可重试；不重复 append，不重建已清理的确认历史 |
| Web 隐私清理 | `localData.clearPrivatePictograms` 先清表达草稿；SupportPanel 随后停播、清顶部 output、切换 draft epoch | 持久与在用状态都有清理动作 |
| 小程序隐私清理 | backup service 先 `clearExpressionDrafts`；清失败先返回；CommunicationPage `refreshCareWorkspace` 检测草稿被清并 reset suspended session | 返回表达页不会继续用被删除草稿恢复私人图片 |
| 清空与 30 分钟闲置 | 空状态为 `cleared`；会话过期只更新 AI 对话，不清表达 session | 不会把最近已确认历史当作未完成草稿 |
| 无隐式生成 | 生命周期 hook 仅保存/核对；恢复交互不调用生成端口 | 需要生产构建请求记录确认组件没有其他隐式调用 |

## 复用测试建议与现有覆盖

根代理已增加的 `communicationAiTransport.test.js` 用真实 API 模块 + 可控 Axios adapter 验证：

1. 草稿存储失败，adapter 未被调用。
2. 返回丢失后新建 service 实例，恢复相同匿名 body 和幂等键。
3. 资金来源切换后拒绝重放。
4. wire 参数不含合成姓名、私有图片地址、personId 或生命周期函数。

共用 `expressionDraft.test.js` 已有针对冷恢复、纯文字、清空、闲置、作用域、陈旧 revision、存储失败、确认收尾重试、坏版本、匿名人物恢复、草稿隔离、隐私清理和写后异常读回的用例。测试是否通过由根代理实际运行日志确定，本审阅不将读取测试代码视为通过。

后续生产浏览器 spec 使用已准备的 `expression-draft-production.spec.js`，覆盖三组完整实际界面流程，并通过独立 Chrome 进程关闭、PID 退出核对、同一隔离用户目录重开来验证冷启动。离线重开保留真实 Service Worker 缓存，不通过导入 storageState 替代磁盘恢复。

小程序 `mini-runtime-restart.py` 必须在根代理协调下执行；JS sentinel 消失且持久化 marker/草稿 hash 保持，才可记录开发工具运行环境重启通过。仅 `reLaunch`、工具命令成功回执或页面刷新均不充当该证据。

## 意图／决策／理由／证据／生效范围

- 意图：在部署前独立检查新草稿与原有费用、人物隐私和确认链路的接缝。
- 决策：复用已有 journal、匿名映射、历史规范化和平台 repository，针对生命周期接缝检查，不另建恢复或计费机制。
- 理由：恢复必须保持原身份和原输入；新增平行机制反而容易使请求、人物或记录身份漂移。
- 证据：上述当前源码及已准备的测试入口；实际自动验收日志另列。
- 生效范围：本地候选审阅；无服务端变更、真实模型请求、公众数据或手机真机结论。
