import {
  MAX_ANONYMOUS_ACCOUNT_MERGE_PROMPTS,
  deferAnonymousAccountMerge,
  getAnonymousAccountMergeStatus,
  normalizeCommunicationAccountIdentity,
  retireAnonymousAccountIdentity
} from './accountIdentity';

describe('communication account identity', () => {
  test('binds account links to the canonical anonymous user id', () => {
    const state = normalizeCommunicationAccountIdentity(
      {
        anonymousUserId: 'old-user',
        accountLinks: [
          {
            accountUserId: 'account-1',
            status: 'retired',
            retiredAt: 10,
            updatedAt: 10
          }
        ]
      },
      { anonymousUserId: 'current-user' }
    );

    expect(state).toEqual({
      version: 1,
      anonymousUserId: 'current-user',
      accountLinks: []
    });
  });

  test('stops automatic prompts after three explicit deferrals', () => {
    let state = normalizeCommunicationAccountIdentity(null, {
      anonymousUserId: 'anonymous-1'
    });

    for (let index = 1; index <= 3; index += 1) {
      state = deferAnonymousAccountMerge(state, 'account-1', {
        now: index
      });
    }

    expect(getAnonymousAccountMergeStatus(state, 'account-1')).toEqual(
      expect.objectContaining({
        status: 'deferred',
        promptCount: MAX_ANONYMOUS_ACCOUNT_MERGE_PROMPTS,
        shouldPrompt: false
      })
    );
  });

  test('retires one account link without changing the anonymous identity', () => {
    const deferred = deferAnonymousAccountMerge(
      normalizeCommunicationAccountIdentity(null, {
        anonymousUserId: 'anonymous-1'
      }),
      'account-1',
      { now: 10 }
    );
    const retired = retireAnonymousAccountIdentity(deferred, 'account-1', {
      now: 20
    });

    expect(getAnonymousAccountMergeStatus(retired, 'account-1')).toEqual({
      anonymousUserId: 'anonymous-1',
      accountUserId: 'account-1',
      status: 'retired',
      promptCount: 1,
      retiredAt: 20,
      shouldPrompt: false
    });
    expect(
      getAnonymousAccountMergeStatus(retired, 'account-2').shouldPrompt
    ).toBe(true);
  });
});
