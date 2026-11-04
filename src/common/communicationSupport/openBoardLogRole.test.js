import {
  buildCommunicationHistoryOpenBoardLog,
  buildCommunicationHistoryAnonymizedOpenBoardLog,
  importCommunicationHistoryOpenBoardLog
} from './historyManagement';
import { normalizeCommunicationHistory, buildCommunicationSupportCloudSettings } from './storage';
import { getCommunicationHistoryImportRoleText, normalizeOpenBoardLogRole } from './openBoardLogRole';

const TIME = '2026-10-30T01:00:00.000Z';
const parseLog = text => JSON.parse(text.slice(text.indexOf('{')));
const fixture = event => ({
  format: 'open-board-log-0.1', user_id: 'synthetic-external', source: 'synthetic-interop',
  sessions: [{ id: 's1', type: 'log', events: [{
    id: 'e1', timestamp: TIME, type: 'utterance', text: '我今晚不回家吃饭', ...event
  }] }]
});

describe('Open Board Logging role and direction are independent', () => {
  test('role labels describe support and uncertainty without turning them into a teaching or comprehension claim', () => {
    const inferred = importCommunicationHistoryOpenBoardLog(fixture({ modeling: true }), []).items[0];
    expect(getCommunicationHistoryImportRoleText(inferred)).toContain('他人为指导或支持而操作');
    expect(getCommunicationHistoryImportRoleText(inferred)).toContain('方向按兼容规则推定');
    expect(getCommunicationHistoryImportRoleText(inferred)).toContain('不代表已理解或独立完成');
    expect(getCommunicationHistoryImportRoleText({ importSource: 'open-board-log' })).toContain('旧导入记录未保留操作方信息');
    expect(getCommunicationHistoryImportRoleText({ direction: 'receive' })).toBe('');
    expect(normalizeOpenBoardLogRole({ ...inferred, localOnly: false })).toBeNull();
    expect(normalizeOpenBoardLogRole({ ...inferred, openBoardLogRole: { modeling: 'true', directionSource: 'extension' } })).toBeNull();
  });
  test.each([
    [true, 'express'], [false, 'receive'], [true, 'receive'], [false, 'express']
  ])('preserves external modeling=%s and declared direction=%s through local save and export', (modeling, direction) => {
    const source = fixture({ modeling, ext_picinterpreter_direction: direction });
    const before = JSON.stringify(source);
    const imported = importCommunicationHistoryOpenBoardLog(source, []);
    expect(imported.ok).toBe(true);
    const saved = normalizeCommunicationHistory(imported.items);
    expect(saved[0].direction).toBe(direction);
    const exported = parseLog(buildCommunicationHistoryOpenBoardLog(saved, { now: () => Date.parse(TIME) }));
    expect(exported.sessions[0].events[0]).toMatchObject({
      text: '我今晚不回家吃饭', modeling, ext_picinterpreter_direction: direction
    });
    expect(saved[0].openBoardLogRole).toEqual({ modeling, directionSource: 'extension' });
    expect(buildCommunicationSupportCloudSettings([], saved).history).toEqual([]);
    expect(JSON.stringify(source)).toBe(before);
  });

  test.each([true, false, undefined])('keeps compatibility inference visible when the file has modeling=%s but no direction', modeling => {
    const imported = importCommunicationHistoryOpenBoardLog(fixture({ modeling }), []);
    const saved = normalizeCommunicationHistory(imported.items);
    expect(saved[0].direction).toBe(modeling === true ? 'receive' : 'express');
    expect(saved[0].openBoardLogRole).toEqual({ modeling: modeling === true, directionSource: 'compatibility' });
    const exported = parseLog(buildCommunicationHistoryOpenBoardLog(saved));
    expect(exported.sessions[0].events[0].ext_picinterpreter_direction_source).toBe('compatibility');
    const reopened = importCommunicationHistoryOpenBoardLog(exported, []);
    expect(reopened.items[0].openBoardLogRole).toEqual(saved[0].openBoardLogRole);
    expect(reopened.items[0].recordStatus).not.toBe('confirmed');
  });

  test('legacy local records retain existing support semantics without claiming an explicit teaching mode', () => {
    const entries = ['express', 'receive'].map((direction, index) => ({
      id: `synthetic-${index}`, sessionId: 'synthetic-session', direction,
      sentence: direction === 'express' ? '我想喝水' : '',
      inputText: direction === 'receive' ? '请坐下' : '', labels: [], createdAt: index + 1
    }));
    const before = JSON.stringify(entries);
    const exported = parseLog(buildCommunicationHistoryOpenBoardLog(entries));
    expect(exported.sessions[0].events.map(event => event.modeling)).toEqual([false, true]);
    expect(JSON.stringify(entries)).toBe(before);
  });

  test('anonymous export keeps role but strips direction, role metadata and external identity', () => {
    const imported = importCommunicationHistoryOpenBoardLog(fixture({
      modeling: true, ext_picinterpreter_direction: 'express',
      user_name: '合成林安', image_url: 'https://private.invalid/synthetic.png'
    }), []);
    const text = buildCommunicationHistoryAnonymizedOpenBoardLog(normalizeCommunicationHistory(imported.items), { random: () => 0.5 });
    const event = parseLog(text).sessions[0].events[0];
    expect(event.modeling).toBe(true);
    expect(Object.keys(event).sort()).toEqual(['id', 'modeling', 'redacted', 'text', 'timestamp', 'type'].sort());
    expect(text).not.toMatch(/我今晚|合成林安|private\.invalid|ext_picinterpreter|openBoardLogRole/);
  });
});
