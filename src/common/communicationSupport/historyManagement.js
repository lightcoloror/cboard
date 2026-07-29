import {
  getReceiverPatientFeedbackLabel,
  normalizeReceiverPatientFeedback
} from './receiverPatientFeedback';
import {
  normalizeExpressionCandidates,
  toggleExpressionCandidateFeedback
} from './candidateFeedback';

export const DEFAULT_COMMUNICATION_HISTORY_LIMIT = 100;
export const OPEN_BOARD_LOG_FORMAT = 'open-board-log-0.1';
export const OPEN_BOARD_LOG_NOTICE =
  "/* NOTICE: The following information represents an individual's communication and should be treated respectfully and securely. */";
export const DEFAULT_OPEN_BOARD_LOG_IMPORT_MAX_LENGTH = 1024 * 1024;
export const OPEN_BOARD_LOG_ANONYMIZATIONS = [
  'id_pseudonymization',
  'timestamp_shift',
  'timestamp_jitter',
  'geolocation_masking',
  'net_masking',
  'fringe_masking',
  'name_masking',
  'url_stripping',
  'extras_removed'
];

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeTimestamp(value, fallback = Date.now()) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function createStableHash(value) {
  const input = String(value || '');
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function createHistoryFingerprint(entry) {
  const input = [
    entry.direction,
    entry.sessionId,
    entry.sentence,
    entry.inputText,
    (entry.labels || []).join('|'),
    entry.createdAt
  ].join('::');

  return `history_${createStableHash(input)}`;
}

export function normalizeManagedCommunicationHistoryEntry(entry, options = {}) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.direction !== 'express' && entry.direction !== 'receive') {
    return null;
  }

  const createdAt = normalizeTimestamp(entry.createdAt);
  const normalized = {
    ...entry,
    direction: entry.direction,
    sentence: normalizeText(entry.sentence),
    inputText: normalizeText(entry.inputText),
    labels: (Array.isArray(entry.labels) ? entry.labels : [])
      .map(normalizeText)
      .filter(Boolean),
    sessionId: normalizeText(entry.sessionId) || 'legacy-session',
    createdAt,
    updatedAt: normalizeTimestamp(entry.updatedAt, createdAt),
    isFavorite: Boolean(entry.isFavorite)
  };
  normalized.id =
    normalizeText(entry.id) ||
    (typeof options.createId === 'function'
      ? normalizeText(options.createId('history'))
      : createHistoryFingerprint(normalized));

  if (
    !normalized.sentence &&
    !normalized.inputText &&
    !normalized.labels.length
  ) {
    return null;
  }

  return normalized;
}

