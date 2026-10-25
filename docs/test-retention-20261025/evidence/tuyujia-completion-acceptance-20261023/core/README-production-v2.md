# 正式网址 v2 核心验收

Codex，2026-10-23 20:12–20:17 Asia/Shanghai。目标 `https://app.tuyujia.com.cn`。**接收、常用语、删除源图库卡后的收藏引用三条流程最终全部通过。** 第一轮接收和常用语通过；源卡用例在上传后的测试像素哈希环节遇到 Node/browser `crypto` 名称冲突，修复测试脚本别名后仅重跑源卡用例并通过。原失败证据完整保留；这不是产品失败，也没有重新运行前两条。

## 版本核对

每个浏览器进程在执行产品操作前，均读取实际加载的主脚本响应字节并计算 SHA-256，匹配冻结 v2 构建清单：

- 主脚本：`https://app.tuyujia.com.cn/static/js/main.3e77d65e.js`
- 实测 SHA-256：`592d8ac68fecfd75e0eb68203487b65c113b4c43a100277ff5426dc9419ea28f`
- 主任务提供的冻结构建总指纹：`a71840f41b8953ad24a06873eedbbe07d8e6bc5fdd4dabcbbf0c6a36192172ec`

部署切换记录见上级 `deploy/web-gallery-durable-v2-promote.json`。本子任务未发布、未修改产品源码。正式网址配置跳过本机 webServer。初次进入会等待 Service Worker ready 并刷新；下表“首次操作”是该准备完成后的操作，不是无缓存冷启动。

## 精确通过路径

| 流程 | 正式站结果 |
|---|---|
| 接收：原句输入 → 分词配图 → 原文展示 → 分段主动重听 | 原文不变；`我`与`不`的公共图缓存均命中。首次及离线新进程中的 `img.decode()` 均成功，尺寸 298×298、850×850，实际源为 blob。下一段不会自动播报；主动重听只读当前段。 |
| 没明白 → 重展不增历史 → 改说草稿 → 关闭浏览器 → 离线新进程 → 取消 | 草稿及 repairOfRecordId 保持，取消回原记录。改说重复确认只新增一条；换图并右移后禁用不可靠分段，原记录内容保持。 |
| 常用语准备/双保存 → 修改取消 → 修改草稿离线恢复 → 更新/另存 | 保存无重复；取消不变；更新保持原 ID 和创建时间；另存新 ID；接收草稿未被这些操作影响。 |
| 分类取消/保存/筛选 → 导入预览/取消/双确认 | 分类结果正确；导入预览和取消不写；确认只新增一条且立即出现在 UI，无需重开来恢复界面。 |
| 查看整句静默 → 主动整句播报 → 纯文本重用 → 连续删除/撤销 → 收藏离线重开 | 主动播报为原整句；纯文本可调用。删除旧条目可见数为 0；撤销后 3 个新 ID 都立即可见；再次离线新进程状态一致、会话撤销关闭。 |
| 新上传私人源卡 → 实际收藏 → 原生图库取消删除/确认删除 → 独立离线重开 | 源卡确实删除且重开后仍不在人物菜单；已有收藏原人物 ID、标签、data URI 图片和图序列不变。48×48 私图再次 decode；删除前后 RGBA SHA-256 完全相同。 |

源卡用例人物 ID 为 `device_private_custom_curated_public_sCiVwwkI3`；合成私人图像 RGBA SHA-256 为 `30382c51f5c5d47e0b431660fa7084c24e7f7b85570cd2fd92a249c0e62405ed`。这一用例只覆盖一条收藏引用，未把结果扩大为历史或未完成草稿引用的全覆盖。

## 请求与隔离

以下计数只汇总最终通过的三个流程；首轮脚本失败独立保留，不混入成功计数。

| 观测 | 接收 | 常用语 | 源卡删除引用 |
|---|---:|---:|---:|
| HTTP request 事件 | 224 | 268 | 201 |
| 被阻断的本站 API 事件 | 6 | 5 | 3 |
| 外部来源事件 | 0 | 0 | 0 |
| modelAttempt | 0 | 0 | 0 |
| 私密/AI/计费违规 | 0 | 0 | 0 |
| pageError | 0 | 0 | 0 |
| 离线阶段普通 `/symbols/` 请求事件 | 52 | 89 | 60 |

API、外部来源及非 GET/HEAD 请求由隔离 browser context 路由阻断。离线新进程从 launch 即 offline。普通图片 request 事件不是联网成功证据；公共图读取本机缓存，私人快照使用嵌入图片，实际解码已验证。本报告不宣称所有请求为零，也不将浏览器边界扩大为操作系统级防火墙审计。TTS 使用可观测替身，未验证真实扬声器。

全过程仅使用新建合成 profile，无真人资料、无既有用户浏览器。最终成功链 PID：接收 37456 → 23008；常用语 78168 → 91420 → 90336；源卡 20336 → 84788。首轮脚本失败 PID 17580 也已退出。共 8 个进程确认退出，4 个 owned profile 移除，`.profiles` 剩余 0，未启动本机测试 server，4209 无监听。

## 证据

- 接收：`production-core-receiver-production-v2.json`
- 常用语：`production-core-favorites-production-v2.json`
- 源卡最终通过：`production-core-source-deletion-production-source-deletion-v2.json`
- 源卡首轮脚本失败：`production-core-source-deletion-production-v2.json`
- 首轮：`core-run-production-v2-01.log`、`browser-report-production-v2.json`（2 passed，1 harness failure）
- 源卡复跑：`core-run-production-source-deletion-v2-02.log`、`browser-report-production-source-deletion-v2.json`（1 passed）
- 截图：`browser-artifacts-production-v2/`、`browser-artifacts-production-source-deletion-v2/`
- 机器摘要：`acceptance-summary-production-v2.json`

未覆盖真人/手机、付费模型、所有容量或故障边界；只报告上述正式网址三条实际 UI 链。
