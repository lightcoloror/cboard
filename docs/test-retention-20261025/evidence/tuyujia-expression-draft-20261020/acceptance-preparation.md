# 表达草稿验收准备（未执行）

记录：2026-10-20；工具：Codex；精确运行时模型未独立核验。

本目录工具只负责已有生产产物的合成验收。当前没有启动浏览器、静态服务、开发者工具，没有部署，没有调用真实模型。不能把脚本静态检查视为产品通过。

## 意图、决策、理由、证据、生效范围

| 变动 | 意图 / 决策 / 理由 | 证据 / 生效范围 |
|---|---|---|
| `persistent-browser-harness.cjs` | 复用仓库 Playwright，采用独立 persistent profile；关闭整个 Chromium 并观察 PID 退出，再以同 profile 新进程打开，避免把新标签算成冷启动 | 与上一轮 `phrase-use-production.spec.js` 相比只扩展测试生命周期；不修改产品、不访问用户浏览器 |
| `mini-runtime-restart.py` | 复用上一轮 `ide.py` transport，刷新或关闭/打开指定项目窗口；以 JS 全局 sentinel 消失、wx 持久标记及草稿哈希保留验证 | 只证明开发者工具 JS 运行环境重启，不证明手机进程或设备重启；需 root 协调后在非沙箱调用 |
| 网络证据 | Web 默认阻断全部 API 和跨域请求，并记录 AI、扣费或合成人物/照片请求尝试；记录内容摘要，不记录鉴权头 | 本轮本地草稿流程；不得用它声称真实 AI 扣费流程通过 |

## 复用入口

- Web 交互/TTS/SW：`fork-cboard/cboard/tests/offline/helpers/communicationSupport.js`。
- Web 合成图片及完整收藏 UI 载入：`outputs/tuyujia-phrase-use-final-deploy-20261020/phrase-use-production.spec.js`。
- Web 既有 AI 合成适配：`fork-cboard/cboard/tests/offline/communication-expression-three.spec.js`，以及 `tests/offline/helpers/authentication.js`。仅用于独立测试上下文，不能写入真实浏览器状态。
- Mini CLI：`D:\Tencent\微信web开发者工具\wechatide.cmd -c Codex`。先按 skill 检查登录和版本；本轮不能用关闭 urlCheck/私有覆盖配置换取成功。
- Mini UI：上一轮 `outputs/tuyujia-mini-text-ai-20261020/{ide.py,runtime.py,ui.py,final_runtime.py}`。禁止运行旧 `guard` / `fixture_control.py` 以免重新启用真实模型测试。
- Mongo：`fork-cboard/cboard-api/test/integration/careAiIdempotency.mongo.integration.js` 与 `careAiIdempotency.provider.fixture.js`。前者禁止读取真实 .env，要求空独立 `care_test_<hex>` 数据库及副本集，后者是本地 HTTP 可控供应商。
- 隔离执行 recipe：`outputs/tuyujia-mini-text-ai-20261020/run_mongo.py`，内部 Docker 网络、原 API image、临时 Mongo tmpfs，结束只清理带该 run 标签的资源。须更新本阶段输出/现场 image hash，不直接跑旧脚本覆盖旧证据。

## 构建、部署与回滚（由 root 执行）

- Web builder 复用 `outputs/tuyujia-ai-idempotency-20261016/build_web.py` 的模块接口；上一轮薄封装在 `tuyujia-phrase-use-final-deploy-20261020/build_web.py`。为本阶段指定新 `ROOT`、`VARIANT`、`BUILD`，不能覆盖已验收产物。
- Mini build 复用 `tuyujia-mini-text-ai-20261020/build-mini.ps1`：本次仍 textAI=true、AI=false、URL 检查开启、主域名 API、public trial=false；为本阶段独立 output root。
- 媒体 gate 复用 `privacy_gate.py` / `verify_mini.py`：比较已接受公共媒体逐文件 hash，拒绝 source map、boardsset、private-gallery、恢复个人照片路径。
- Web 发布复用 `tuyujia-phrase-use-final-deploy-20261020/prepare_web/{stage_web.py,promote_web.py,rollback_web.py}`，保留旧容器及网关备份。脚本固定旧端口及预期 hash，必须先重新 preflight 读取当前运行版、空闲端口和网关 hash，再生成本阶段配置，禁止盲目替换旧常量运行。
- 上一阶段 mini gateway 已改动。其 `gateway.py` 的回滚不属于本轮 Web 草稿发布，不能借用它回滚本阶段。
- 小程序预览复用 `tuyujia-mini-text-ai-20261020/preview.py`：最终 fingerprint/media gate 通过后生成一次预览。未知/挂起保留 receipt，不盲重发。

## 待最终源码对齐的 UI 验收

1. 通过已有收藏 UI 载入“我今晚不回家吃饭”以及同 ID/不同合成人物的几何图卡，不能直接注入新草稿规避保存入口。
2. 检查“已保存到本机”及真实存储内容；修改、选择/拒绝候选后继续检查。
3. 等待 SW ready，结束 browser PID；同 profile 以 offline 模式启动新 PID，先断言恢复选择及零播报，再点击继续比对完整内容。
4. 暂不处理保留草稿；开始新表达须确认，清空及确认完成后重开不复活。
5. 前写失败、静默写失败、成功后回执失败、迟到回调、切换 scope：复用既有故障注入方式；不能整份旧 localStorage 覆盖实际状态来“恢复”。
6. Mini 通过真实生产候选包 UI 保存后，执行重启证明；再核对恢复选择、连续操作和零隐式请求。
7. 未知 AI 结果恢复只接可控供应商/隔离 API。正式站草稿验收阻断模型请求，本轮真实模型新增请求预算为 0。
