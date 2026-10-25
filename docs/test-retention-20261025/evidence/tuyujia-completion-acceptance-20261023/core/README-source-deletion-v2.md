# 删除源图库卡后的收藏快照验收

Codex，2026-10-23 19:51 Asia/Shanghai。冻结候选 `.local-build-20261023-gallery-durable-v2`，构建指纹由主任务提供 `a71840f41b8953ad24a06873eedbbe07d8e6bc5fdd4dabcbbf0c6a36192172ec`。**1/1 通过，20.2 秒，零重试。** 无源码修改、无发布。

测试通过真实产品入口创建个人板，上传 48×48 蓝底黄色方块合成图，保存人物 `合成林安`。随后在“准备常用表达”中输入 `合成林安想喝水`，匹配并审阅后保存一条收藏；未直接写最终草稿或收藏存储。

打开收藏全句，先确认私人快照可见且可解码。返回原生 CBoard 图库，解锁后从“图板”菜单进入个人板，选择源人物卡执行删除：第一次取消，源卡与收藏均保留；第二次确认，源卡消失，收藏规范仓库状态完全不变。

关闭整个隔离浏览器，再用同一隔离资料启动新的浏览器 PID，并从 launch 即启用 offline。个人图片管理的原人物选项已无源 ID，证明源图库删除在重开后仍生效；既有收藏仍可见，保存的 personId、图片 data URI、标签与图片序列保持。主动查看收藏时没有自动播报，私人图像再次 decode 成功，实际 RGBA 哈希与删除前相同。

| 断言 | 结果 |
|---|---|
| 源人物 ID | `device_private_custom_curated_public_1J-rApa414` |
| 源个人板 ID | `device_private_board_dqnDLJKvt` |
| 源删除取消 | 原卡仍可见，收藏状态不变 |
| 源删除确认 | 原卡 UI 消失，收藏状态不变 |
| 独立离线重开 | 原人物选项仍不存在，收藏仍存在 |
| 收藏私人图片 decode | 48×48，data URI，complete=true |
| 删除前后 RGBA SHA-256 | `30382c51f5c5d47e0b431660fa7084c24e7f7b85570cd2fd92a249c0e62405ed`，一致 |
| 人物身份与原图片快照 | personId、label、image 等字段逐项一致 |
| 自动 TTS / 模型请求 | 0 / 0 |

本轮只覆盖一条常用语收藏中的私人图片引用。没有声称已覆盖历史记录、未完成草稿引用、所有图库删除类型或手机真机。收藏中其他公共图在离线浏览器中也实际 decode；其普通 HTTP 图片 URL 由本机离线缓存路径支持，不应把 request 事件当作联网成功。

浏览器 PID 94696 → 14676，均确认退出。隔离 profile 已删除，`.profiles` 剩余 0，4209 监听 0。请求事件总数 204，其中 3 个本机 API 被阻断；外部来源 0、modelAttempt 0、私密/AI/计费违规 0、pageError 0。边界是隔离浏览器路由与 offline launch，不是 OS 全局防火墙证明。

证据：

- `local-core-source-deletion-source-deletion-v2.json`：完整记录、保存前后收藏、人物快照、decode、哈希、PID、网络与清理。
- `source-deletion-run-v2-01.log`、`browser-report-source-deletion-v2.json`：1 passed，零重试。
- `browser-artifacts-source-deletion-v2/`：源卡删除后的图板和离线重开的收藏截图。
- `acceptance-summary-source-deletion-v2.json`：机器摘要。
