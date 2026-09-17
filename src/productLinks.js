// Reuse CBoard's account/settings UI, but never send care users to upstream policies.
export function getProductLinks(env = process.env) {
  const care = env.REACT_APP_CARE_COLLABORATION === 'true';
  const https = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !(care && /(^|\.)cboard\.io$/i.test(url.hostname))
        ? url.href
        : null;
    } catch (_) {
      return null;
    }
  };
  const terms = https(
    env.REACT_APP_TERMS_URL || (!care && 'https://www.cboard.io/terms-of-use/')
  );
  const privacy = https(
    env.REACT_APP_PRIVACY_URL || (!care && 'https://www.cboard.io/privacy/')
  );
  const email = (env.REACT_APP_SUPPORT_EMAIL || '').trim();
  const validEmail =
    /^[a-zA-Z0-9.!#$%&'*+/=^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
      email
    ) && !(care && /@(?:[^@]*\.)?cboard\.io$/i.test(email));
  const support =
    https(env.REACT_APP_SUPPORT_URL) ||
    (validEmail ? `mailto:${email}` : null) ||
    (!care ? 'mailto:support@cboard.io?subject=Cboard feedback' : null);
  return {
    terms,
    privacy,
    support,
    registrationReady: Boolean(terms && privacy)
  };
}
