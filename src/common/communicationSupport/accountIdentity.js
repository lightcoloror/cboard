export const COMMUNICATION_ACCOUNT_IDENTITY_VERSION = 1;
export const MAX_ANONYMOUS_ACCOUNT_MERGE_PROMPTS = 3;
const MAX_ACCOUNT_LINKS = 20;

function normalizeText(value, maxLength = 200) {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? Math.floor(timestamp)
    : null;
}

function normalizeAccountLink(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const accountUserId = normalizeText(value.accountUserId);
  if (!accountUserId) return null;
  const retiredAt = normalizeTimestamp(value.retiredAt);
  const status =
    value.status === 'retired' && retiredAt ? 'retired' : 'deferred';
  const promptCount = Math.min(
    MAX_ANONYMOUS_ACCOUNT_MERGE_PROMPTS,
    Math.max(0, Math.floor(Number(value.promptCount) || 0))
  );

  return {
    accountUserId,
    status,
    promptCount,
    retiredAt: status === 'retired' ? retiredAt : null,
    updatedAt: normalizeTimestamp(value.updatedAt) || retiredAt || 1
  };
}

export function normalizeCommunicationAccountIdentity(
  value,
  { anonymousUserId = '' } = {}
) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const storedAnonymousUserId = normalizeText(source.anonymousUserId);
  const canonicalAnonymousUserId =
    normalizeText(anonymousUserId) || storedAnonymousUserId;
  const canReuseLinks =
    !storedAnonymousUserId ||
    storedAnonymousUserId === canonicalAnonymousUserId;
  const linksByAccount = new Map();

  if (canReuseLinks) {
    (Array.isArray(source.accountLinks) ? source.accountLinks : [])
      .map(normalizeAccountLink)
      .filter(Boolean)
      .forEach(link => {
        const existing = linksByAccount.get(link.accountUserId);
        if (
          !existing ||
          link.status === 'retired' ||
          (existing.status !== 'retired' && link.updatedAt > existing.updatedAt)
        ) {
          linksByAccount.set(link.accountUserId, link);
        }
      });
  }

  return {
    version: COMMUNICATION_ACCOUNT_IDENTITY_VERSION,
    anonymousUserId: canonicalAnonymousUserId,
    accountLinks: [...linksByAccount.values()]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_ACCOUNT_LINKS)
  };
}

export function getAnonymousAccountMergeStatus(value, accountUserId) {
  const state = normalizeCommunicationAccountIdentity(value);
  const normalizedAccountUserId = normalizeText(accountUserId);
  const link = state.accountLinks.find(
    item => item.accountUserId === normalizedAccountUserId
  );
  const retired = Boolean(link && link.status === 'retired');
  const promptCount = link ? link.promptCount : 0;

  return {
    anonymousUserId: state.anonymousUserId,
    accountUserId: normalizedAccountUserId,
    status: retired ? 'retired' : link ? 'deferred' : 'unlinked',
    promptCount,
    retiredAt: retired ? link.retiredAt : null,
    shouldPrompt: Boolean(
      normalizedAccountUserId &&
        !retired &&
        promptCount < MAX_ANONYMOUS_ACCOUNT_MERGE_PROMPTS
    )
  };
}

export function deferAnonymousAccountMerge(
  value,
  accountUserId,
  { now = Date.now() } = {}
) {
  const state = normalizeCommunicationAccountIdentity(value);
  const status = getAnonymousAccountMergeStatus(state, accountUserId);
  if (!status.accountUserId) {
    throw new TypeError('Account merge deferral requires an account user id');
  }
  if (status.status === 'retired') return state;

  return normalizeCommunicationAccountIdentity({
    ...state,
    accountLinks: [
      {
        accountUserId: status.accountUserId,
        status: 'deferred',
        promptCount: Math.min(
          MAX_ANONYMOUS_ACCOUNT_MERGE_PROMPTS,
          status.promptCount + 1
        ),
        retiredAt: null,
        updatedAt: now
      },
      ...state.accountLinks.filter(
        link => link.accountUserId !== status.accountUserId
      )
    ]
  });
}

export function retireAnonymousAccountIdentity(
  value,
  accountUserId,
  { now = Date.now() } = {}
) {
  const state = normalizeCommunicationAccountIdentity(value);
  const status = getAnonymousAccountMergeStatus(state, accountUserId);
  if (!status.accountUserId) {
    throw new TypeError(
      'Account identity retirement requires an account user id'
    );
  }
  if (status.status === 'retired') return state;

  return normalizeCommunicationAccountIdentity({
    ...state,
    accountLinks: [
      {
        accountUserId: status.accountUserId,
        status: 'retired',
        promptCount: status.promptCount,
        retiredAt: now,
        updatedAt: now
      },
      ...state.accountLinks.filter(
        link => link.accountUserId !== status.accountUserId
      )
    ]
  });
}
