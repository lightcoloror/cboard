import { createCommunicationRepository, COMMUNICATION_STORAGE_KEYS } from './repository';
import { buildExpressionLoopState, buildExpressionHistoryEntry, buildExpressionLoopStateFromSavedPhrase } from './expressionPipeline';
import { buildCommunicationAiSentenceRequest } from './communicationAi';
import { getPrivatePersonRequestIdentity, restorePrivatePersonAiResponse } from './privatePersonAi';
import { createCareAiRequestJournal } from './careAiRequestJournal';
import { createExpressionDraftService, EXPRESSION_DRAFT_STORAGE_KEY,
  attachExpressionDraftRequest, getExpressionDraftRequestContext, hasResumableExpressionDraft } from './expressionDraft';

const tile = (name = '林小明', personId = 'synthetic-a') => ({
  id: 'same-tile', boardId: 'private-synthetic', personId, label: name,
  image: `local-private://${personId}`, attribution: { provider: 'device-private', useScope: 'device-private' }
});
const snapshot = (output = [tile(), tile('林小明', 'synthetic-b'), tile()]) => ({
  pipeline: { ...buildExpressionLoopState(output), candidateSentences: ['林小明和林小明一起回家', '林小明想回家'], selectedIndex: 1 },
  rejected: false, candidateFeedbackEntries: []
});
function fixture() {
  const data = new Map();
  const storage = { getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => { data.set(key, value); return true; } };
  let time = 1000, sequence = 0, scope = 'account-a';
  const repo = createCommunicationRepository({ storage, now: () => time, createId: prefix => `${prefix}_${++sequence}` });
  const make = () => createExpressionDraftService({ repository: repo, now: () => time,
    getScopeKey: () => scope, createId: () => `draft_${++sequence}` });
  return { data, storage, repo, make, tick: () => { time += 31 * 60 * 1000; }, switchScope: () => { scope = 'account-b'; } };
}
function saveWithLostReadbacks(f, service, value) {
  const realSet = f.storage.setItem, realGet = f.storage.getItem;
  let unreadable = 0;
  f.storage.setItem = (key, data) => {
    realSet(key, data);
    if (key === EXPRESSION_DRAFT_STORAGE_KEY) unreadable = 2;
    return true;
  };
  f.storage.getItem = key => {
    if (key === EXPRESSION_DRAFT_STORAGE_KEY && unreadable > 0) {
      unreadable -= 1;
      throw new Error('temporary post-rename read error');
    }
    return realGet(key);
  };
  try {
    expect(() => service.save(value)).toThrow('temporary post-rename read error');
  } finally {
    f.storage.setItem = realSet;
    f.storage.getItem = realGet;
  }
  return f.make().load();
}
test('cold restore retains ordered same-name identities, exact candidates, selection and refusal without history', () => {
  const f = fixture(), service = f.make(), value = snapshot();
  value.rejected = true;
  const saved = service.save(value);
  const revived = f.make().load();
  expect(revived).toEqual(saved);
  expect(revived.snapshot.pipeline.outputSnapshot.map(item => item.personId)).toEqual(['synthetic-a','synthetic-b','synthetic-a']);
  expect(revived.snapshot.pipeline.candidateSentences).toEqual(value.pipeline.candidateSentences);
  expect(revived.snapshot.rejected).toBe(true);
  expect(f.repo.loadCommunicationHistory()).toEqual([]);
  expect(f.repo.loadCommunicationSavedPhrases()).toEqual([]);
});
test('pure text expression preserves exact full sentence and can confirm', () => {
  const f = fixture(), s = f.make();
  const pipeline = buildExpressionLoopStateFromSavedPhrase({ sentence: '我今晚不回家吃饭', output: [] });
  s.save({ pipeline });
  expect(s.confirm(buildExpressionHistoryEntry(pipeline)).sentence).toBe('我今晚不回家吃饭');
  expect(f.make().load().status).toBe('confirmed');
});
test('clear/discard markers prevent old expression reappearing; no persisted undo or side effects', () => {
  const f = fixture(), s = f.make();
  s.save({ ...snapshot(), undoHistory: [snapshot()] });
  const old = f.repo.loadCommunicationSavedPhrases();
  s.save({ pipeline: buildExpressionLoopState([]) });
  expect(hasResumableExpressionDraft(f.make().load())).toBe(false);
  expect(f.make().load().status).toBe('cleared');
  s.discard();
  expect(f.repo.loadCommunicationSavedPhrases()).toEqual(old);
  expect(JSON.stringify(f.make().load())).not.toContain('undoHistory');
});
test('idle session expiry preserves work but scope changes reject late writes', () => {
  const f = fixture(), s = f.make(), draft = s.save(snapshot());
  const oldSession = f.repo.getActiveConversationSession().id;
  f.tick();
  expect(f.repo.getActiveConversationSession().id).not.toBe(oldSession);
  expect(f.make().load()).toEqual(draft);
  f.switchScope();
  expect(() => s.save(snapshot())).toThrow('档案已切换');
});
test('older loaded revision cannot overwrite another page update', () => {
  const f = fixture(), a = f.make(), b = f.make();
  a.save(snapshot()); b.load();
  a.save({ ...snapshot(), rejected: true });
  expect(() => b.save(snapshot())).toThrow('其他页面');
  expect(() => b.discard()).toThrow('其他页面');
  expect(f.make().load().snapshot.rejected).toBe(true);
});
test.each(['throw', 'silent'])('storage %s failure leaves prior valid draft and history untouched', kind => {
  const f = fixture(), s = f.make(), previous = s.save(snapshot());
  const real = f.storage.setItem;
  f.storage.setItem = (key, value) => {
    if (key === EXPRESSION_DRAFT_STORAGE_KEY) {
      if (kind === 'throw') throw new Error('disk full');
      return true;
    }
    return real(key, value);
  };
  expect(() => s.save({ ...snapshot(), rejected: true })).toThrow();
  expect(f.make().load()).toEqual(previous);
  expect(f.repo.loadCommunicationHistory()).toEqual([]);
  f.storage.setItem = real;
  expect(s.save({ ...snapshot(), rejected: true }).snapshot.rejected).toBe(true);
});
test('confirmation retry after cleanup failure does not append or update history again', () => {
  const f = fixture(), s = f.make(), value = snapshot();
  s.save(value);
  const entry = buildExpressionHistoryEntry(value.pipeline);
  const real = f.storage.setItem;
  f.storage.setItem = (key, value) => {
    if (key === EXPRESSION_DRAFT_STORAGE_KEY) throw new Error('cleanup failed');
    return real(key, value);
  };
  expect(() => s.confirm(entry)).toThrow('未能保存到本机');
  const first = f.repo.loadCommunicationHistory();
  expect(first).toHaveLength(1);
  f.storage.setItem = real;
  const cold = f.make(); cold.load();
  cold.confirm(entry); cold.confirm(entry);
  expect(f.repo.loadCommunicationHistory()).toEqual(first);
  expect(cold.getCurrent().status).toBe('confirmed');
  expect(() => cold.confirm({ ...entry, sentence: '更改已确认原句' })).toThrow('重新复核');
});
test('future or damaged drafts fail closed without overwriting raw evidence', () => {
  const f = fixture(), s = f.make();
  const d = s.save(snapshot());
  const raw = JSON.stringify({ [JSON.stringify([f.repo.loadCommunicationIdentity().workspaceId, f.repo.loadCommunicationIdentity().patientId])]: { ...d, version: 99 } });
  f.data.set(EXPRESSION_DRAFT_STORAGE_KEY, raw);
  expect(() => f.make().load()).toThrow('版本');
  expect(() => s.save(snapshot())).toThrow();
  expect(f.data.get(EXPRESSION_DRAFT_STORAGE_KEY)).toBe(raw);
});
test('recovery restores anonymous wire context but reconstructs local people map and replays original identity', () => {
  const f = fixture(), s = f.make(), value = snapshot();
  s.save(value);
  const scope = { origin: 'https://synthetic.invalid/api', accountId: 'a', familyId: 'f', profileId: 'p', fundingId: 'fund' };
  const journal = createCareAiRequestJournal({ storage: f.storage });
  const request = attachExpressionDraftRequest(buildCommunicationAiSentenceRequest({ output: value.pipeline.outputSnapshot, context: { scene: 'home' } }), s);
  const body = JSON.parse(JSON.stringify(request));
  const ticket = journal.prepare({ ...scope, operation: 'communication-sentences', body, localIdentity: getPrivatePersonRequestIdentity(request) });
  getExpressionDraftRequestContext(request).beforeDispatch({ ...ticket, body });
  const cold = f.make(); cold.load();
  const retry = attachExpressionDraftRequest(buildCommunicationAiSentenceRequest({ output: value.pipeline.outputSnapshot, context: { scene: 'hospital' } }), cold);
  const retryTicket = journal.prepare({ ...scope, operation: 'communication-sentences', body: JSON.parse(JSON.stringify(retry)), localIdentity: getPrivatePersonRequestIdentity(retry) });
  getExpressionDraftRequestContext(retry).beforeDispatch({ ...retryTicket, body });
  expect(retryTicket.requestId).toBe(ticket.requestId);
  const wire = JSON.stringify(retry);
  expect(wire).not.toContain('林小明'); expect(wire).not.toContain('local-private');
  expect(wire).not.toContain('beforeDispatch'); expect(wire).not.toContain('synthetic-a');
  const restored = restorePrivatePersonAiResponse(retry, { candidates: ['⟦P1⟧、⟦P2⟧、⟦P1⟧回家'] }, 'communication-sentences');
  expect(restored.candidates).toEqual(['林小明、林小明、林小明回家']);
  expect(() => cold.prepareAi({ ...retryTicket, scope: { ...scope, fundingId: 'other' } })).toThrow('额度');
});
test('drafts stay independent of receiver/preparation/history keys and regular cloud settings', () => {
  const f = fixture(), s = f.make();
  f.data.set(COMMUNICATION_STORAGE_KEYS.savedPhrasePreparation, '{"synthetic":"original"}');
  const raw = f.data.get(COMMUNICATION_STORAGE_KEYS.savedPhrasePreparation);
  s.save(snapshot()); s.discard();
  expect(f.data.get(COMMUNICATION_STORAGE_KEYS.savedPhrasePreparation)).toBe(raw);
  expect(f.repo.loadCommunicationHistory()).toEqual([]);
});

