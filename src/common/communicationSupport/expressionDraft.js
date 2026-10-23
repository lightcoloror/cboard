import { buildExpressionOutputSignature } from './expressionPipeline';
import { normalizeExpressionCandidates } from './candidateFeedback';
import { normalizeCommunicationHistory } from './storage';

export const EXPRESSION_DRAFT_STORAGE_KEY = 'cboard_communication_expression_draft_v1';
const REQUEST_CONTEXT = Symbol('expression-draft-request');
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const failure = (message, code = 'EXPRESSION_DRAFT_CONFLICT') =>
  Object.assign(new Error(message), { code });
const emptySnapshot = () => ({
  pipeline: { contractVersion: 1, outputSnapshot: [], outputSignature: '[]',
    candidateSentences: [], selectedIndex: 0 },
  rejected: false, candidateFeedbackEntries: []
});

// Preserve reviewed snapshots, never re-resolve by label/ID or run a matcher.
// Only this local representation contains person identities and private media.
export function normalizeExpressionDraftSnapshot(value) {
  if (!value || !value.pipeline || value.pipeline.contractVersion !== 1 ||
      !Array.isArray(value.pipeline.outputSnapshot) ||
      !Array.isArray(value.pipeline.candidateSentences)) {
    throw failure('表达草稿格式不可用，原数据已保留。', 'EXPRESSION_DRAFT_INVALID');
  }
  const p = value.pipeline;
  if (p.outputSnapshot.some(item => !item || typeof item !== 'object' ||
      typeof item.label !== 'string') ||
      p.candidateSentences.some(text => typeof text !== 'string') ||
      !Number.isInteger(p.selectedIndex) || p.selectedIndex < 0 ||
      (p.candidateSentences.length ? p.selectedIndex >= p.candidateSentences.length : p.selectedIndex !== 0)) {
    throw failure('表达草稿内容不完整，请重新复核。', 'EXPRESSION_DRAFT_INVALID');
  }
  const output = clone(p.outputSnapshot);
  const pipeline = {
    contractVersion: 1, outputSnapshot: output,
    outputSignature: buildExpressionOutputSignature(output),
    candidateSentences: p.candidateSentences.slice(),
    selectedIndex: p.selectedIndex,
    ...(typeof p.candidateProvider === 'string' ? { candidateProvider: p.candidateProvider } : {}),
    ...(typeof p.isOfflineFallback === 'boolean' ? { isOfflineFallback: p.isOfflineFallback } : {})
  };
  const snapshot = {
    pipeline, rejected: value.rejected === true,
    candidateFeedbackEntries: normalizeExpressionCandidates(value.candidateFeedbackEntries || [], pipeline.candidateSentences)
  };
  if (value.pendingAi) {
    const pending = value.pendingAi;
    if (typeof pending.requestId !== 'string' || typeof pending.fingerprint !== 'string' ||
        !pending.scope || typeof pending.scope !== 'object') {
      throw failure('上次 AI 请求身份不完整，不能重新发起。', 'AI_REQUEST_STORAGE_UNAVAILABLE');
    }
    const scope = {};
    for (const field of ['origin', 'accountId', 'familyId', 'profileId', 'fundingId'])
      scope[field] = String(pending.scope[field] || '');
    snapshot.pendingAi = { requestId: pending.requestId, fingerprint: pending.fingerprint,
      scope, state: pending.state === 'completed' ? 'completed' : 'unknown',
      ...(pending.body ? { body: clone(pending.body) } : {}) };
  }
  return snapshot;
}

export function normalizeExpressionDraft(value) {
  if (!value) return null;
  if (value.version !== 1 || !value.id || !Number.isInteger(value.revision) ||
      value.revision < 1 || !['draft', 'cleared', 'confirmed'].includes(value.status) ||
      typeof value.scope !== 'string' || !Number.isFinite(value.createdAt) ||
      !Number.isFinite(value.updatedAt)) {
    throw failure('表达草稿版本或内容不可用，原数据已保留。', 'EXPRESSION_DRAFT_INVALID');
  }
  return { version: 1, id: String(value.id), revision: value.revision,
    status: value.status, scope: value.scope, createdAt: value.createdAt, updatedAt: value.updatedAt,
    snapshot: normalizeExpressionDraftSnapshot(value.snapshot),
    ...(value.confirmedRecordId ? { confirmedRecordId: String(value.confirmedRecordId) } : {}) };
}

