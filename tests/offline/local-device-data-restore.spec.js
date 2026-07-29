import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const CREATED_AT = 1785078000000;

async function createCompleteDeviceArchive() {
  const zip = new JSZip();
  const library = {
    format: 'picinterpreter-picture-library',
    version: 1,
    scope: 'full',
    createdAt: CREATED_AT,
    sourcePlatform: 'playwright-fixture',
    boards: [],
    personalImagePreferences: [],
    missingTokenResolutions: [],
    orderingState: {
      schemaVersion: 1,
      manualOrderByBoard: {},
      usageByTileKey: {}
    },
    assets: [],
    stats: {
      boardCount: 0,
      tileCount: 0,
      customPictureCount: 0,
      assetCount: 0,
      pictureAssetCount: 0,
      soundAssetCount: 0
    }
  };
  const expressions = {
    format: 'picinterpreter-local-device-data',
    version: 1,
    createdAt: CREATED_AT,
    savedPhrases: [
      {
        id: 'e2e-phrase',
        sentence: '我要喝水',
        output: [{ id: 'water', label: '水' }],
        createdAt: CREATED_AT - 6000,
        updatedAt: CREATED_AT - 6000
      }
    ],
    savedPhraseTombstones: [
      {
        id: 'e2e-deleted-phrase',
        deletedAt: CREATED_AT - 5000,
        deletedBy: 'playwright',
        serverVersion: 1
      }
    ],
    history: [
      {
        id: 'e2e-history',
        direction: 'express',
        sentence: '我要喝水',
        sessionId: 'e2e-session',
        patientId: 'patient-from-archive',
        workspaceId: 'workspace-from-archive',
        createdAt: CREATED_AT - 4000,
        updatedAt: CREATED_AT - 4000
      }
    ],
    receiverRecords: [
      {
        id: 'e2e-receiver',
        direction: 'receive',
        sentence: '需要帮助',
        labels: ['需要', '帮助'],
        recordStatus: 'confirmed',
        sessionId: 'e2e-session',
        patientId: 'patient-from-archive',
        workspaceId: 'workspace-from-archive',
        createdAt: CREATED_AT - 3000,
        updatedAt: CREATED_AT - 3000
      }
    ],
    receiverCorrections: [
      {
        id: 'e2e-correction',
        expressionId: 'e2e-receiver',
        sessionId: 'e2e-session',
        patientId: 'patient-from-archive',
        workspaceId: 'workspace-from-archive',
        action: 'replace_pictogram',
        originalToken: '协助',
        normalizedToken: '帮助',
        createdAt: CREATED_AT - 2000
      }
    ],
    expressionCandidateFeedbackDrafts: [
      {
        id: 'e2e-feedback',
        sessionId: 'e2e-session',
        outputSignature: 'e2e-output',
        candidates: [{ sentence: '我需要帮助。', feedback: 'up' }],
        createdAt: CREATED_AT - 1000,
        updatedAt: CREATED_AT - 1000
      }
    ]
  };
  const manifest = {
    format: 'picinterpreter-local-device-data',
    version: 1,
    createdAt: CREATED_AT,
    sourcePlatform: 'playwright-fixture',
    libraryManifest: 'library.json',
    files: {
      pictograms: 'pictograms.json',
      categories: 'categories.json',
      expressions: 'expressions.json'
    },
    stats: {
      pictogramCount: 0,
      categoryCount: 0,
      expressionCount: 2,
      savedPhraseCount: 1,
      savedPhraseTombstoneCount: 1,
      correctionCount: 1,
      draftCount: 1
    }
  };
  const emptySidecar = {
    format: 'picinterpreter-local-device-data',
    version: 1,
    createdAt: CREATED_AT,
    items: []
  };

  zip.file('library.json', JSON.stringify(library));
  zip.file('device-data.json', JSON.stringify(manifest));
  zip.file('pictograms.json', JSON.stringify(emptySidecar));
  zip.file('categories.json', JSON.stringify(emptySidecar));
  zip.file('expressions.json', JSON.stringify(expressions));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function readRestoredData(page) {
  return page.evaluate(() => {
    const read = key => JSON.parse(localStorage.getItem(key) || '[]');
    return {
      patientId: localStorage.getItem('cboard_communication_patient_id'),
      workspaceId: localStorage.getItem('cboard_communication_workspace_id'),
      savedPhrases: read('cboard_communication_saved_phrases'),
      savedPhraseTombstones: read(
        'cboard_communication_saved_phrase_tombstones'
      ),
      history: read('cboard_communication_history'),
      receiverRecords: read('cboard_communication_receiver_records'),
      receiverCorrections: read('cboard_communication_receiver_corrections'),
      feedbackDrafts: read(
        'cboard_communication_expression_candidate_feedback_drafts'
      )
    };
  });
}

test.describe('Production complete local-device restore', () => {
  test('reviews, restores, rebinds, and reloads every sidecar', async ({
    page
  }) => {
    const archive = await createCompleteDeviceArchive();

    await page.goto('/settings/import', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#import-button')).toBeVisible();
    await page.locator('#file').setInputFiles({
      name: 'picinterpreter-local-device-data.zip',
      mimeType: 'application/zip',
      buffer: archive
    });

    const review = page.getByRole('region', { name: 'Import review' });
    await expect(review).toBeVisible();
    await expect(review.locator('#local-device-data-summary')).toContainText(
      '1 saved phrases'
    );
    await expect(review.locator('#local-device-data-summary')).toContainText(
      '2 communication records'
    );
    await expect(page.locator('#confirm-import-button')).toBeEnabled();
    await page.locator('#confirm-import-button').click();

    await expect(
      page.getByText('Complete local data restored:', { exact: false })
    ).toBeVisible();

    const restored = await readRestoredData(page);
    expect(restored.savedPhrases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'e2e-phrase', sentence: '我要喝水' })
      ])
    );
    expect(restored.savedPhraseTombstones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'e2e-deleted-phrase' })
      ])
    );
    expect(restored.history).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'e2e-history' })])
    );
    expect(restored.receiverRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'e2e-receiver',
          patientId: restored.patientId,
          workspaceId: restored.workspaceId
        })
      ])
    );
    expect(restored.receiverCorrections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'e2e-correction',
          patientId: restored.patientId,
          workspaceId: restored.workspaceId
        })
      ])
    );
    expect(restored.feedbackDrafts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'e2e-feedback' })])
    );
    expect(restored.patientId).not.toBe('patient-from-archive');
    expect(restored.workspaceId).not.toBe('workspace-from-archive');

    await page.reload({ waitUntil: 'domcontentloaded' });
    const reloaded = await readRestoredData(page);
    expect(reloaded.savedPhrases).toEqual(restored.savedPhrases);
    expect(reloaded.savedPhraseTombstones).toEqual(
      restored.savedPhraseTombstones
    );
    expect(reloaded.history).toEqual(restored.history);
    expect(reloaded.receiverRecords).toEqual(restored.receiverRecords);
    expect(reloaded.receiverCorrections).toEqual(restored.receiverCorrections);
    expect(reloaded.feedbackDrafts).toEqual(restored.feedbackDrafts);
  });
});