test('private clear removes saved references and prevents a mounted old draft from resurrecting them', () => {
  const f = fixture(), s = f.make();
  s.save(snapshot());
  f.repo.clearExpressionDrafts();
  expect(f.make().load()).toBeNull();
  expect(() => s.save(snapshot())).toThrow('其他页面更新');
  expect(JSON.stringify([...f.data.values()].filter(value => typeof value === 'string'))).not.toContain('local-private://');
});

test('post-write adapter error is acknowledged only after exact read-back', () => {
  const f = fixture(), s = f.make();
  const real = f.storage.setItem;
  f.storage.setItem = (key, value) => { real(key, value); if (key === EXPRESSION_DRAFT_STORAGE_KEY) throw new Error('after write'); };
  expect(s.save(snapshot()).status).toBe('draft');
  expect(f.make().load()).toEqual(s.getCurrent());
});

test('unchanged snapshot still reads the authoritative store before reporting success', () => {
  const f = fixture(), s = f.make(), value = snapshot();
  const saved = s.save(value);
  const real = f.storage.getItem;
  f.storage.getItem = key => {
    if (key === EXPRESSION_DRAFT_STORAGE_KEY) throw new Error('authoritative file unavailable');
    return real(key);
  };
  expect(() => s.save(value)).toThrow('authoritative file unavailable');
  expect(s.getCurrent()).toEqual(saved);
  f.storage.getItem = real;
  expect(s.save(value)).toEqual(saved);
});

