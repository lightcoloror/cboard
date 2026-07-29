import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  dismissBoardTour,
  openCaregiverTools
} from './helpers/communicationSupport';

const HISTORY_KEY = 'cboard_communication_history';
const PREFERENCES_KEY = 'cboard_communication_preferences';
const PRIVATE_HISTORY_ID = 'private-history-2026';
const PRIVATE_SESSION_ID = 'private-session-2026';
const PRIVATE_SENTENCE = '我叫小明，住在人民路 1 号';
const CREATED_AT = Date.parse('2026-07-20T10:00:00.000Z');
const EXPECTED_ANONYMIZATIONS = [
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

test.describe('Production OpenAAC anonymized research log', () => {
  test('exports a strict .obla and refuses to restore it as private history', async ({
    page
  }, testInfo) => {
    const useTouch = testInfo.project.name.startsWith('mobile-');

    await page.addInitScript(
      ({ historyKey, preferencesKey, history }) => {
        localStorage.setItem(historyKey, JSON.stringify(history));
        localStorage.setItem(
          preferencesKey,
          JSON.stringify({ onboardingComplete: true })
        );
      },
      {
        historyKey: HISTORY_KEY,
        preferencesKey: PREFERENCES_KEY,
        history: [
          {
            id: PRIVATE_HISTORY_ID,
            sessionId: PRIVATE_SESSION_ID,
            direction: 'express',
            sentence: PRIVATE_SENTENCE,
            labels: ['小明', '人民路'],
            recordStatus: 'confirmed',
            localOnly: true,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT
          }
        ]
      }
    );
    await blockRemoteHttpRequests(page);
    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });
    await dismissBoardTour(page, useTouch);

    const panel = page.locator('.CommunicationSupportPanel');
    await activate(panel.getByRole('button', { name: '患者表达' }), useTouch);
    await openCaregiverTools(panel, useTouch);
    await activate(
      panel.getByRole('button', { name: '常用语与历史' }),
      useTouch
    );
    const managementDialog = page.getByRole('dialog', {
      name: '常用语、历史、个人图片、修正记忆、匹配诊断与本机数据'
    });
    await activate(
      managementDialog.getByRole('button', { name: /^沟通历史/ }),
      useTouch
    );
    await expect(managementDialog).toContainText(PRIVATE_SENTENCE);

    const downloadPromise = page.waitForEvent('download');
    await activate(
      managementDialog.getByRole('button', { name: '导出匿名研究日志' }),
      useTouch
    );
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      'picinterpreter-history-anonymized.obla'
    );
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const exportedText = await readFile(downloadPath, 'utf8');
    await expect(managementDialog).toContainText(
      '匿名研究日志已导出；原文已不可逆遮蔽，不能用于恢复对话。'
    );

    const exportedLog = JSON.parse(
      exportedText.slice(exportedText.indexOf('{'))
    );
    expect(Object.keys(exportedLog).sort()).toEqual(
      ['anonymized', 'format', 'locale', 'sessions', 'source', 'user_id'].sort()
    );
    expect(exportedLog).toEqual(
      expect.objectContaining({
        format: 'open-board-log-0.1',
        user_id: 'user-1',
        anonymized: true,
        locale: 'zh-CN'
      })
    );
    expect(exportedLog.sessions).toHaveLength(1);
    const [session] = exportedLog.sessions;
    expect(Object.keys(session).sort()).toEqual(
      ['anonymizations', 'ended', 'events', 'id', 'started', 'type'].sort()
    );
    expect(session).toEqual(
      expect.objectContaining({
        id: 'session-1',
        type: 'log',
        anonymizations: EXPECTED_ANONYMIZATIONS,
        started: '2000-01-01T00:00:00.000Z'
      })
    );
    expect(session.events).toHaveLength(1);
    expect(Object.keys(session.events[0]).sort()).toEqual(
      ['id', 'modeling', 'redacted', 'text', 'timestamp', 'type'].sort()
    );
    expect(session.events[0]).toEqual(
      expect.objectContaining({
        id: 'event-1',
        text: ':fringe-1',
        type: 'utterance',
        modeling: false,
        redacted: true
      })
    );
    for (const privateValue of [
      PRIVATE_SENTENCE,
      '小明',
      '人民路',
      PRIVATE_HISTORY_ID,
      PRIVATE_SESSION_ID,
      '2026',
      'ext_picinterpreter'
    ]) {
      expect(exportedText).not.toContain(privateValue);
    }

    await managementDialog
      .locator('input[accept=".obl,application/json"]')
      .setInputFiles({
        name: 'picinterpreter-history-anonymized.obla',
        mimeType: 'application/json',
        buffer: Buffer.from(exportedText, 'utf8')
      });
    await expect(managementDialog).toContainText(
      '匿名研究日志不能恢复为本机沟通历史；请使用包含原文的私密 .obl 文件。'
    );

    const storedHistory = await page.evaluate(historyKey => {
      return JSON.parse(localStorage.getItem(historyKey) || '[]');
    }, HISTORY_KEY);
    expect(storedHistory).toHaveLength(1);
    expect(storedHistory[0]).toEqual(
      expect.objectContaining({
        id: PRIVATE_HISTORY_ID,
        sessionId: PRIVATE_SESSION_ID,
        sentence: PRIVATE_SENTENCE
      })
    );
    expect(JSON.stringify(storedHistory)).not.toContain(':fringe-');
  });
});
