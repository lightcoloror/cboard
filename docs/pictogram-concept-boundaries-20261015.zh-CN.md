# 图语家：规范概念进入分词词表与本地洗手液复用

2026-10-15 11:36:05（Asia/Shanghai）｜Codex（具体运行模型未独立核实）

- **意图**：避免停车场、洗衣机、电话卡等完整物品被拆成片段后抢配图；优先复用本地准确图片。
- **决策**：将现有 pictogramSemantics 规范概念名接入既有中文分词词表，补齐 8 个已复现的完整物品保护词；不新建分词器。接回仓库原有 Mulberry liquid_soap.svg 到默认个人卫生图板，并与原 soap.svg 的肥皂块分别配置别名及排除词。小程序沿用既有素材生成器。
- **理由**：词义层和分词层此前独立维护，停车场仍被截成停车/场；图库文件存在也不代表图卡已进入默认匹配范围。未命中完整词时应保留原词补图，不能用部分相关图片凑数。
- **证据**：`D:/used-by-codex/outputs/tuyujia-concept-boundaries-20261015/修复与验收.md`。31 条定向词句双引擎共 62 次；25 条切分改善，无源文字丢失。Web 844 项、小程序 115 项通过，类型与生成契约通过。813 张既有小程序图片字节不变，仅新增 1 张。
- **生效范围**：共享核心、Web/小程序新版默认图板和内置图库、本地缺图解决及离线恢复。不迁移或改写用户手动确认和历史，不自动部署。

源码真源：`src/common/communicationSupport/pictogramSemantics.js`、`chineseLexicon.js`、`cboardConceptProfiles.js`、`src/api/boards.json`、`src/translations/zh-CN.aac-review.json`。API helper 由既有同步脚本生成，禁止独立改写生成副本。
