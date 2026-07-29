import { expect, test } from '@playwright/test';
import {
  activate,
  blockRemoteHttpRequests,
  completeCommunicationOnboarding,
  dismissBoardTour,
  openCaregiverTools,
  waitForProductionServiceWorker
} from './helpers/communicationSupport';

test.describe('Production offline - communication support', () => {
  test('restores the receiver loop and local history without network access', async ({
    context,
    page
  }, testInfo) => {
    const useTouch = testInfo.project.name.startsWith('mobile-');

    await blockRemoteHttpRequests(page);
    await page.goto('/board/root', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: '图语家双向沟通' })
    ).toBeVisible();
    await waitForProductionServiceWorker(page);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: '图语家双向沟通' })
    ).toBeVisible();
    await dismissBoardTour(page, useTouch);

    const panel = page.locator('.CommunicationSupportPanel');
    await expect(panel.getByRole('button', { name: '患者表达' })).toBeVisible();
    for (const name of ['患者表达', '接收理解', '紧急求助']) {
      const target = panel.getByRole('button', { name });
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await expect(panel.locator('#communication-expression-panel')).toHaveCount(
      0
    );
    await activate(panel.getByRole('button', { name: '接收理解' }), useTouch);
    await completeCommunicationOnboarding(page, useTouch);
    let receiverWorkspace = page.getByRole('dialog', {
      name: '接收理解'
    });
    await expect(receiverWorkspace).toBeVisible();
    const receiverInput = receiverWorkspace.getByRole('textbox', {
      name: '例如：想喝水、想要苹果、头疼'
    });

    await receiverInput.fill('想喝水');
    await activate(
      receiverWorkspace.getByRole('button', { name: '生成图片序列' }),
      useTouch
    );
    const matchStatus = receiverWorkspace
      .getByRole('status')
      .filter({ hasText: '匹配结果' });
    await expect(matchStatus).toContainText('已全部匹配');
    const preview = receiverWorkspace.locator(
      '.CommunicationSupportPanel__resultMeta'
    );
    await expect(preview).toContainText('想');
    await expect(preview).toContainText('水');

    await activate(
      receiverWorkspace.getByRole('button', { name: '全屏展示' }),
      useTouch
    );
    const display = page
      .getByRole('dialog')
      .filter({ hasText: '接收端全屏展示' });
    await expect(display).toBeVisible();
    await activate(display.getByRole('button').first(), useTouch);

    await expect(
      receiverWorkspace
        .locator('.CommunicationSupportPanel__historyTitle')
        .filter({ hasText: /^想喝水$/ })
    ).toBeVisible();

    await receiverInput.fill('水');
    await activate(
      receiverWorkspace.getByRole('button', { name: '生成图片序列' }),
      useTouch
    );
    const waterReviewRow = receiverWorkspace
      .locator('.CommunicationSupportPanel__matchRow')
      .filter({
        has: page.locator('.CommunicationSupportPanel__token', {
          hasText: /^水$/
        })
      });
    await activate(
      waterReviewRow.getByRole('button', { name: '换图' }),
      useTouch
    );
    const replacementDialog = page
      .getByRole('dialog')
      .filter({ hasText: '替换图片' });
    await activate(
      replacementDialog
        .locator('.CommunicationSupportPanel__swapOption')
        .filter({ hasText: '是' })
        .first(),
      useTouch
    );
    await expect(waterReviewRow).toContainText('是');

    await activate(
      receiverWorkspace.getByRole('button', { name: '返回图板' }),
      useTouch
    );
    await expect(receiverWorkspace).toBeHidden();
    await openCaregiverTools(panel, useTouch);
    await activate(
      panel.getByRole('button', { name: '常用语与历史' }),
      useTouch
    );
    const managementDialog = page.getByRole('dialog', {
      name: '常用语、历史、个人图片、修正记忆、匹配诊断与本机数据'
    });
    await activate(
      managementDialog.getByRole('button', { name: '修正记忆（1）' }),
      useTouch
    );
    const correctionMemoryRow = managementDialog.locator(
      '[data-correction-token="水"]'
    );
    await expect(correctionMemoryRow).toContainText('偏好图：是');
    await activate(
      correctionMemoryRow.getByRole('button', { name: '不再记住' }),
      useTouch
    );
    await expect(managementDialog).toContainText(
      '已停止记住“水”，纠错审计仍会保留。'
    );
    await expect(correctionMemoryRow).toHaveCount(0);
    const correctionAudit = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem('cboard_communication_receiver_corrections') ||
          '[]'
      )
    );
    expect(correctionAudit).toEqual([
      expect.objectContaining({
        normalizedToken: '水',
        isUsedForLearning: false
      })
    ]);
    await activate(
      managementDialog.getByRole('button', { name: '返回沟通' }),
      useTouch
    );

    await activate(panel.getByRole('button', { name: '患者表达' }), useTouch);
    const currentOutput = panel.getByText(/^当前输出：/);
    await expect(currentOutput).toContainText('想');
    await expect(currentOutput).toContainText('水');
    await activate(panel.getByRole('button', { name: '生成并播报' }), useTouch);
    await expect(
      panel.locator('.CommunicationSupportPanel__candidate').first()
    ).toBeVisible();
    await activate(panel.getByRole('button', { name: '停止播报' }), useTouch);
    const firstCandidate = panel
      .locator('.CommunicationSupportPanel__candidateRow')
      .first();
    const helpfulFeedback = firstCandidate.getByRole('button', {
      name: /^有帮助：/
    });
    await activate(helpfulFeedback, useTouch);
    await expect(helpfulFeedback).toHaveAttribute('aria-pressed', 'true');
    await expect(
      panel.getByText('反馈已保存在本机，登录后可同步。')
    ).toBeVisible();
    const feedbackDrafts = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem(
          'cboard_communication_expression_candidate_feedback_drafts'
        ) || '[]'
      )
    );
    expect(feedbackDrafts).toEqual([
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({ feedback: 'up' })
        ])
      })
    ]);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: '图语家双向沟通' })
    ).toBeVisible();
    await dismissBoardTour(page, useTouch);
    await activate(panel.getByRole('button', { name: '患者表达' }), useTouch);
    await expect(helpfulFeedback).toHaveAttribute('aria-pressed', 'true');
    const restoredFeedbackDrafts = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem(
          'cboard_communication_expression_candidate_feedback_drafts'
        ) || '[]'
      )
    );
    expect(restoredFeedbackDrafts).toEqual(feedbackDrafts);

    await activate(panel.getByRole('button', { name: '确认此句' }), useTouch);
    await expect(panel.getByRole('button', { name: '已确认' })).toBeDisabled();
    const confirmedFeedback = await page.evaluate(() => ({
      drafts: JSON.parse(
        localStorage.getItem(
          'cboard_communication_expression_candidate_feedback_drafts'
        ) || '[]'
      ),
      history: JSON.parse(
        localStorage.getItem('cboard_communication_history') || '[]'
      )
    }));
    expect(confirmedFeedback.drafts).toEqual([]);
    expect(confirmedFeedback.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: 'express',
          candidates: expect.arrayContaining([
            expect.objectContaining({ feedback: 'up' })
          ])
        })
      ])
    );

    const confirmedExpression = confirmedFeedback.history.find(
      item => item.direction === 'express'
    );
    const confirmedReceiver = confirmedFeedback.history.find(
      item => item.direction === 'receive'
    );
    expect(confirmedExpression).toBeDefined();
    expect(confirmedReceiver).toBeDefined();
    const reviewedCandidateSentence =
      confirmedExpression.candidates[0].sentence;

    await openCaregiverTools(panel, useTouch);
    await activate(
      panel.getByRole('button', { name: '常用语与历史' }),
      useTouch
    );
    const historyReviewDialog = page.getByRole('dialog', {
      name: '常用语、历史、个人图片、修正记忆、匹配诊断与本机数据'
    });
    await activate(
      historyReviewDialog.getByRole('button', { name: /^沟通历史/ }),
      useTouch
    );
    const historicalFeedback = historyReviewDialog.getByRole('button', {
      name: `不符合：${reviewedCandidateSentence}`
    });
    await activate(historicalFeedback, useTouch);
    await expect(historicalFeedback).toHaveAttribute('aria-pressed', 'true');
    await expect(historyReviewDialog).toContainText(
      '候选句反馈已保存在本机，登录后可同步。'
    );

    const receiverHistoryRow = historyReviewDialog
      .locator('.CommunicationSupportPanel__managementRow')
      .filter({ hasText: '接收' })
      .first();
    await activate(
      receiverHistoryRow.getByRole('button', { name: '修正图片' }),
      useTouch
    );
    const firstHistoryReviewItem = receiverHistoryRow
      .locator('.CommunicationSupportPanel__historyReviewItem')
      .first();
    await activate(
      firstHistoryReviewItem.getByRole('button', { name: '换图' }),
      useTouch
    );
    const historyPictogramPicker = page.getByRole('dialog', {
      name: '选择替换图片'
    });
    await activate(
      historyPictogramPicker
        .getByRole('button', { name: '选择图片：是' })
        .first(),
      useTouch
    );
    await expect(historyReviewDialog).toContainText(
      '历史图片修正已保存，原记录和修正证据均已保留。'
    );
    await expect(receiverHistoryRow).toContainText('已有照护者图片修正');
    await expect(receiverHistoryRow).toContainText('当前图片：是');

    const historicalReviewState = await page.evaluate(() => ({
      history: JSON.parse(
        localStorage.getItem('cboard_communication_history') || '[]'
      ),
      corrections: JSON.parse(
        localStorage.getItem('cboard_communication_receiver_corrections') ||
          '[]'
      )
    }));
    expect(
      historicalReviewState.history.find(
        item => item.id === confirmedReceiver.id
      )
    ).toEqual(confirmedReceiver);
    expect(
      historicalReviewState.history.find(
        item => item.id === confirmedExpression.id
      ).candidates[0].feedback
    ).toBe('down');
    expect(historicalReviewState.corrections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expressionId: confirmedReceiver.id,
          context: 'caregiver_history_review',
          revisionBefore: expect.objectContaining({
            labels: confirmedReceiver.labels
          }),
          revisionAfter: expect.objectContaining({
            labels: expect.arrayContaining(['是'])
          })
        })
      ])
    );
    await activate(
      historyReviewDialog.getByRole('button', { name: '返回沟通' }),
      useTouch
    );

    await activate(panel.getByRole('button', { name: '接收理解' }), useTouch);
    receiverWorkspace = page.getByRole('dialog', { name: '接收理解' });
    await expect(receiverWorkspace).toBeVisible();
    const historyRows = receiverWorkspace.locator(
      '.CommunicationSupportPanel__historyRow'
    );
    await expect(historyRows).toHaveCount(2);
    await expect(historyRows.filter({ hasText: '表达' })).toHaveCount(1);
    await expect(historyRows.filter({ hasText: '接收' })).toHaveCount(1);

    const conversationScene = receiverWorkspace.getByRole('group', {
      name: '当前场景'
    });
    const hospitalScene = conversationScene.getByRole('button', {
      name: /医院/
    });
    await activate(hospitalScene, useTouch);
    await expect(hospitalScene).toHaveAttribute('aria-pressed', 'true');
    await expect(conversationScene).toContainText('当前场景：医院');
    await activate(hospitalScene, useTouch);
    await expect(hospitalScene).toHaveAttribute('aria-pressed', 'false');
    await expect(conversationScene).toContainText('当前场景：未选择');
    await activate(hospitalScene, useTouch);
    await expect(hospitalScene).toHaveAttribute('aria-pressed', 'true');
    await expect(conversationScene).toContainText('当前场景：医院');
    const sessionBeforeReset = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem('cboard_communication_active_session') || 'null'
      )
    );
    expect(sessionBeforeReset).toEqual(
      expect.objectContaining({ scene: 'hospital' })
    );

    await activate(
      receiverWorkspace.getByRole('button', { name: '新对话' }),
      useTouch
    );
    await expect(
      receiverWorkspace.getByText('开始新对话？当前 AI 上下文和场景将被清除。')
    ).toBeVisible();
    await activate(
      receiverWorkspace.getByRole('button', { name: '确认开始' }),
      useTouch
    );
    await expect(
      receiverWorkspace.getByText('已开始新对话，原有历史仍会保留。')
    ).toBeVisible();
    await expect(conversationScene).toContainText('当前场景：未选择');
    await expect(historyRows).toHaveCount(2);
    const sessionAfterReset = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem('cboard_communication_active_session') || 'null'
      )
    );
    expect(sessionAfterReset.scene || null).toBeNull();
    expect(sessionAfterReset.id).not.toBe(sessionBeforeReset.id);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: '图语家双向沟通' })
    ).toBeVisible();
    const restoredPanel = page.locator('.CommunicationSupportPanel');
    await activate(
      restoredPanel.getByRole('button', { name: '接收理解' }),
      useTouch
    );
    receiverWorkspace = page.getByRole('dialog', { name: '接收理解' });
    await expect(receiverWorkspace).toBeVisible();
    await expect(
      receiverWorkspace
        .locator('.CommunicationSupportPanel__historyTitle')
        .filter({ hasText: /^想喝水$/ })
    ).toBeVisible();
    await expect(
      receiverWorkspace.locator('.CommunicationSupportPanel__historyRow')
    ).toHaveCount(2);
    const restoredHistory = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('cboard_communication_history') || '[]')
    );
    expect(restoredHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: 'express',
          candidates: expect.arrayContaining([
            expect.objectContaining({ feedback: 'down' })
          ])
        })
      ])
    );

    await activate(
      receiverWorkspace.getByRole('button', { name: '返回图板' }),
      useTouch
    );
    await openCaregiverTools(restoredPanel, useTouch);
    await activate(
      restoredPanel.getByRole('button', { name: '常用语与历史' }),
      useTouch
    );
    const restoredManagementDialog = page.getByRole('dialog', {
      name: '常用语、历史、个人图片、修正记忆、匹配诊断与本机数据'
    });
    await activate(
      restoredManagementDialog.getByRole('button', { name: /^沟通历史/ }),
      useTouch
    );
    await expect(
      restoredManagementDialog.getByRole('button', {
        name: `不符合：${reviewedCandidateSentence}`
      })
    ).toHaveAttribute('aria-pressed', 'true');
    const restoredReceiverHistoryRow = restoredManagementDialog
      .locator('.CommunicationSupportPanel__managementRow')
      .filter({ hasText: '接收' })
      .first();
    await expect(restoredReceiverHistoryRow).toContainText(
      '已有照护者图片修正'
    );
    await expect(restoredReceiverHistoryRow).toContainText('当前图片：是');
  });
});
