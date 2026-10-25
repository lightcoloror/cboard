# 新上传个人图片关闭重开验收

日期：2026-10-23T16:31:00.803055+08:00。工具：Codex；精确运行模型未独立核实。

结果：当前候选 `dist-local-20261022-onsite-ui-repair-v1` 在微信开发者工具内通过本次限定验收。

- 通过真实产品入口创建板块、切换人物卡、选图、手工填写“合成顾明”并确认保存。仅文件选择器返回合成几何图；未直接注入最终图库。
- 产品调用实际 saveFile，产生本机持久 JPEG。真实文件读取为 1,871 字节，原生 getImageInfo 解码为 64×64。
- 捕获原生 native-window-closed，重新打开返回 newopen，旧运行时哨兵消失。重开后图库、完整人物 TileDTO、图片字节 SHA256 和解码结果均一致。
- 恢复后观察 24.2 秒，网络请求和自动播报均为 0。
- 原选择恢复校验通过，清理 15 个合成存储键、7 个测试文件及专属图库目录，恢复 mock 并关闭项目。无源码修改、构建、部署、付费 AI 或真实私人照片。

关键证据：`07-native-save-proof.json`、`11-closed.json`、`13-reopen-proof.json`、`14-quiet.json`、`15-restored-visible.jpg`、`16-cleanup.json`。

## 验收解释与边界

断网通过 wx.request/uploadFile/downloadFile 故障注入实现，未断开系统网络；原生读文件与解码未替代。本结论不等于手机真机、真实相册选择器或手机进程被杀后的验证。计数器在新运行时绑定后、进入患者页和恢复前安装，启动初期不在计数窗口内。

复用 fixture 明确开启 15 秒候选自动播报：新点图后、关闭前观察到 1 次被 mock 的播放。这不是恢复后自动播报；恢复及其观察窗口播放为 0，不应把整个测试概括为从未触发播放。

首次严格断言要求 personId，因直接选择 TileDTO 不含此可选字段而失败。只读溯源确认：`pictogramMetadataSuggestion.js:111` 创建原始 TileDTO；`ExpressionWorkspace.tsx:514` 直接选择它；`symbolMatching.js:758` 仅在文本匹配结果附加 personId；`communicationAi.js:86-96` 的人物标记回退使用 item.id。随后按完整 TileDTO 精确相等核验身份（id、boardId、全名、people 分类、device-private 来源及图片），无需改产品。没有发现人物错配或持久化缺陷。
