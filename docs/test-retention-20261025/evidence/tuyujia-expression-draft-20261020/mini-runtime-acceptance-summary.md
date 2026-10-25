# 小程序表达草稿实际生产包验收

工具：Codex（当前运行模型未独立核验）、wechatide 0.3.14；时间：2026-10-21 01:45（Asia/Shanghai）。

候选目录：`dist-local-20261021-expression-draft-v2`。源码和发布目录未因本验收改动。父任务冻结产物指纹 `ac04561d42af3c133679c1b29ac222e9d2ff7a65240eb0eac2c09e72c1b76320`。

## 补充最小重验：最终断言已通过

2026-10-21 01:48，在独立的 `synthetic-draft-family-final / synthetic-draft-profile-final` 范围，重新通过实际收藏载入、拒绝、`simulator_refresh` 和“继续上次表达”完成之前被汇总脚本错误中断的断言。没有重新生成预览或改动产品。

- JavaScript 全局哨兵消失、持久哨兵仍相同，运行页面成功绑定到 pageId 24。
- 草稿原始字节哈希前后一致：`76c1f062de4de257b0a50f0471e0b8595510f63194c392e31e8998bc62ae9b75`。
- 主动继续后的完整草稿逐字段相等，`rejected=true`、A／B／A 具体身份不变，拒绝提示正确。
- 保留原来的 15 秒自动播报设置，恢复后观察 17 秒：`audioStarts=0`、网络/媒体请求记录为空；没有隐式 AI 或扣费。
- 脚本完整执行所有断言，退出码 0；finally 核对原会话恢复成功，清理 23 个本轮合成范围键，全部替身恢复。

最终证据：`mini-draft-final-recheck-evidence.json`；可复查脚本：`mini-draft-final-recheck.py`。第一次关项目失败仍在下文保留，本次通过只证明开发者工具运行环境刷新重启这一层。

## 已取得的实际包证据

- 通过真实图卡按钮选择“我要喝水”，生成本地三候选并保存；“都不对”写入拒绝状态。
- “暂不处理 → 开始新表达时取消 → 继续上次表达”使用真实 UI，保留所载入草稿；该用例使用的是首次关窗后读到的 revision 2，不是拒绝 revision 3。
- 清空、当前会话内撤销恢复通过；页面 `reLaunch` 后清空状态不复活。此项只证明页面层，未混称进程重启。
- 纯文字“我今晚不回家吃饭”可以保存、重进、主动继续并连续确认；确认标记保持同一 `confirmedRecordId`。最终汇总读取到一条同句历史，但因脚本假设空 `output` 必定存在而抛错，见下方限制。
- 合成姓名“合成林安”及同一图卡 ID 的人物 A／B／A 顺序通过真实收藏载入和拒绝操作进入草稿。
- `simulator_refresh` 后旧 JavaScript 全局哨兵消失，持久哨兵在清理时确认同值，草稿原始字节哈希前后一致（`874f53fa88182fb77f21083f15da5cb9c9aee3aa7e6b0ddbe4aa4c929882a162`）；revision 15、完整原句、A／B／A 身份、候选及拒绝状态均保留，界面先显示恢复选择。随后实际点击继续，并保存仅含合成资料的截图。
- 隔离账号为 `offline`，移除了在线会话凭据；验收阶段对 `wx.request`、上传和下载使用失败替身，音频使用计数替身。已记录各步骤请求为空；没有新增真实模型调用。

## 失败和限制（保留，不覆盖）

1. 首次 `close_project_window → open_project_window` 后发生运行绑定错误，恢复连接后读到 revision 2 而不是刚保存的拒绝 revision 3，普通持久哨兵也不存在。该关项目用例失败，原因未确定。工具源码只证明 close 返回不等于窗口已完全关闭；不能据此直接断定产品写入错误或独立存储分区。
2. 第二次使用运行环境刷新时，`currentPage` 绑定调用超时；其后的清理读取成功，再单独补读证明全局哨兵消失、持久哨兵曾保留及原草稿字节完全一致。分别保留初始超时和后续正向证据。
3. 第一次最终汇总脚本对纯文字历史直接取 `history[0]['output']` 导致 `KeyError`，该旧格式会省略空数组。旧失败记录保留，脚本已修复。随后按上方补充最小重验完成缺失的运行恢复、身份及零自动行为断言；没有把首次失败记录改成通过。
4. 不等于手机杀进程、真实断网或扬声器验收。没有实测新模型调用；未知 AI 结果恢复由父任务隔离测试证据覆盖。

## 清理与预览

原会话的三个键已逐值核对恢复，22 个合成范围键已清理；`request`、`uploadFile`、`downloadFile`、音频和弹窗替身均恢复。私密用户存储备份已删除，未输出其内容。

清理后只生成一次开发预览成功。官方返回总包 **2,974,990 bytes**，主包 **1,783,224 bytes**。未提交正式审核，未单独报告插件包体积。二维码：`mini-expression-draft-preview.png`；收据：`mini-preview-receipt.json`。

## 证据入口

- `mini-draft-runtime-evidence.json`：逐阶段合成草稿、恢复比对和清理回执。
- `mini-runtime-refresh-namesakes.json`：初始绑定超时与持久哨兵清理记录。
- `mini-runtime-final-readback-limitation.json`：最终汇总脚本字段假设错误，不能计为通过。
- `mini-runtime-boundary-readonly-diagnosis.md`：独立只读工具边界诊断。
- `mini-draft-restored-synthetic.png`：实际恢复后，仅合成资料的界面。
- `mini-preview-receipt.json`：预览成功、官方包体和二维码指纹。
- `mini-draft-final-recheck-evidence.json`：修复夹具后在新范围完成的最终全部断言和清理。
