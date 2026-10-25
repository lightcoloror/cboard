# 图语家测试留存与按改动回归

整理日期：2026-10-25（Asia/Shanghai）；工具：Codex，精确运行模型未独立核验。

本包保存 2026-10-20 至 23 日七批测试的脚本、历史结果和修复经验。历史结果不代表当前工作区或所有设备已经通过。发布和清理以远端验证回执为准，准备状态不授权删除。

## 下次从这里开始

1. 阅读 `retention-index.json` 和下面的测试矩阵。先确定改动影响范围，不从头重新调研。
2. 查看对应批次的 Markdown 总结和最终 summary。保留失败证据以解释测试工具适配问题；不要用早期失败轮次覆盖最终结论，也不要将多轮通过数量相加。
3. 在隔离工作目录重建测试，保留已有 Playwright/浏览器下载缓存。所有浏览器配置必须新建，不能复用真实用户配置。
4. 修改相关代码后重跑对应测试；历史结果只能证明历史版本。报告记录代码 commit、dirty 文件指纹、构建哈希、运行时版本和未覆盖项。

## 历史测试矩阵

| 改动范围 | 历史证据入口（evidence 下） | 需要回归的场景 |
|---|---|---|
| 沟通草稿及离线重开 | tuyujia-expression-draft-20261020 | 关闭浏览器独立进程重开、草稿恢复、恢复不自动播报/请求模型 |
| 收藏及持久保存 | tuyujia-favorite-durable-20261021 | 保存失败不报成功、重试不重复、切档案/迟到结果 |
| 图片身份、缓存、解码 | tuyujia-image-reliability-20261021 | 同名人物身份、图片字节/像素、离线解码 |
| 接收端草稿和建议 | tuyujia-receiver-durable-20261021 | 接收草稿重开、建议状态、离线图片 |
| 现场布局与交互 | tuyujia-onsite-audit-20261022；tuyujia-targeted-acceptance-20261023 | 对应宽度/大字号、删除确认、取消、连续撤销 |
| 图库可靠保存 | tuyujia-completion-acceptance-20261023/core | 写失败、静默未写、回执丢失、双击与同 ID 重试 |
| WebKit 原站停止恢复 | tuyujia-completion-acceptance-20261023/webkit/v2-summary.json | Service Worker 控制、原站关闭、同页/新页/新进程恢复、照片 decode |

## 已知结论与边界

- 10 月 23 日 WebKit v2 使用 Playwright 1.62.1、WebKit 26.5 revision 2336；最终一项通过、零失败。通过范围是关闭自有原站后的恢复，不是真机断网、OS 强杀或 iOS Safari。
- 193208 轮遗漏引导层异步出现的等待；193448 轮状态选择器太宽，匹配了新增的保存中状态。这两轮是测试适配失败，不能作为产品离线失败结论。保留对应失败与修复资料。
- Windows WebKit 的 `context.setOffline(true)` 旧模拟行为不能替代原站停止测试；不要重新采用已证实有问题的旧路径。
- 合成照片和 TTS 替身不证明真实相册、扬声器、系统大字号、真实登录或付费模型可用。
- 10 月 23 日报告列出的真机、切档案/迟到竞争等未覆盖项，不能因为后续修改就自动视为通过。后续 24 日结果需单独关联对应代码。

## 代码版本与复现

10 月 23 日 Web gallery-durable-v2 的源指纹为 `8e12c2e2ced2c0dae5e846e773498d67bfc7087086f18f46b3c5b490a05f4513`，构建指纹为 `a71840f41b8953ad24a06873eedbbe07d8e6bc5fdd4dabcbbf0c6a36192172ec`。相关源码于 24 日提交 `f32722437983c4a2831694c10420befc9174ae88`；该提交是后续保存点，不能未经指纹核验宣称与历史构建逐字节相同。

归档脚本保留原来的 outputs/<批次> 相对布局。`<WORKSPACE>` 和 `<USER_HOME>` 是脱敏路径占位符，执行前需映射到自己的隔离工作区。脚本依赖路径中的 `fork-cboard/cboard` 指向选定源码 checkout。先检查脚本的 origin/端口，默认只运行本地合成测试；生产地址测试及部署脚本不属于自动重建动作。

在 cboard 仓库根目录运行（把两个路径替换为本机路径；workspace 必须尚不存在）：

```powershell
python docs/test-retention-20261025/rehydrate.py --workspace D:/test-replay/new-run --cboard D:/code/cboard
node docs/test-retention-20261025/profile-rebuild-smoke.cjs D:/test-replay/new-run
```

重建命令复用已安装的 Playwright，既不安装依赖也不下载浏览器。Chrome 冒烟使用本机 Chrome 和 127.0.0.1:4197；端口被占用即失败，不关闭别人的服务。2026-10-25 已实际验证：全新合成配置、两个不同浏览器进程、关闭重开后 localStorage 值一致、进程退出后删除冒烟自有配置。详见 `rebuild-smoke.json`。这不是产品测试全套通过，也未重新验证 WebKit。

## 留存策略

保留：脚本、结果摘要、必要失败原因、版本/指纹、合成数据生成方式、经审核的必要截图。保留下载缓存，避免重复流量。

清理：只有远端留存核验通过，且配置有合成归属标记、没有活动进程、文件未漂移时，才删除对应临时配置。未匹配报告的配置不能伪造测试结论，需记录为未归档结果并单独核实。

本包不含完整浏览器 profile、Cookie、真实用户图片、服务端凭据或部署配置。原始文件未修改；`file-manifest.json` 同时保留原始及脱敏副本 SHA-256。
