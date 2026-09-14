import { runtime } from './Care';
import { getStore } from '../../store';
jest.mock('../../store', () => ({ getStore: jest.fn() }));
jest.mock('../../constants', () => ({ API_URL: 'http://synthetic.invalid' }));
jest.mock('../../common/communicationSupport/CarePanel', () => () => null);
jest.mock('../Account/Login/Login.actions', () => ({ logout: jest.fn() }));
jest.mock('../../common/communicationSupport/localData', () => ({
  configureCareLocalAccount: jest.fn()
}));
let account;
beforeEach(() => {
  account = 'first';
  localStorage.clear();
  getStore.mockReturnValue({
    getState: () => ({
      app: { userData: { id: account, authToken: 'synthetic' } }
    })
  });
});
afterEach(() => jest.restoreAllMocks());
test.each([false, true])(
  'settings do not publish an old selection after account changes (offline=%s)',
  async offline => {
    const event = jest.spyOn(window, 'dispatchEvent');
    jest.spyOn(runtime, 'request').mockImplementation(async () => {
      account = 'second';
      if (offline) throw new Error('offline');
      return {};
    });
    await expect(
      runtime.selectProfile({ id: 'patient', familyId: 'family' })
    ).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem('care-selection-v1:first')).toBeNull();
    expect(localStorage.getItem('care-selection-v1:second')).toBeNull();
    expect(event).not.toHaveBeenCalled();
  }
);
test('unchanged accounts retain offline selection support', async () => {
  jest.spyOn(runtime, 'request').mockRejectedValue(new Error('offline'));
  const profile = { id: 'patient', familyId: 'family' };
  await runtime.selectProfile(profile);
  expect(JSON.parse(localStorage.getItem('care-selection-v1:first'))).toEqual(
    profile
  );
});