export function hasResumableExpressionDraft(record) {
  return Boolean(record && record.status === 'draft' &&
    (record.snapshot.pipeline.outputSnapshot.length || record.snapshot.pipeline.candidateSentences.length));
}

function historyContent(entry) {
  const normalized = normalizeCommunicationHistory([{ ...entry, id: 'comparison', createdAt: 1 }])[0];
  return { sentence: (normalized && normalized.sentence) || '', output: (normalized && normalized.output) || [] };
}

export function createExpressionDraftService({ repository, getScopeKey = () => 'local', now = Date.now,
  createId = () => `ed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}` }) {
  const readScope = () => {
    const identity = repository.loadCommunicationIdentity();
    return JSON.stringify([getScopeKey(), identity.workspaceId, identity.patientId]);
  };
  const scope = readScope();
  let head;
  let attemptedWrite;
  const assertScope = () => {
    if (scope !== readScope()) throw failure('当前档案已切换，旧表达不会写入新档案。');
  };
  const read = () => { assertScope(); const value = normalizeExpressionDraft(repository.loadExpressionDraft());
    if (value && value.scope !== scope) throw failure('草稿所属档案不一致，请重新打开。');
    return value; };
  const load = () => { head = read(); attemptedWrite = undefined; return head && clone(head); };
  const current = () => {
    const value = read();
    if (head === undefined) head = value;
    if (!equal(value, head)) {
      // A file rename may commit our exact revision before both immediate
      // readbacks fail. A later authoritative read may acknowledge only that
      // one attempted write, never another page's revision or changed scope.
      if (attemptedWrite && equal(value, attemptedWrite)) {
        head = value;
        attemptedWrite = undefined;
      } else throw failure('表达已在其他页面更新，请重新载入；当前内容仍保留。');
    }
    return value;
  };
  const write = value => {
    assertScope();
    const normalized = normalizeExpressionDraft(value);
    attemptedWrite = normalized;
    try {
      repository.writeExpressionDraft(normalized, head);
    } catch (error) {
      // Some adapters report failure after completing the write. Accept only
      // an exact read-back of this revision; otherwise keep the original head.
      const actual = read();
      if (!equal(actual, normalized)) throw failure('表达未能保存到本机，请重试。', 'EXPRESSION_DRAFT_STORAGE_FAILED');
    }
    const verified = read();
    if (!equal(normalized, verified)) throw failure('表达未能保存到本机，请重试。', 'EXPRESSION_DRAFT_STORAGE_FAILED');
    head = verified;
    attemptedWrite = undefined;
    return clone(head);
  };
  const save = (value, { startNew = false } = {}) => {
    const previous = current();
    const snapshot = normalizeExpressionDraftSnapshot(value);
    if (!Object.prototype.hasOwnProperty.call(value, 'pendingAi') && (previous && previous.snapshot.pendingAi) &&
        equal(previous.snapshot.pipeline.outputSnapshot, snapshot.pipeline.outputSnapshot)) {
      snapshot.pendingAi = clone(previous.snapshot.pendingAi);
    }
    const isEmpty = !snapshot.pipeline.outputSnapshot.length && !snapshot.pipeline.candidateSentences.length;
    if (previous && equal(previous.snapshot, snapshot) &&
        !(startNew && previous.status === 'confirmed')) return clone(previous);
    const continuing = previous && previous.status === 'draft';
    return write({ version: 1, id: continuing ? previous.id : createId(),
      revision: previous ? previous.revision + 1 : 1, scope,
      status: isEmpty ? 'cleared' : 'draft', snapshot,
      createdAt: continuing ? previous.createdAt : now(), updatedAt: now() });
  };
  const discard = () => {
    const previous = current();
    return write({ version: 1, id: (previous && previous.id) || createId(),
      revision: previous ? previous.revision + 1 : 1, scope, status: 'cleared',
      snapshot: emptySnapshot(), createdAt: (previous && previous.createdAt) || now(), updatedAt: now() });
  };
  const confirm = entry => {
    const previous = current();
    if (!previous || previous.status === 'cleared') throw failure('请先保存当前表达再确认。');
    if (!(entry && entry.sentence) || previous.snapshot.rejected)
      throw failure('请先选择要确认的表达，拒绝的候选不能直接确认。');
    const pipeline = previous.snapshot.pipeline;
    if (entry.sentence !== pipeline.candidateSentences[pipeline.selectedIndex] ||
        !equal(entry.output || [], pipeline.outputSnapshot))
      throw failure('表达已变化，请重新复核并保存后再确认。');
    const id = previous.confirmedRecordId || `expression_${previous.id}`;
    const existing = repository.loadCommunicationHistory().find(item => item.id === id);
    if (existing && !equal(historyContent(existing), historyContent(entry)))
      throw failure('这次表达已经确认，不能覆盖原记录。');
    if (!existing && previous.status === 'confirmed')
      throw failure('原确认记录已被清理，不会重新创建。');
    if (!existing) {
      repository.appendCommunicationHistory({ ...entry, id });
      const verified = repository.loadCommunicationHistory().find(item => item.id === id);
      if (!verified || !equal(historyContent(verified), historyContent(entry)))
        throw failure('确认记录未能保存，请重试。', 'EXPRESSION_DRAFT_STORAGE_FAILED');
    }
    // A failed cleanup leaves the stable draft ID in place. Retry reads actual
    // history rather than appending, changing timestamps or resurrecting data.
    if (previous.status !== 'confirmed')
      write({ ...previous, status: 'confirmed', confirmedRecordId: id,
        revision: previous.revision + 1, updatedAt: now() });
    return repository.loadCommunicationHistory().find(item => item.id === id);
  };
  return { load, save, discard, confirm, getCurrent: () => head ? clone(head) : null,
    prepareAi(ticket) {
      const previous = current();
      if (!hasResumableExpressionDraft(previous)) throw failure('请先可靠保存当前表达。', 'AI_REQUEST_STORAGE_UNAVAILABLE');
      const pending = previous.snapshot.pendingAi;
      if (pending && (!equal(pending.scope, ticket.scope) || pending.requestId !== ticket.requestId ||
          pending.fingerprint !== ticket.fingerprint))
        throw failure('上次 AI 请求的档案、额度或输入已变化，不能改号重试。', 'AI_REQUEST_CONTEXT_CHANGED');
      return save({ ...previous.snapshot, pendingAi: { requestId: ticket.requestId,
        fingerprint: ticket.fingerprint, scope: ticket.scope, state: 'unknown',
        ...(ticket.body ? { body: ticket.body } : {}) } });
    },
    observeAi(ticket, completed) {
      const previous = current();
      if (!(previous && previous.snapshot.pendingAi) || previous.snapshot.pendingAi.requestId !== ticket.requestId) return;
      return save({ ...previous.snapshot, pendingAi: { ...previous.snapshot.pendingAi,
        state: completed ? 'completed' : 'unknown' } });
    }
  };
}

// Keep lifecycle callbacks outside JSON/HTTP bodies, like person identity maps.
export function attachExpressionDraftRequest(request, service) {
  const current = service.getCurrent();
  const previous = current && current.snapshot.pendingAi;
  if (previous && previous.body) {
    // Only the anonymous wire fields are restored. The non-enumerable person
    // map still comes from the current ordered local snapshot, and its digest
    // must match the original journal fingerprint before any request is sent.
    for (const key of Object.keys(request)) delete request[key];
    Object.assign(request, clone(previous.body));
  }
  Object.defineProperty(request, REQUEST_CONTEXT, { value: {
    beforeDispatch: ticket => service.prepareAi(ticket),
    afterResponse: (ticket, completed) => service.observeAi(ticket, completed)
  } });
  return request;
}
export function getExpressionDraftRequestContext(request) {
  return request && request[REQUEST_CONTEXT];
}
