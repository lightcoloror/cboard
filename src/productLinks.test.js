import { getProductLinks } from './productLinks';

const care = { REACT_APP_CARE_COLLABORATION: 'true' };
test('care cannot borrow upstream policies or support when configuration is absent', () => {
  expect(getProductLinks(care)).toEqual({
    terms: null,
    privacy: null,
    support: null,
    registrationReady: false
  });
  expect(getProductLinks({}).registrationReady).toBe(true);
});
test.each([
  'http://example.org/policy',
  'javascript:alert(1)',
  'https://user:secret@example.org/policy',
  'https://www.cboard.io/privacy/'
])('rejects unsuitable product policy %s', value => {
  expect(
    getProductLinks({ ...care, REACT_APP_TERMS_URL: value }).terms
  ).toBeNull();
});
test('configured product pages enable registration without adding patient or account data', () => {
  const links = getProductLinks({
    ...care,
    REACT_APP_TERMS_URL: 'https://example.org/terms',
    REACT_APP_PRIVACY_URL: 'https://example.org/privacy',
    REACT_APP_SUPPORT_URL: 'https://example.org/support'
  });
  expect(links.registrationReady).toBe(true);
  expect(links.support).toBe('https://example.org/support');
});
test('support accepts a product mailbox but rejects upstream or injected mail headers', () => {
  expect(
    getProductLinks({ ...care, REACT_APP_SUPPORT_EMAIL: 'help@example.org' })
      .support
  ).toBe('mailto:help@example.org');
  for (const email of [
    'support@cboard.io',
    'help@example.org?bcc=other@example.org',
    'help@example.org\r\nBcc:other@example.org'
  ]) {
    expect(
      getProductLinks({ ...care, REACT_APP_SUPPORT_EMAIL: email }).support
    ).toBeNull();
  }
});
