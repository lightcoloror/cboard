# 分词评测接入

2026-10-01 | Codex（GPT-6，具体变体未由运行时工具确认）

这组脚本只做离线格式适配，复用 CBoard `segmentChineseCommunicationText`、`matchTextToCommunicationTiles`、原评测脚本及 UD 官方评分器。没有添加新分词引擎。两个评测目标分开报告：

- 通用测试：UD Chinese GSDSimp 的 test 集，500 句百科文本，CC BY-SA 4.0。用官方 UD `udeval.py` 评分，报告词跨度 P/R/F1。标点计入评分；Unicode Zs 空格按官方规则排除。必须先检查逐句原文完整保留。依存和词性列只是合法格式占位，不报告相关指标。
- AAC 工程测试：原 20 句、扩展回归 40 句和冻结候选 20 句。报告内部切分边界平均 F1、原文保留及未匹配文字，不能同 UD 词跨度 F1 横向比较。80 句均为合成资料，不是患者样本或临床标准答案。

冻结候选附 SHA-256 清单；未经重新版本化不能修改后继续沿用旧基线。它在本次会话由助手编写且已查看结果，因此**不是独立盲测**。后续独立验收需要另行编写、复核并隔离维护。

## 运行

在 CBoard 根目录执行；官方数据和评分器放在仓库外。克隆后先核对 LICENSE、来源和 commit；报告会保存实际 commit 与文件校验值。

```text
node scripts/benchmarkCommunicationSegmentation.cjs ../../outputs/segmentation-benchmarks-20261001/UD_Chinese-GSDSimp ../../outputs/segmentation-benchmarks-20261001/ud-tools ../../outputs/segmentation-benchmarks-20261001/results
node scripts/evaluateAacRegression.cjs ../../outputs/segmentation-benchmarks-20261001/results/aac-report.json
node --test scripts/benchmarkCommunicationSegmentation.test.cjs scripts/evaluateAacRegression.test.cjs scripts/evaluateCommunicationSegmentation.test.cjs
```

UD 官方评分器直接通过文件加载，避免其整个 validator 包的额外依赖；代码未复制、修改或打包进产品。入口先运行官方 4 个对齐自测。CoNLL-U 适配器不支持多词范围或空节点，遇到即报错，不能跳过后假报全量覆盖；本次 test 集全部 500 句兼容。Python 可用第四个位置参数指定。

公共语料及新增 AAC 集没有在线请求入口，`--live` 被拒绝。原 `evaluateCommunicationSegmentation.cjs` 的在线入口仍仅使用原有 20 句受控合成资料；额度、认证及上限不变。

## 授权与用途

- [UD GSDSimp](https://github.com/UniversalDependencies/UD_Chinese-GSDSimp)：数据 CC BY-SA 4.0，来自繁体 GSD 的简体转换及修正；保持来源与版本记录。本轮不训练、不把语料加入产品或提交到代码仓库。
- [UD 官方工具](https://github.com/UniversalDependencies/tools)：`udtools/src/udtools/udeval.py` 文件标明 MPL 2.0；仓库其他代码另有许可，不能把单文件许可推定为全仓库许可。
- [SIGHAN 2005 原始包](http://sighan.cs.uchicago.edu/bakeoff2005/data/icwb2-data.zip)：README 将语料用途限定为当次比赛，其他用途需向原提供方申请。已下载的 PKU/MSR 仅用于许可核查并隔离保留，**没有评测或训练**。第三方镜像公开可下载不能替代原提供方授权。

## 意图 / 决策 / 理由 / 证据 / 生效范围

| 意图               | 决策                                               | 理由                                              | 证据                                                          | 生效范围                               |
| ------------------ | -------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| 建立可复现通用基线 | 接入官方 UD 测试集与官方评分器，保留原生 Intl 基线 | 避免自写评分算法；单独记录 AAC 与通用分词标注差异 | 500 句完整输入、官方自测、commit/哈希与运行时记录             | 开发评测脚本，不改变产品规则           |
| 检查沟通关键场景   | 新增 40 句回归、20 句冻结候选，复用已有匹配器      | 通用百科评分不能代表否定、重复、照护和缺词安全    | 80 句源文保留、6 组危险同义替换拒绝；所有映射仍需人工语义复核 | 本地合成工程测试，不代表真机或临床验收 |
| 防止测试集失效     | 冻结清单校验，并标明候选非盲测                     | 不能用已观察、调优过的样本证明独立泛化            | 篡改内容拒绝测试与冻结 SHA-256                                | 新冻结候选                             |
| 控制资料与在线范围 | SIGHAN 暂停语料运行；新脚本仅离线                  | 源许可明确有限；公开样本不应意外进入付费 AI       | 许可原文、无网络调用实现、原 live 测试保留                    | 本轮评测；未来授权另行核实             |
