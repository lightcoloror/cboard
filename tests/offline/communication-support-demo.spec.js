import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  completeCommunicationOnboarding,
  dismissBoardTour
} from './helpers/communicationSupport';

const HISTORY_KEY = 'cboard_communication_history';
const RECEIVER_RECORDS_KEY = 'cboard_communication_receiver_records';
const CREATED_AT = 1785078000000;
const PERSISTENT_DATA = {
  history: [
    {
      id: 'persistent-history-sentinel',
      direction: 'express',
      sentence: '正常模式历史不得被演示修改',
      sessionId: 'persistent-session',
      patientId: 'persistent-patient',
      workspaceId: 'persistent-workspace',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    }
  ],
  receiverRecords: [
    {
      id: 'persistent-receiver-sentinel',
      direction: 'receive',
      sentence: '正常模式接收记录不得被演示修改',
      labels: ['正常模式', '接收记录'],
      recordStatus: 'confirmed',
      sessionId: 'persistent-session',
      patientId: 'persistent-patient',
      workspaceId: 'persistent-workspace',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    }
  ]
};

async function readPersistentSentinels(page) {
  return page.evaluate(
    ({ historyKey, receiverRecordsKey }) => ({
      history: JSON.parse(localStorage.getItem(historyKey) || '[]'),
      receiverRecords: JSON.parse(
        localStorage.getItem(receiverRecordsKey) || '[]'
      )
    }),
    {
      historyKey: HISTORY_KEY,
      receiverRecordsKey: RECEIVER_RECORDS_KEY
    }
  );
}

test.describe('Production demo - isolated two-way communication', () => {
  test('keeps a real session in memory without touching persistent data', async ({
    page
  }, testInfo) => {
    const useTouch = testInfo.project.name.startsWith('mobile-');

    await page.addInitScript(
      ({ historyKey, receiverRecordsKey, persistentData }) => {
        if (localStorage.getItem('cboard_demo_e2e_seeded') === '1') return;
        localStorage.setItem(
          historyKey,
          JSON.stringify(persistentData.history)
        );
        localStorage.setItem(
          receiverRecordsKey,
          JSON.stringify(persistentData.receiverRecords)
        );
        localStorage.setItem('cboard_demo_e2e_seeded', '1');
      },
      {
        historyKey: HISTORY_KEY,
        receiverRecordsKey: RECEIVER_RECORDS_KEY,
        persistentData: PERSISTENT_DATA
      }
    );
    await blockRemoteHttpRequests(page);
    await page.goto('/demo', { waitUntil: 'domcontentloaded' });

    const banner = page.getByRole('status').filter({ hasText: '演示模式' });
    await expect(banner).toContainText('数据只保留在当前页面，刷新后会清空');
    await expect(page.locator('.personal__account')).toHaveCount(0);
    await expect(page.locator('a[href="/settings"]')).toHaveCount(0);
    await dismissBoardTour(page, useTouch);

    const tiles = page.locator('button.Tile:visible');
    await expect(tiles.first()).toBeVisible();
    expect(await tiles.count()).toBeGreaterThanOrEqual(2);
    await activate(tiles.nth(0), useTouch);
    await activate(tiles.nth(1), useTouch);

    const panel = page.locator('.CommunicationSupportPanel');
    await activate(panel.getByRole('button', { name: '患者表达' }), useTouch);
    await completeCommunicationOnboarding(page, useTouch);
    await expect(panel.getByText(/^当前输出：/)).not.toHaveText('当前输出：');
    await activate(panel.getByRole('button', { name: '生成并播报' }), useTouch);
    await expect(
      panel.locator('.CommunicationSupportPanel__candidate').first()
    ).toBeVisible();
    await activate(panel.getByRole('button', { name: '停止播报' }), useTouch);
    await activate(panel.getByRole('button', { name: '确认此句' }), useTouch);
    await expect(panel.getByRole('button', { name: '已确认' })).toBeDisabled();

    await activate(panel.getByRole('button', { name: '接收理解' }), useTouch);
    let receiverWorkspace = page.getByRole('dialog', { name: '接收理解' });
    await expect(receiverWorkspace).toBeVisible();
    const receiverInput = receiverWorkspace.getByRole('textbox', {
      name: '例如：想喝水、想要苹果、头疼'
    });
    await receiverInput.fill('想喝水');
    await activate(
      receiverWorkspace.getByRole('button', { name: '生成图片序列' }),
      useTouch
    );
    await expect(
      receiverWorkspace.getByRole('status').filter({ hasText: '匹配结果' })
    ).toContainText('已全部匹配');
    await activate(
      receiverWorkspace.getByRole('button', { name: '全屏展示' }),
      useTouch
    );
    const display = page
      .getByRole('dialog')
      .filter({ hasText: '接收端全屏展示' });
    await expect(display).toBeVisible();
    await activate(display.getByRole('button').first(), useTouch);

    const historyRows = receiverWorkspace.locator(
      '.CommunicationSupportPanel__historyRow'
    );
    await expect(historyRows.filter({ hasText: '表达' })).toHaveCount(1);
    await expect(historyRows.filter({ hasText: '接收' })).toHaveCount(1);
    expect(await readPersistentSentinels(page)).toEqual(PERSISTENT_DATA);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(banner).toContainText('数据只保留在当前页面，刷新后会清空');
    await dismissBoardTour(page, useTouch);
    const reloadedPanel = page.locator('.CommunicationSupportPanel');
    await activate(
      reloadedPanel.getByRole('button', { name: '接收理解' }),
      useTouch
    );
    await completeCommunicationOnboarding(page, useTouch);
    receiverWorkspace = page.getByRole('dialog', { name: '接收理解' });
    await expect(
      receiverWorkspace.locator('.CommunicationSupportPanel__historyRow')
    ).toHaveCount(0);
    expect(await readPersistentSentinels(page)).toEqual(PERSISTENT_DATA);
  });
});
