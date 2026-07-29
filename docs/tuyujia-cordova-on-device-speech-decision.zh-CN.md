# 图语家 Cordova 设备内语音识别接入决策

- 执行工具 / 模型：Codex（GPT-5）
- 记录时间：2026-07-22 06:51:01

## 变动 1：复用独立 Cordova 插件 fork

- **意图：** 让已经进入 CBoard Web fork 的图语家接收端在 Android/iOS 壳中可以选择系统设备内语音识别，不重新实现录音、权限和原生识别引擎。
- **决策：** 复用本地 `cboard-speech-recognition`（上游为 MIT 许可的 `pbakondy/cordova-plugin-speechrecognition`），由插件提供能力检测、普通识别、强制设备内识别和明确错误。
- **理由：** 上游已覆盖 Cordova JS、Android/iOS 权限、麦克风和结果回调；补现代设备内 API 比引入 Vosk/sherpa 模型更小，也不增加 42–300 MB 级模型资源。
- **证据：** 插件 Node 测试 4/4、package 约 14.2 KB；Android 生成平台已出现 RecognitionService query、设备内工厂和 destroy，Electron 生成层有插件桥接。
- **生效范围：** CBoard Cordova Android/iOS 接收端；普通浏览器、Electron、微信 WechatSI 和服务端方言 ASR 保持独立。

## 变动 2：建立中性平台选择 hook

- **意图：** 让接收端 UI 继续只依赖一个语音状态契约，不把 Cordova 全局对象散落到组件。
- **决策：** 新增 `useCommunicationSpeechRecognition`，始终调用浏览器和 Cordova 两个 hook，但只在 Android/iOS 且插件方法完整时选择原生端口，并禁用浏览器端口；Electron 和普通 Web 继续使用现有 Web Speech。
- **理由：** 稳定 hook 调用顺序符合 React 规则，平台判断集中在 adapter 层；不搬运原生 UI，也不改变文字、分词和图文匹配后的人工复核管线。
- **证据：** Cordova adapter 测试覆盖平台过滤、结果归一化、设备内启动、设备内不可用不静默联网，以及普通服务 false / 设备内服务 true 的竞态；接收面板定向 52/52、CBoard 全量 1,227/1,227。
- **生效范围：** `CommunicationSupportPanel` 的语音输入来源选择；最终识别文字和分词仍可人工修改。

## 变动 3：本机模式不可用时禁止在线降级

- **意图：** 防止界面显示“优先在本机识别”时，患者语音实际被普通在线 recognizer 处理。
- **决策：** 只有设备内状态为 available 且语言一致时才发送 `onDevice: true`；插件或语言不可用时在输入区显示明确错误，不调用普通识别。普通模式仍可由用户单独选择。
- **理由：** Android 官方说明普通 recognizer 可能上传音频，`EXTRA_PREFER_OFFLINE` 也只是可被忽略的提示；隐私模式必须以专用设备内 recognizer 或 Apple 强制字段为证据。
- **证据：** CBoard hook 测试和插件原生静态契约；生产 bundle 包含 `isOnDeviceRecognitionAvailable`、`onDevice` 和 Cordova 错误边界。
- **生效范围：** 显式设备内普通话识别；不改变粤语服务端音频识别同意门或在线普通识别。

## 变动 4：记录构建与运行证据边界

- **意图：** 不把 Java/ObjC 源码进入平台目录误报为原生真机已经可用。
- **决策：** 以测试、CBoard build、Cordova Android 平台生成、Electron 安装包/ASAR 静态检查分层记录；Android SDK/Xcode 和真机断网仍是独立门。
- **理由：** 当前 Windows 环境没有 Android SDK、Gradle 或 Xcode，并且 ccboard 现有插件版本与 Cordova Android 10.1.2 有冲突，不能伪造原生绿色结论。
- **证据：** CBoard production build 成功，主 bundle gzip 仅增加约 822 B；Electron portable/NSIS 构建成功，ASAR 中有 CBoard 主入口和插件注册；`cordova requirements android` 明确报告 SDK/Gradle 缺失。
- **生效范围：** 当前工程完成度和后续验收顺序；不声称 Android/iOS 编译、安装、麦克风权限、语言包或真实断网已经通过。