export function normalizeManagedCommunicationHistory(
  entries,
  { limit = DEFAULT_COMMUNICATION_HISTORY_LIMIT, ...options } = {}
) {
  const seen = new Set();
  const normalizedLimit =
    Number.isInteger(limit) && limit > 0
      ? limit
      : DEFAULT_COMMUNICATION_HISTORY_LIMIT;

  return (Array.isArray(entries) ? entries : [])
    .map(entry => normalizeManagedCommunicationHistoryEntry(entry, options))
    .filter(entry => {
      if (!entry || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, normalizedLimit);
}

export function toggleCommunicationHistoryFavorite(
  entries,
  id,
  { now = Date.now, ...options } = {}
) {
  const current = normalizeManagedCommunicationHistory(entries, options);
  const timestamp = typeof now === 'function' ? now() : Date.now();
  let item = null;
  const items = current.map(entry => {
    if (entry.id !== normalizeText(id)) return entry;
    item = {
      ...entry,
      isFavorite: !entry.isFavorite,
      updatedAt: timestamp
    };
    return item;
  });

  return { changed: Boolean(item), item, items };
}

export function deleteCommunicationHistoryEntry(entries, id, options) {
  const current = normalizeManagedCommunicationHistory(entries, options);
  const items = current.filter(entry => entry.id !== normalizeText(id));
  return { changed: items.length !== current.length, items };
}

export function updateCommunicationHistoryCandidateFeedback(
  entries,
  id,
  candidateIndex,
  feedback,
  { now = Date.now, ...options } = {}
) {
  const current = normalizeManagedCommunicationHistory(entries, options);
  const normalizedId = normalizeText(id);
  const timestamp = typeof now === 'function' ? now() : Date.now();
  let item = null;
  let changed = false;
  const items = current.map(entry => {
    if (entry.id !== normalizedId || entry.direction !== 'express') {
      return entry;
    }

    const candidates = normalizeExpressionCandidates(
      entry.candidates,
      entry.candidateSentences
    );
    const nextCandidates = toggleExpressionCandidateFeedback(
      candidates,
      candidateIndex,
      feedback
    );

    if (JSON.stringify(nextCandidates) === JSON.stringify(candidates)) {
      return entry;
    }

    changed = true;
    item = {
      ...entry,
      candidateSentences: nextCandidates.map(candidate => candidate.sentence),
      candidates: nextCandidates,
      updatedAt: timestamp
    };
    return item;
  });

  return { changed, item, items };
}

export function clearCommunicationHistory() {
  return [];
}

export function getCommunicationHistoryReplayText(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return normalizeText(
    entry.direction === 'receive'
      ? entry.inputText || entry.sentence
      : entry.sentence ||
          (Array.isArray(entry.candidateSentences)
            ? entry.candidateSentences[0]
            : '')
  );
}

export function getCommunicationHistoryPatientFeedbackText(entry) {
  if (!entry || entry.direction !== 'receive') return '';
  const label = getReceiverPatientFeedbackLabel(entry.patientFeedback);
  return label ? `患者反馈：${label}` : '';
}

export function groupCommunicationHistoryBySession(entries, options) {
  const groups = [];
  const byId = new Map();

  normalizeManagedCommunicationHistory(entries, options).forEach(entry => {
    if (!byId.has(entry.sessionId)) {
      const group = { sessionId: entry.sessionId, items: [] };
      byId.set(entry.sessionId, group);
      groups.push(group);
    }
    byId.get(entry.sessionId).items.push(entry);
  });

  return groups;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatFullTime(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function buildCommunicationHistoryExportText(
  entries,
  { now = Date.now, title = '图语家 · 对话记录导出' } = {}
) {
  const timestamp = typeof now === 'function' ? now() : Date.now();
  const exportedAt = new Date(timestamp);
  const groups = groupCommunicationHistoryBySession(entries, {
    limit: Number.MAX_SAFE_INTEGER
  });
  const lines = [
    title,
    `导出时间：${exportedAt.getFullYear()}年${pad(
      exportedAt.getMonth() + 1
    )}月${pad(exportedAt.getDate())}日 ${pad(exportedAt.getHours())}:${pad(
      exportedAt.getMinutes()
    )}`,
    ''
  ];

  groups.forEach((group, index) => {
    lines.push('='.repeat(40));
    lines.push(`会话 ${groups.length - index}`);
    lines.push('='.repeat(40));

    [...group.items].reverse().forEach(entry => {
      lines.push('');
      lines.push(
        `[${entry.direction === 'receive' ? '接收' : '表达'}]  ${formatFullTime(
          entry.createdAt
        )}`
      );

      const replayText = getCommunicationHistoryReplayText(entry);
      if (replayText) {
        lines.push(
          `${entry.direction === 'receive' ? '原文' : '句子'}：${replayText}`
        );
      }
      if (entry.labels.length) {
        lines.push(
          `图片：${entry.labels.map(label => `[${label}]`).join(' ')}`
        );
      }
      const patientFeedback = getCommunicationHistoryPatientFeedbackText(entry);
      if (patientFeedback) lines.push(patientFeedback);
      if (entry.isFavorite) lines.push('已收藏');
    });
    lines.push('');
  });

  if (!groups.length) lines.push('（暂无记录）');
  return lines.join('\n');
}

function toIsoTimestamp(value, fallback) {
  const timestamp = normalizeTimestamp(value, fallback);
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? new Date(fallback).toISOString()
    : date.toISOString();
}

function buildOpenBoardLogEvent(entry, index, exportedAt) {
  const text =
    getCommunicationHistoryReplayText(entry) || (entry.labels || []).join(' ');
  if (!text) return null;

  const event = {
    id: 'event-' + (index + 1),
    timestamp: toIsoTimestamp(entry.createdAt, exportedAt),
    type: 'utterance',
    text,
    modeling: entry.direction === 'receive',
    ext_picinterpreter_direction: entry.direction
  };

  if (entry.labels.length) {
    event.ext_picinterpreter_labels = [...entry.labels];
  }
  if (entry.direction === 'receive' && entry.patientFeedback) {
    event.ext_picinterpreter_patient_feedback = entry.patientFeedback;
  }

  return event;
}

export function buildCommunicationHistoryOpenBoardLog(
  entries,
  {
    now = Date.now,
    locale = 'zh-CN',
    source = 'picinterpreter-cboard',
    userId
  } = {}
) {
  const exportedAt = normalizeTimestamp(
    typeof now === 'function' ? now() : now
  );
  const normalizedEntries = (Array.isArray(entries) ? entries : []).map(
    entry => ({
      ...entry,
      createdAt: normalizeTimestamp(entry && entry.createdAt, exportedAt)
    })
  );
  let eventIndex = 0;
  const sessions = groupCommunicationHistoryBySession(normalizedEntries, {
    limit: Number.MAX_SAFE_INTEGER
  })
    .map(group => {
      const items = [...group.items].sort(
        (left, right) => left.createdAt - right.createdAt
      );
      const events = items
        .map(entry => {
          const event = buildOpenBoardLogEvent(entry, eventIndex, exportedAt);
          if (event) eventIndex += 1;
          return event;
        })
        .filter(Boolean);
      if (!events.length) return null;

      return {
        startedAt: items[0].createdAt,
        endedAt: items[items.length - 1].createdAt,
        events
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.startedAt - right.startedAt)
    .map((session, index) => ({
      id: 'session-' + (index + 1),
      type: 'log',
      started: toIsoTimestamp(session.startedAt, exportedAt),
      ended: toIsoTimestamp(session.endedAt, exportedAt),
      events: session.events
    }));

  if (!sessions.length) return '';

  const normalizedSource = normalizeText(source) || 'picinterpreter-cboard';
  const normalizedUserId =
    normalizeText(userId) || 'export-' + exportedAt.toString(36);
  const log = {
    format: OPEN_BOARD_LOG_FORMAT,
    user_id: normalizedUserId,
    source: normalizedSource,
    locale: normalizeText(locale) || 'zh-CN',
    sessions
  };

  return OPEN_BOARD_LOG_NOTICE + '\n' + JSON.stringify(log, null, 2);
}

function normalizeRandomUnit(random) {
  const value = typeof random === 'function' ? Number(random()) : NaN;
  if (!Number.isFinite(value)) return 0.5;
  if (value <= 0) return 0;
  if (value >= 1) return 1 - 1e-12;
  return value;
}

function shiftOpenBoardLogTimestamp(value, offset) {
  return new Date(Date.parse(value) + offset).toISOString();
}

function jitterOpenBoardLogEvents(events, startedAt, endedAt, random) {
  const sourceTimes = events.map(event => Date.parse(event.timestamp));

  return events.map((event, index) => {
    const current = sourceTimes[index];
    const previous = index > 0 ? sourceTimes[index - 1] : startedAt;
    const next =
      index + 1 < sourceTimes.length ? sourceTimes[index + 1] : endedAt;
    const backwardRange = Math.max(0, (current - previous) / 2);
    const forwardRange = Math.max(0, (next - current) / 2);
    const jittered =
      current -
      backwardRange +
      normalizeRandomUnit(random) * (backwardRange + forwardRange);

    return {
      id: 'event-' + (index + 1),
      timestamp: new Date(Math.round(jittered)).toISOString(),
      type: 'utterance',
      text: ':fringe-' + (index + 1),
      modeling: event.modeling === true,
      redacted: true
    };
  });
}

export function buildCommunicationHistoryAnonymizedOpenBoardLog(
  entries,
  { random = Math.random, ...options } = {}
) {
  const privateText = buildCommunicationHistoryOpenBoardLog(entries, options);
  if (!privateText) return '';

  const privateLog = JSON.parse(privateText.slice(privateText.indexOf('{')));
  const earliestStartedAt = Math.min(
    ...privateLog.sessions.map(session => Date.parse(session.started))
  );
  const targetStartedAt = Date.parse('2000-01-01T00:00:00.000Z');
  const timestampOffset = targetStartedAt - earliestStartedAt;
  let eventIndex = 0;
  const sessions = privateLog.sessions.map((session, sessionIndex) => {
    const shiftedStarted = shiftOpenBoardLogTimestamp(
      session.started,
      timestampOffset
    );
    const shiftedEnded = shiftOpenBoardLogTimestamp(
      session.ended,
      timestampOffset
    );
    const shiftedEvents = session.events.map(event => ({
      ...event,
      timestamp: shiftOpenBoardLogTimestamp(event.timestamp, timestampOffset)
    }));
    const events = jitterOpenBoardLogEvents(
      shiftedEvents,
      Date.parse(shiftedStarted),
      Date.parse(shiftedEnded),
      random
    ).map(event => ({
      ...event,
      id: 'event-' + ++eventIndex,
      text: ':fringe-' + eventIndex
    }));

    return {
      id: 'session-' + (sessionIndex + 1),
      type: 'log',
      anonymizations: [...OPEN_BOARD_LOG_ANONYMIZATIONS],
      started: shiftedStarted,
      ended: shiftedEnded,
      events
    };
  });
  const anonymizedLog = {
    format: OPEN_BOARD_LOG_FORMAT,
    user_id: 'user-1',
    anonymized: true,
    source: privateLog.source,
    locale: privateLog.locale,
    sessions
  };

  return OPEN_BOARD_LOG_NOTICE + '\n' + JSON.stringify(anonymizedLog, null, 2);
}

function createOpenBoardLogImportFailure(items, error) {
  return {
    ok: false,
    error,
    items,
    addedCount: 0,
    skippedCount: 0,
    duplicateCount: 0,
    invalidEventCount: 0,
    unsupportedEventCount: 0,
    capacitySkippedCount: 0,
    anonymized: false
  };
}

function parseOpenBoardLogInput(input, maxInputLength) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input;
  }
  if (typeof input !== 'string') {
    throw new TypeError('请选择有效的 OpenAAC .obl 文件。');
  }
  if (input.length > maxInputLength) {
    throw new RangeError('标准沟通日志超过 1 MiB，未导入。');
  }

  const objectStart = input.indexOf('{');
  if (objectStart < 0) {
    throw new TypeError('标准沟通日志缺少 JSON 内容。');
  }

  try {
    return JSON.parse(input.slice(objectStart));
  } catch (error) {
    throw new TypeError('标准沟通日志 JSON 无法解析。');
  }
}

function parseOpenBoardLogTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeOpenBoardLogLabels(value) {
  return (Array.isArray(value) ? value : [])
    .map(label => normalizeText(label).slice(0, 100))
    .filter(Boolean)
    .slice(0, 40);
}

export function importCommunicationHistoryOpenBoardLog(
  input,
  entries,
  {
    maxItems = DEFAULT_COMMUNICATION_HISTORY_LIMIT,
    maxInputLength = DEFAULT_OPEN_BOARD_LOG_IMPORT_MAX_LENGTH,
    maxSessions = 200,
    maxEvents = 2000
  } = {}
) {
  const normalizedMaxItems =
    Number.isInteger(maxItems) && maxItems > 0
      ? maxItems
      : DEFAULT_COMMUNICATION_HISTORY_LIMIT;
  const normalizedMaxInputLength =
    Number.isInteger(maxInputLength) && maxInputLength > 0
      ? maxInputLength
      : DEFAULT_OPEN_BOARD_LOG_IMPORT_MAX_LENGTH;
  const normalizedMaxSessions =
    Number.isInteger(maxSessions) && maxSessions > 0 ? maxSessions : 200;
  const normalizedMaxEvents =
    Number.isInteger(maxEvents) && maxEvents > 0 ? maxEvents : 2000;
  const current = normalizeManagedCommunicationHistory(entries, {
    limit: normalizedMaxItems
  });
  let log;

  try {
    log = parseOpenBoardLogInput(input, normalizedMaxInputLength);
  } catch (error) {
    return createOpenBoardLogImportFailure(
      current,
      error && error.message ? error.message : '标准沟通日志无法读取。'
    );
  }

  if (!log || log.format !== OPEN_BOARD_LOG_FORMAT) {
    return createOpenBoardLogImportFailure(
      current,
      '仅支持 OpenAAC open-board-log-0.1 标准沟通日志。'
    );
  }
  if (log.anonymized === true) {
    return {
      ...createOpenBoardLogImportFailure(
        current,
        '匿名研究日志不能恢复为本机沟通历史；请使用包含原文的私密 .obl 文件。'
      ),
      anonymized: true
    };
  }
  if (typeof log.user_id !== 'string' || !normalizeText(log.user_id)) {
    return createOpenBoardLogImportFailure(
      current,
      '标准沟通日志缺少字符串类型的 user_id。'
    );
  }
  if (!Array.isArray(log.sessions) || !log.sessions.length) {
    return createOpenBoardLogImportFailure(
      current,
      '标准沟通日志没有可导入的会话。'
    );
  }

  const fileIdentity = [log.format, normalizeText(log.source)].join('::');
  const seenIds = new Set();
  const candidates = [];
  let utteranceEventCount = 0;
  let invalidEventCount = 0;
  let unsupportedEventCount = 0;
  let duplicateCount = 0;
  let processedEventCount = 0;

  log.sessions.slice(0, normalizedMaxSessions).forEach(session => {
    const sessionId =
      session && typeof session.id === 'string'
        ? normalizeText(session.id)
        : '';
    const events =
      session && Array.isArray(session.events) ? session.events : [];
    if (
      !sessionId ||
      (session.type && session.type !== 'log') ||
      !Array.isArray(session && session.events)
    ) {
      invalidEventCount += Math.max(
        1,
        events.filter(event => event && event.type === 'utterance').length
      );
      return;
    }
    if (seenIds.has(sessionId)) {
      duplicateCount += Math.max(
        1,
        events.filter(event => event && event.type === 'utterance').length
      );
      return;
    }
    seenIds.add(sessionId);

    const importedSessionId =
      'obl_session_' +
      createStableHash(fileIdentity + '::session::' + sessionId);

    events.forEach(event => {
      if (processedEventCount >= normalizedMaxEvents) {
        invalidEventCount += 1;
        return;
      }
      processedEventCount += 1;

      if (!event || typeof event !== 'object') {
        unsupportedEventCount += 1;
        return;
      }
      const eventId =
        typeof event.id === 'string' ? normalizeText(event.id) : '';
      if (!eventId) {
        if (event.type === 'utterance') {
          utteranceEventCount += 1;
          invalidEventCount += 1;
        } else {
          unsupportedEventCount += 1;
        }
        return;
      }
      if (seenIds.has(eventId)) {
        if (event.type === 'utterance') {
          utteranceEventCount += 1;
          duplicateCount += 1;
        } else {
          unsupportedEventCount += 1;
        }
        return;
      }
      seenIds.add(eventId);

      if (event.type !== 'utterance') {
        unsupportedEventCount += 1;
        return;
      }
      utteranceEventCount += 1;

      const text = normalizeText(event.text);
      const createdAt = parseOpenBoardLogTimestamp(event.timestamp);
      if (!text || text.length > 5000 || createdAt === null) {
        invalidEventCount += 1;
        return;
      }

      const declaredDirection = normalizeText(
        event.ext_picinterpreter_direction
      );
      const direction =
        declaredDirection === 'express' || declaredDirection === 'receive'
          ? declaredDirection
          : event.modeling === true
          ? 'receive'
          : 'express';
      const labels = normalizeOpenBoardLogLabels(
        event.ext_picinterpreter_labels
      );
      const entry = {
        id:
          'history_obl_' +
          createStableHash(
            [fileIdentity, sessionId, eventId, event.timestamp, text].join('::')
          ),
        sessionId: importedSessionId,
        direction,
        sentence: direction === 'express' ? text : '',
        inputText: direction === 'receive' ? text : '',
        labels,
        createdAt,
        updatedAt: createdAt,
        isFavorite: false,
        localOnly: true,
        importSource: 'open-board-log'
      };
      const patientFeedback =
        direction === 'receive'
          ? normalizeReceiverPatientFeedback(
              event.ext_picinterpreter_patient_feedback
            )
          : null;
      if (patientFeedback) {
        entry.patientFeedback = patientFeedback;
        entry.patientFeedbackAt = createdAt;
        entry.patientFeedbackEvents = [{ type: patientFeedback, createdAt }];
      }
      candidates.push(entry);
    });
  });

  invalidEventCount += Math.max(0, log.sessions.length - normalizedMaxSessions);
  if (!utteranceEventCount) {
    return {
      ...createOpenBoardLogImportFailure(
        current,
        '标准沟通日志中没有可导入的 utterance 文字事件。'
      ),
      invalidEventCount,
      unsupportedEventCount,
      duplicateCount,
      skippedCount: invalidEventCount + duplicateCount
    };
  }

  const knownIds = new Set(current.map(entry => entry.id));
  const uniqueCandidates = candidates
    .sort((left, right) => right.createdAt - left.createdAt)
    .filter(entry => {
      if (knownIds.has(entry.id)) {
        duplicateCount += 1;
        return false;
      }
      knownIds.add(entry.id);
      return true;
    });
  const availableSlots = Math.max(0, normalizedMaxItems - current.length);
  const added = uniqueCandidates.slice(0, availableSlots);
  const capacitySkippedCount = Math.max(
    0,
    uniqueCandidates.length - added.length
  );
  const items = normalizeManagedCommunicationHistory([...added, ...current], {
    limit: normalizedMaxItems
  });

  return {
    ok: true,
    items,
    addedCount: added.length,
    skippedCount: invalidEventCount + duplicateCount + capacitySkippedCount,
    duplicateCount,
    invalidEventCount,
    unsupportedEventCount,
    capacitySkippedCount,
    anonymized: log.anonymized === true
  };
}