test('retry reconciles only its own completed write after both immediate readbacks fail', () => {
  const f = fixture(), s = f.make(), previous = s.save(snapshot());
  const changed = { ...snapshot(), rejected: true };
  const actual = saveWithLostReadbacks(f, s, changed);
  expect(s.getCurrent()).toEqual(previous);
  expect(actual.revision).toBe(previous.revision + 1);
  expect(actual.snapshot.rejected).toBe(true);
  expect(s.save(changed)).toEqual(actual);
  expect(s.getCurrent()).toEqual(actual);
});

test('lost own-write receipt cannot reconcile a different external revision', () => {
  const f = fixture(), s = f.make();
  s.save(snapshot());
  saveWithLostReadbacks(f, s, { ...snapshot(), rejected: true });
  const other = f.make();
  const external = other.save({ ...snapshot(), pipeline: { ...snapshot().pipeline, selectedIndex: 0 } });
  expect(() => s.save({ ...snapshot(), rejected: true })).toThrow('其他页面');
  expect(f.make().load()).toEqual(external);
});

test('lost own-write receipt cannot be acknowledged after switching scope', () => {
  const f = fixture(), s = f.make();
  s.save(snapshot());
  saveWithLostReadbacks(f, s, { ...snapshot(), rejected: true });
  f.switchScope();
  expect(() => s.save({ ...snapshot(), rejected: true })).toThrow('档案已切换');
});

