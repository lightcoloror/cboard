# 图语家：未完成表达保存与安全恢复

更新：2026-10-21 01:50:10，Codex。精确运行时模型未独立核验。

**Web 已部署并通过本地及正式网址自动验收；小程序开发预览已更新，运行环境刷新重建有通过证据。关项目重开失败原因未定；恢复后的缺失断言已独立补跑通过；关项目重开的失败仍单列。**

正式入口：https://app.tuyujia.com.cn/board/root

## 版本与发布

| 项目 | 记录 |
|---|---|
| Web 部署 | 2026-10-21 01:26:11，静态端口 19111→19112，旧容器保留 |
| Web 源码指纹 | `0e2982950773e2119134967044e3b1bce4f780f26e53abf26264151b0d63757a` |
| Web 产物指纹 | `6671b84a7ce8a58eca35094f3e7413c205073823d487b3f1548a7651197b9205` |
| 小程序产物 | `dist-local-20261021-expression-draft-v2`，`ac04561d42af3c133679c1b29ac222e9d2ff7a65240eb0eac2c09e72c1b76320` |
| 小程序开发预览 | 2026-10-21 01:43:49生成一次成功；官方总包2,974,990 bytes、主包1,783,224 bytes，988个文件仍与冻结产物一致 |
| 生产保护 | API／Mongo／环境文件／官网／展台未变；未新增模型调用或改变真实账号额度 |

## 验收索引

| 范围 | 结果 | 证据 |
|---|---|---|
| Web 广回归 | 154套1971项；最后管理页修正前 | [web-regression.log](web-regression.log) |
| 最后 Web 时序修正 | 5套115项通过；完整收藏原句、默认选择、同名人物与重开保真 | `ExpressionLoopPanel.draft.test.js` 等5套组件测试；精确命令见下 |
| 草稿与传输核心 | 最新非watch精确复核2套31项通过，非新增31项 | [draft-final-core-recheck.log](draft-final-core-recheck.log) |
| 小程序回归 | 958通过、7跳过；posttest91通过；类型检查成功 | [mini-regression.log](mini-regression.log)、[mini-typecheck.log](mini-typecheck.log) |
| 真实Mongo隔离验收 | 14场景通过，可控供应商；临时容器／网络已移除 | [mongo/latest.json](mongo/latest.json) |
| 本地生产候选 | 3场景，9个独立Chrome进程、6次离线新进程 | [本地汇总](browser-local-acceptance-v2-summary.json) |
| 正式网址 | 3场景，9个独立Chrome进程、6次离线新进程 | [正式汇总](browser-production-acceptance-v2-summary.json) |
| 请求与隐私 | 本地627、正式615次请求检查，私人资料／AI请求均0次；独立合成资料与语音替身 | 两份浏览器汇总及其原始证据列表 |
| Web 产物隐私 | 3974文件完整；3756公共媒体与上一正式版本逐文件相同 | [privacy-verification.json](privacy-verification.json) |
| 小程序产物隐私 | 820媒体相同；text=true、ai=false、urlCheck=true | [verification.json](verification.json) |
| 发布结果 | 切换成功；保留旧容器；公开资产哈希与v2一致 | [发布凭据](prepare_web/web-expression-draft-promote.json)、[postcheck.json](postcheck.json) |
| 小程序运行环境刷新 | 刷新后旧JS哨兵消失、持久哨兵保留，revision15草稿字节及完整句／A-B-A人物／拒绝状态不变 | [实际运行摘要](mini-runtime-acceptance-summary.md)、[逐步证据](mini-draft-runtime-evidence.json) |
| 小程序关项目重开 | 未通过：revision3回退到2且持久哨兵缺失；原因未定，后续刷新成功不覆盖该结论 | [只读边界诊断](mini-runtime-boundary-readonly-diagnosis.md) |
| 小程序最终恢复断言 | 新合成范围真实运行环境重建→主动继续，快照／拒绝／A-B-A均一致；等待17秒，音频0、网络0；会话恢复并清理23个合成键 | [补跑通过](mini-draft-final-recheck-evidence.json)；[旧汇总失败保留](mini-runtime-final-readback-limitation.json) |
| 小程序开发预览 | 成功，未提交正式审核；预览后988文件与冻结产物一致、无privateconfig | [预览收据](mini-preview-receipt.json)、[产物复核](mini-post-preview-inventory-check.json)、[二维码](mini-expression-draft-preview.png) |

定向回归命令（在 `fork-cboard/cboard`）：

```powershell
npm.cmd test -- --watchAll=false --runInBand --runTestsByPath src/components/Board/CommunicationSupport/ExpressionLoopPanel.draft.test.js src/components/Board/CommunicationSupport/ExpressionLoopPanel.component.test.js src/components/Board/CommunicationSupport/ExpressionLoopPanel.shareLifecycle.test.js src/components/Board/CommunicationSupport/CommunicationSupportPanel.component.test.js src/components/Board/CommunicationSupport/CommunicationManagementDialog.component.test.js
```

自动流程覆盖完整原句、同名不同人物、有序重复图卡、拒绝与恢复选择、管理页往返、静默写入失败、确认清理失败及双击、清空／丢弃后的离线重开；接收草稿、常用语准备草稿、收藏和历史保持隔离。草稿不隐式搜索、调用AI或播报。

## 已保留的失败与修复证据

- v1管理页重用把完整句子覆盖成按图卡标签拼句：[失败报告](browser-local-report-attempt2-v1-original-sentence-lost.json)。修正effect执行顺序后，在v2保持原expected重新通过。
- 本地v2首次部分失败为缺图提示定位器同时命中隐藏与可见节点；仅修正定位器为可见节点，保留原产品断言。见本地汇总。
- 小程序v1产物门禁发现共享源码可选链，改为等价普通语法，构建v2；v1不发布。
- 早先遗留Jest watch会话已关闭，其开发过程失败不作为最终状态；最新非watch31项精确复核通过，不把重复复验相加。
- 小程序首次关窗重开失败保留；后续`simulator_refresh`初始绑定超时，独立读回补齐刷新重建正向证据：草稿哈希 `874f53fa88182fb77f21083f15da5cb9c9aee3aa7e6b0ddbe4aa4c929882a162` 前后一致。不能把不同层级全部记为通过。
- Playwright早期报告继承了完整测试进程环境；已在工作区报告去除该环境段，配置改为只传所需测试变量。不可传播未脱敏的原始环境内容。

## 回滚与记录

回滚只恢复本轮确切网关文件，保留新旧静态容器；操作命令与守卫见 [DEPLOYMENT.md](DEPLOYMENT.md)。本轮没有执行回滚。

Obsidian预览为 [阶段笔记](obsidian-stage-preview.md)、[总台账追加](obsidian-ledger-preview.md)、[文字AI记录追加](obsidian-text-ai-preview.md)，已通过Obsidian CLI新建阶段笔记并向另两篇追加，旧正文保持；实际读回及双向链接验证成功，见[写入凭据](obsidian-write-receipt.json)。

没有手机真机、真实扬声器或临床验证。浏览器进程重启证据不替代小程序关项目重开；小程序运行环境刷新不等于手机杀进程。隔离供应商测试不冒充真实付费模型测试。

小程序实际包验收采用隔离offline范围与请求／上传／下载失败替身，语音用计数替身；未产生新模型调用。原会话三个键已逐值恢复，22个合成范围键清理，所有替身恢复，私密临时备份已移除；清理后才生成预览。官方响应未单列插件体积。
