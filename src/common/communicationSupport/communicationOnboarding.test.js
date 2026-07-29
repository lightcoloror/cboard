import { COMMUNICATION_ONBOARDING_CONTENT } from './communicationOnboarding';

describe('communication onboarding content', () => {
  test('keeps the cross-platform introduction neutral and complete', () => {
    expect(COMMUNICATION_ONBOARDING_CONTENT).toEqual({
      eyebrow: '双向沟通 · 第一次使用',
      title: '图片帮助双方理解',
      steps: [
        expect.objectContaining({ id: 'express', title: '患者表达' }),
        expect.objectContaining({ id: 'receive', title: '接收理解' }),
        expect.objectContaining({ id: 'offline', title: '离线优先' })
      ]
    });
    expect(
      COMMUNICATION_ONBOARDING_CONTENT.steps.every(
        step => step.description.length > 0
      )
    ).toBe(true);
  });
});
