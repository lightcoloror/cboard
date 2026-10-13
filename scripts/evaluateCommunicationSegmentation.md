# 分词对照评测

此工具复用当前 CBoard 分词、匹配器、词典、默认图板和 AI 响应校验，不新增 NLP 依赖。运行环境为 Node.js 22；从 CBoard 仓库根目录执行。

## 默认离线

```text
node scripts/evaluateCommunicationSegmentation.cjs --out segmentation-evaluation.json
node --test scripts/evaluateCommunicationSegmentation.test.cjs
```

默认不会发出网络请求。20 条手写合成语料覆盖否定、重复、照护短语、语义混淆、标点和 Unicode。参考分词仅用于工程比较，不是临床标注。报告分别记录原文是否完整保留、词边界差异、未匹配词、原词与图卡标签、耗时。

图卡数量多、边界 F1 高都不能证明图片符合原意。尤其应人工检查双重否定和动作/物品混淆；报告中的 `requiresHumanSemanticReview` 始终为 true。报告不会修改图库、词典或患者资料。

## 可选的认证 API 对照

仅在隔离测试 API 已配置真实模型、合成测试账号及额度授权时，通过进程环境提供以下配置。不要将值写入命令行参数、报告或 Git：

- `CBOARD_API_BASE_URL`：现有 API 的根地址；公网仅支持 HTTPS，本机回环可使用 HTTP。
- `RESEGMENT_EVAL_TOKEN`：合成测试账号的有效登录令牌。
- `RESEGMENT_EVAL_PROFILE_ID`：账号有权访问的合成档案。
- `RESEGMENT_EVAL_FUNDING_ID`：账号获授权消费的测试额度账户。

```text
node scripts/evaluateCommunicationSegmentation.cjs --live --limit 3 --out segmentation-live-evaluation.json
```

请求使用现有 `/gpt/communication/resegment`、登录和 Care 额度合同；每条请求带独立幂等标识，不直接调用模型 SDK 绕过授权。只发送仓库内合成语料，按顺序运行，首次拒绝、原文错配或网络错误后停止，不自动重试。默认联网样本数为 3，最多 20；联网调用可能消耗测试额度。

缺少配置时输出 blocked，退出码 2；不发网络请求。API 成功仍需结合服务端 provider 配置与额度账本，确认是否实际调用模型及实际费用。报告保留服务端用量请求凭据，但不估算费用、不宣称 API 200 证明真实模型验收。模拟 fetch 测试不属于联网验收。

## 人工分词表示

现有编辑器使用可读的斜线边界，例如 `我 / 不 / 喝水 / "，"`。含字面分隔符、空白、引号或反斜线的原文片段以 JSON 字符串引号表示；例如 `" "` 保留一个空格，`"/"` 保留原文中的斜线。两端共用现有解析器，旧 JSON 数组输入仍兼容。
