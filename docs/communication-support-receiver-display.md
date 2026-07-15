# Communication Support 接收端全屏展示修复

- 状态：实现与验证完成；提交状态以 Git 历史为准
- 更新时间：`2026-07-16 00:11:32`
- 执行工具 / 模型：`Codex (GPT-5)`
- 问题来源：用户手动验收截图，接收端图符在原 Board 页面上失控放大并相互堆叠

## 变动 1：使用 CBoard 标准全屏界面

- 意图：点击“全屏展示”后进入清晰、独立的接收展示界面，不再看到原 Board 和编辑控件混在图片后方。
- 决策：把接收端原生 Material UI `Dialog` 替换为 CBoard 既有 `FullScreenDialog`，使用不透明内容背景、顶部返回按钮和标题，不在患者视图提供照护者操作。
- 理由：复用 CBoard 的全屏导航与主题能力，比另开浏览器窗口更稳定，也能继续适配 PWA、Electron、Cordova 和移动端壳。
- 证据：新增 `ReceiverDisplay.component.js`；组件测试验证两个匹配图符被渲染在专用 `CommunicationSupportPanel__displayScreen` 中。
- 生效范围：仅照护者接收闭环的“全屏展示”；换图对话框、患者表达页签和 CBoard 其他对话框保持不变。

## 变动 2：限制接收端图符定位与尺寸

- 意图：杜绝 SVG 脱离卡片后覆盖整页，并让桌面和窄屏都保持可读网格。
- 决策：为匹配预览建立 `88 x 88` 定位容器；为换图选项和全屏卡片覆盖通用 `.Symbol` 的绝对定位；全屏图符高度限制在 `240-420px`，窄屏限制在 `160-260px`。
- 理由：CBoard 通用 `.Symbol` 默认使用 `position: absolute; width: 100%; height: 100%`，它要求父级 Tile 提供固定定位上下文；接收端此前没有满足这个前提。
- 证据：`CommunicationSupportPanel.css` 现在分别约束 match preview、swap option 和 display item；开发服务器热编译连续成功且无类型问题。
- 生效范围：Communication Support 接收端预览、换图和全屏展示；不修改 CBoard 通用 Symbol 样式，避免影响原图板。

## 变动 3：患者全屏视图不显示照护者操作

- 意图：让患者只看到需要理解的图片序列，不暴露发送、换图等照护者操作。
- 决策：移除全屏顶部的“发送到输出栏”按钮；发送动作继续保留在进入全屏前的照护者复核区，全屏仅保留 CBoard 标准返回按钮。
- 理由：需求文档明确要求“全屏展示时患者不看到编辑控件”，并要求患者看到清晰图片序列而不是调试界面。
- 证据：`ReceiverDisplay.component.test.js` 断言 `FullScreenDialog` 不再接收 `buttons`；接收端复核区原“发送到输出栏”按钮及闭环测试保持不变。
- 生效范围：只影响接收端患者全屏展示；照护者复核、发送、换图和历史记录不变。

## 变动 4：统一图符边界并补齐窄屏防溢出

- 意图：防止未来调整组件结构时再次出现图符脱离卡片、横向撑破页面或小屏图片过度拥挤。
- 决策：三处 `Symbol` 都增加 `CommunicationSupportPanel__symbol` 及场景变体类；换图卡和展示卡增加裁切边界；小于 600px 时主内容切为单列，小于 420px 时全屏图片切为单列。
- 理由：仅依赖父级选择器容易在 DOM 重构后失效；移动端可用宽度还会被 Board 和面板 padding 进一步压缩，需要显式的最小宽度与换行规则。
- 证据：接收端组件测试覆盖预览、换图和全屏三类受限样式标记；CSS 为长文本、匹配操作和响应式网格提供边界。
- 生效范围：只影响 Communication Support 接收端及其窄屏布局；不修改 CBoard 通用 `Symbol`、Tile 或其他全屏对话框。

## 验证

- 定向测试：`2 suites / 2 tests` 通过。
- 双向沟通回归：`25 suites / 72 tests / 3 snapshots` 通过。
- ESLint：新增及修改 JS 文件通过。
- Prettier：组件、测试和 CSS 均通过。
- `git diff --check`：通过，仅有既有 Windows LF/CRLF 提示。
- 开发服务器：热编译 `Compiled successfully`、`No issues found`。
- HTTP：首页 `http://127.0.0.1:3000/` 返回 `200`。
- 标准 `npm run build` 仍被 Windows 文件锁阻止清理 `build/.well-known/assetlinks.json`，未进入编译。
- 等价生产编译使用独立 `BUILD_PATH` 并关闭已单独验证的 ESLint webpack 插件，结果 `Compiled successfully`；产物只写入不进 PR 的 `.codex-logs/build-verify-no-eslint`。

## 手动视觉验收

由于 Codex 内置 Browser Use 在加载该本地页面时会导致桌面应用闪退，本轮不再自动打开页面。请在外部 Edge/Chrome 刷新首页，输入“我想吃苹果”生成图片序列，再点击“全屏展示”；预期结果是进入不透明的独立全屏界面，每个词图在自己的卡片内显示，原 Board 不可见。

## 变动 5：重复图符保持独立

- 意图：支持“水 / 水”等重复图符序列在全屏界面中稳定显示为两个独立项目。
- 决策：全屏项目 key 使用图符身份与序列位置组合，不再只使用可能重复的图符 ID。
- 理由：同一图符可在一句表达里重复出现；重复 React key 会造成警告，并可能在更新时错误复用节点。
- 证据：ReceiverDisplay.component.test.js 新增两个相同 water 图符，断言得到 water-0 与 water-1 两个唯一 key。
- 生效范围：仅接收端全屏序列的 React reconciliation；图符内容、顺序和 CBoard Tile ID 不变。

## 推送前验证

- 复核时间：2026-07-16 00:11:32
- 执行工具 / 模型：Codex (GPT-5)
- 聚合回归：31 suites / 114 tests / 3 snapshots 通过。
- 拟提交源码范围 ESLint 与 git diff --check 通过。
