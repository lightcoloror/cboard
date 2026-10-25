# 常用语已提交结果的 UI 刷新修复

记录：2026-10-23 18:23:50 +08:00；Codex subagent `/root/gallery_persistence_audit`，运行模型未独立核验。

依据：本目录 `README-gallery-durable-v1.md` 及分别保存的 `import-immediate-diagnostic.json`、`delete-immediate-diagnostic.json`、`undo-immediate-diagnostic.json`。不是名为 import-delete-undo 的合并文件。

## 失败基线

先增加使用真实 localData / repository 的组件集成回归：现有一条收藏，经 UI 文件预览、确认导入后，规范存储为两条，Panel 仍传一条到 ManagementDialog。该测试在修改生产代码之前失败。导入服务已自行完成持久化与读回，Dialog 仍调用 onSavedPhrasesChange(result.items)，Panel 再用旧 React savedPhrases 作为 expectedPhrases 执行 overwrite，触发 CAS 冲突并阻止刷新。

删除和撤销也复用这条错误的第二次写入路径；不是底层仓库未保存。

## 最小修复

仅修改两个生产组件及各自测试：

- `CommunicationManagementDialog.component.js` 新增已提交回调 `onSavedPhrasesCommitted({scopeKey,guard})`。导入 commit、delete、undo 成功后通知此回调；不传 result.items 当作新的写入请求。
- `CommunicationSupportPanel.component.js` 新增 `handleCommittedSavedPhrases`。检查 mounted / scope / guard 后严格调用 loadCommunicationSavedPhrases，读后再次检查，使用规范列表更新 state 与 latestSavedRef，并沿用原有同步通知。此路径不调用 overwriteCommunicationSavedPhrases。
- 原 `onSavedPhrasesChange`、分类保存和待写变更仍保留原 expectedPhrases CAS。
- 本地提交成功但后续刷新读取失败时，Dialog 保留原 UI/导入预览，明确提示“操作已保存到本机，但列表读取失败”，提供“重新读取常用语”。重试只触发规范重读，不再次 commit / undo；不会因撤销栈已前进而误撤销上一条。
- 只读刷新回执受 dialog mounted、操作 revision、scope、隐私 epoch 保护。关闭对话框会取消尚未完成的导入读取；关闭、卸载或隐私失效后的迟到文件错误不改写当前提示。Panel 在规范重读前后均检查回调是否仍有效。

## 验证

命令采用现有 CRACO/Jest：

```text
node node_modules/@craco/craco/dist/bin/craco.js test --watchAll=false --runInBand --runTestsByPath src/components/Board/CommunicationSupport/CommunicationSupportPanel.component.test.js src/components/Board/CommunicationSupport/CommunicationManagementDialog.component.test.js --silent
```

2 个文件，65 项测试通过。包括：

- 真实仓库：文件预览→同一 handler 双确认→立即显示两条→连续删除两条→连续撤销两条，UI 每步均等于规范仓库；撤销产生的稳定新 ID 立即可见；没有发生 Panel 第二次 overwrite。
- 只读刷新忽略传入伪列表，只使用 canonical loader 结果；读取失败保留原 UI。
- 规范读取期间 guard 失效、陈旧 scope、卸载回调拒绝更新。
- undo 后刷新失败可只读重试，不重复 undo；隐私 epoch 变化后该回执不能刷新。
- import 后刷新失败保留预览，重读成功再清预览，不重复 commit。
- 对话框关闭后的迟到文件失败不显示旧错误。
- 原分类失败保留、expectedPhrases 写入参数等既有测试仍通过。

本次四个文件的定向 `git diff --check` 通过。没有修改公共图片缓存相关源码，没有运行 build、浏览器、部署或全套测试。生产源码已通知 root 冻结可并入下次构建；浏览器最终复验由 root 继续，不能以本记录的 JSDOM 测试代替真实 UI 复验。
