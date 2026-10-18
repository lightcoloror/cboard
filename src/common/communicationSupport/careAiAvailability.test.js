import {
  careTextAiEnabled,
  getCareTextAiAvailability
} from './careAiAvailability';

describe('controlled text AI availability', () => {
  const previous = { ...process.env };
  const values = new Map();
  const input = {
    isLogged: true,
    careMode: true,
    accountId: 'a',
    storage: { getItem: key => values.get(key) }
  };
  beforeEach(() => {
    values.clear();
    process.env.REACT_APP_TUYUJIA_CLOUD_TRIAL = 'true';
    delete process.env.REACT_APP_CARE_AI_TRIAL;
  });
  afterEach(() => {
    process.env = { ...previous };
  });
  test('restricted builds default off; only the independent text AI flag enables funding selection', () => {
    expect(careTextAiEnabled()).toBe(false);
    expect(getCareTextAiAvailability(input).message).toContain('尚未开放');
    process.env.REACT_APP_CARE_AI_TRIAL = 'false';
    expect(careTextAiEnabled()).toBe(false);
    process.env.REACT_APP_CARE_AI_TRIAL = 'true';
    expect(careTextAiEnabled()).toBe(true);
  });
  test('requires login, selected profile and explicit funding in order', () => {
    process.env.REACT_APP_CARE_AI_TRIAL = 'true';
    expect(
      getCareTextAiAvailability({ ...input, isLogged: false }).message
    ).toContain('请先登录');
    expect(getCareTextAiAvailability(input).message).toContain('选择患者档案');
    values.set('care-selection-v1:a', JSON.stringify({ id: 'p' }));
    expect(getCareTextAiAvailability(input).message).toContain(
      '选择 AI 额度来源'
    );
    values.set('care-funding-v1:a:p', 'fund-a');
    expect(getCareTextAiAvailability(input).available).toBe(true);
    expect(
      getCareTextAiAvailability({ ...input, accountId: 'b' }).available
    ).toBe(false);
    values.set('care-selection-v1:a', JSON.stringify({ id: 'another' }));
    expect(getCareTextAiAvailability(input).available).toBe(false);
  });
  test.each(['broken json', JSON.stringify({ id: 'p', locked: true })])(
    'fails closed for invalid or locked selection %s',
    selected => {
      process.env.REACT_APP_CARE_AI_TRIAL = 'true';
      values.set('care-selection-v1:a', selected);
      values.set('care-funding-v1:a:p', 'fund-a');
      expect(getCareTextAiAvailability(input).available).toBe(false);
    }
  );
  test('preserves non-care legacy login behavior outside restricted trials', () => {
    delete process.env.REACT_APP_TUYUJIA_CLOUD_TRIAL;
    expect(
      getCareTextAiAvailability({ isLogged: true, careMode: false }).available
    ).toBe(true);
    expect(
      getCareTextAiAvailability({ isLogged: false, careMode: false }).available
    ).toBe(false);
  });
});
