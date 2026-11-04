const ONBOARDING_STEPS = [
  {
    id: 'express',
    title: '患者表达',
    description: '点图片表达需要或意见，误触可以撤销；由本人选择句子后朗读或收藏。'
  },
  {
    id: 'receive',
    title: '接收理解',
    description: '保留对方原话与图片；不懂时再听、分段看或换个说法，再核对理解。'
  },
  {
    id: 'offline',
    title: '离线优先',
    description: '本机已保存的图卡、常用语和草稿可离线使用；语音取决于当前系统，在线补图和 AI 需要联网。'
  }
];

export const COMMUNICATION_ONBOARDING_CONTENT = Object.freeze({
  eyebrow: '双向沟通 · 第一次使用',
  title: '图片帮助双方理解',
  steps: Object.freeze(ONBOARDING_STEPS.map(step => Object.freeze({ ...step })))
});
