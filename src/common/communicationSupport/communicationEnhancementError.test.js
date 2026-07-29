import {
  COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES,
  getCommunicationEnhancementLimitScope
} from './communicationEnhancementError';

describe('communicationEnhancementError', () => {
  test('recognizes a monthly quota response without exposing provider text', () => {
    expect(
      getCommunicationEnhancementLimitScope({
        response: {
          status: 429,
          data: {
            error: {
              code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED',
              message: 'provider detail must not be displayed'
            }
          }
        }
      })
    ).toBe(COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.month);
  });

  test('treats the AI token allowance as the same monthly fallback scope', () => {
    expect(
      getCommunicationEnhancementLimitScope({
        response: {
          status: 429,
          data: {
            error: { code: 'COMMUNICATION_AI_TOKEN_QUOTA_EXCEEDED' }
          }
        }
      })
    ).toBe(COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.month);
  });

  test('supports serialized response bodies and treats other 429 errors as transient', () => {
    expect(
      getCommunicationEnhancementLimitScope({
        response: {
          status: 429,
          data: JSON.stringify({
            error: { code: 'COMMUNICATION_MONTHLY_QUOTA_EXCEEDED' }
          })
        }
      })
    ).toBe(COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.month);
    expect(
      getCommunicationEnhancementLimitScope({
        response: { status: 429, data: { error: {} } }
      })
    ).toBe(COMMUNICATION_ENHANCEMENT_LIMIT_SCOPES.minute);
  });

  test('does not classify non-rate-limit failures', () => {
    expect(
      getCommunicationEnhancementLimitScope({
        response: { status: 503, data: {} }
      })
    ).toBe('');
    expect(getCommunicationEnhancementLimitScope(new Error('offline'))).toBe(
      ''
    );
  });
});
