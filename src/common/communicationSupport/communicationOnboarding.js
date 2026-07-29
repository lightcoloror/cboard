const ONBOARDING_STEPS = [
  {
    id: 'express',
    title: '患者表达',
    description: '点图片组成表达，选择一句话后朗读或收藏。'
  },
  {
    id: 'receive',
    title: '接收理解',
    description: '照护者说话或输入文字，确认分词与图片后全屏展示。'
  },
  {
    id: 'offline',
    title: '离线优先',
    description: '默认板、分词、图片和历史都在本机；联网与 AI 只做增强。'
  }
];

export const COMMUNICATION_ONBOARDING_CONTENT = Object.freeze({
  eyebrow: '双向沟通 · 第一次使用',
  title: '图片帮助双方理解',
  steps: Object.freeze(ONBOARDING_STEPS.map(step => Object.freeze({ ...step })))
});