test('explicit load forgets prior unresolved write intent', () => {
  const f = fixture(), s = f.make();
  s.save(snapshot());
  const attempted = saveWithLostReadbacks(f, s, { ...snapshot(), rejected: true });
  f.make().save({ ...snapshot(), pipeline: { ...snapshot().pipeline, selectedIndex: 0 } });
  s.load();
  const values = JSON.parse(f.data.get(EXPRESSION_DRAFT_STORAGE_KEY));
  values[Object.keys(values)[0]] = attempted;
  f.data.set(EXPRESSION_DRAFT_STORAGE_KEY, JSON.stringify(values));
  expect(() => s.save({ ...snapshot(), rejected: true })).toThrow('其他页面');
});

test.each(['throw', 'silent'])('AI beforeDispatch blocks %s recovery-association write failure', kind => {
  const f = fixture(), s = f.make(), value = snapshot();
  const saved = s.save(value);
  const scope = { origin: 'https://synthetic.invalid/api', accountId: 'a', familyId: 'f', profileId: 'p', fundingId: 'fund' };
  const ticket = { requestId: 'synthetic-stable-request', fingerprint: 'synthetic-input', scope,
    body: { pictogramLabels: ['return home'] } };
  const request = attachExpressionDraftRequest({ ...ticket.body }, s);
  const post = jest.fn();
  const dispatch = () => {
    getExpressionDraftRequestContext(request).beforeDispatch(ticket);
    post(ticket.requestId);
  };
  const real = f.storage.setItem;
  f.storage.setItem = (key, data) => {
    if (key === EXPRESSION_DRAFT_STORAGE_KEY) {
      if (kind === 'throw') throw new Error('authoritative file write failed');
      return true;
    }
    return real(key, data);
  };
  expect(dispatch).toThrow('未能保存到本机');
  expect(post).not.toHaveBeenCalled();
  expect(f.make().load()).toEqual(saved);
  f.storage.setItem = real;
  dispatch();
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(ticket.requestId);
  expect(f.make().load().snapshot.pendingAi.requestId).toBe(ticket.requestId);
});

test('confirmed expression stays finished on replay but explicit generation can begin new human work', () => {
  const f = fixture(), s = f.make(), state = snapshot();
  s.save(state); s.confirm(buildExpressionHistoryEntry(state.pipeline));
  const old = s.getCurrent();
  expect(s.save(state).id).toBe(old.id);
  expect(s.save(state).status).toBe('confirmed');
  const next = s.save(state, { startNew: true });
  expect(next.id).not.toBe(old.id);
  expect(next.status).toBe('draft');
  expect(f.repo.loadCommunicationHistory()).toHaveLength(1);
});
