# 小程序运行环境重启边界：只读诊断

记录：2026-10-21，Codex 协作子代理（运行时具体型号未独立核验）。

## 结论

`close_project_window` 成功以及随后 `open_project_window` 成功，不能单独证明旧运行环境已退出、新运行环境已启动，或证明存储已经完整持久化。本轮 close/open 后出现草稿修订回退和普通 wx 存储哨兵消失，保留为未通过证据；目前没有足够证据把原因归为独立存储分区、旧窗口、产品代码或开发者工具缺陷。

后续 `simulator_refresh` 复验已留下更强的运行环境证据：JS 全局哨兵消失，普通持久存储哨兵仍可核对并按值清理，草稿序列化内容的 SHA-256 不变，修订 15、拒绝状态、同名人物 A/B/A 顺序和完整原句均保持，恢复提示可见。该结论限定为开发者工具 JS 运行环境刷新重建，不等同于退出整个开发者工具、手机杀进程或真实设备验收。

## 已核对事实

1. `outputs/tuyujia-mini-text-ai-20261020/ide.py` 每次调用传入同一个项目绝对路径。当前阶段加载该模块后仅替换阶段目录和项目路径；包装器没有草稿缓存或存储恢复逻辑。
2. `mini-draft-runtime.py` 的 `seed` 仅设置合成账号范围、收藏与偏好，不写 expression draft。测试 mock 针对请求、上传下载、音频及确认框，不替换 wx 存储接口；fixture 没有通用清除全部存储逻辑。
3. 工具文档 `C:/Users/lightcolor/.codex/skills/wechatide-skill/wechatide-tools/references/tools.yaml:30` 明确写明关闭项目窗口“不等于完全退出微信开发者工具”；第 53 行说明打开已存在项目窗口会直接返回已有窗口 ID；第 512 行说明刷新只触发重新编译/刷新，不返回编译结果。
4. 只读检查当前安装包 `D:/Tencent/微信web开发者工具/resources/app.asar` 内 `/js/e1aa86671c672ee925dc86d4ae5dddb1.js` 的 `ElectronMainCLIService`：关闭方法在分发关闭动作或调用窗口关闭后返回，方法本身未等待窗口完全退出；打开方法按现存窗口返回 `type: "reuse"`，否则等待窗口打开并返回 `type: "newopen"`。这些是窗口层结果，并非草稿持久化证明。
5. 本轮没有找到自动化模式创建独立 storage partition 的直接证据。不得据此虚构确定原因。诊断阶段未操作 IDE、未改变代码或存储、未调用模型。

## 保留的失败与后续证据

- `mini-draft-runtime-evidence.json`：
  - `rejected-before-restart` 为修订 3、`rejected: true`；
  - `interrupted-cold-probe` 的全局与存储哨兵均为空；
  - `after-defer-cancel-continue` 回到修订 2、`rejected: false`。
  - 上述 close/open 路径不能标记为通过。
- `mini-runtime-refresh-namesakes.json`：
  - 最初绑定当前页面工具超时，`success: false`；保留原结果，不把它改成通过。
- `mini-draft-runtime-evidence.json` 的 `refresh-readback-after-binding-timeout`：
  - 独立后续读取确认 `globalSentinelGone: true`；
  - `persistentMarkerObservedDuringCleanup: true`；
  - `beforeHash` 与 `afterHash` 都是 `874f53fa88182fb77f21083f15da5cb9c9aee3aa7e6b0ddbe4aa4c929882a162`；
  - 草稿修订 15、拒绝状态及三张图卡人物顺序 A/B/A 保持；
  - `recoveryPromptVisible: true`。

## 意图、决策、理由、证据、生效范围

- **意图**：区分真实运行环境重建与窗口/API 接受操作，避免把页面导航冒充冷恢复。
- **决策**：采用带 JS 哨兵、普通存储哨兵和草稿哈希的刷新后读回作为本轮开发者工具运行环境证据；close/open 单列未通过。
- **理由**：同一持久存储保留、JS 全局消失及内容完全一致，证据强于操作返回成功；原工具绑定超时和此前回退仍须保留。
- **证据**：上述现有 JSON、脚本、工具文档与安装包只读源码。
- **生效范围**：只影响本阶段验收结论与限制说明，不更改产品、IDE 配置、账号、模型或照片使用范围。
