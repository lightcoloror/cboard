import { expect, test } from '@playwright/test';
import { persistAuthenticatedUser } from './helpers/authentication';

const PASSPHRASE = 'correct-horse-battery-staple';
const CREATED_AT = 1785078000000;
const PRIVATE_PICTURE_AUTH_TOKEN = 'playwright-private-picture-token';
const PRIVATE_DEVICE_DATA_AUTH_TOKEN = 'playwright-private-device-data-token';
const PRIVATE_PICTURE_STORAGE_KEY =
  'cboard_communication_personal_image_preferences';
const PRIVATE_DEVICE_DATA_STORAGE = {
  savedPhrases: 'cboard_communication_saved_phrases',
  savedPhraseTombstones: 'cboard_communication_saved_phrase_tombstones',
  history: 'cboard_communication_history',
  receiverRecords: 'cboard_communication_receiver_records',
  receiverCorrections: 'cboard_communication_receiver_corrections',
  feedbackDrafts: 'cboard_communication_expression_candidate_feedback_drafts'
};
test.use({ bypassCSP: true, serviceWorkers: 'block' });

const PRIVATE_PICTURE = {
  scope: 'device-private',
  tileId: 'water',
  boardId: 'food',
  labelSnapshot: '家里的水杯',
  image:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZSmQAAAAASUVORK5CYII=',
  pictogramAttribution: {
    provider: 'device-private',
    originalId: 'playwright-private-water',
    name: '家里的水杯照片',
    license: '家属提供，仅用于当前设备沟通',
    licenseUrl: null,
    author: '家属',
    authorUrl: null,
    sourceUrl: 'device-private://playwright/private-water'
  },
  patientId: 'playwright-patient',
  workspaceId: 'playwright-workspace',
  createdAt: 1785078000000,
  updatedAt: 1785078000000
};

const PRIVATE_DEVICE_DATA = {
  savedPhrases: [
    {
      id: 'cloud-e2e-phrase',
      sentence: '我要喝水',
      output: [{ id: 'water', label: '水' }],
      createdAt: CREATED_AT - 6000,
      updatedAt: CREATED_AT - 6000
    }
  ],
  savedPhraseTombstones: [
    {
      id: 'cloud-e2e-deleted-phrase',
      deletedAt: CREATED_AT - 5000,
      deletedBy: 'playwright',
      serverVersion: 1
    }
  ],
  history: [
    {
      id: 'cloud-e2e-history',
      direction: 'express',
      sentence: '我要喝水',
      sessionId: 'cloud-e2e-session',
      patientId: 'playwright-patient',
      workspaceId: 'playwright-workspace',
      createdAt: CREATED_AT - 4000,
      updatedAt: CREATED_AT - 4000
    }
  ],
  receiverRecords: [
    {
      id: 'cloud-e2e-receiver',
      direction: 'receive',
      sentence: '需要帮助',
      labels: ['需要', '帮助'],
      recordStatus: 'confirmed',
      sessionId: 'cloud-e2e-session',
      patientId: 'playwright-patient',
      workspaceId: 'playwright-workspace',
      createdAt: CREATED_AT - 3000,
      updatedAt: CREATED_AT - 3000
    }
  ],
  receiverCorrections: [
    {
      id: 'cloud-e2e-correction',
      expressionId: 'cloud-e2e-receiver',
      sessionId: 'cloud-e2e-session',
      patientId: 'playwright-patient',
      workspaceId: 'playwright-workspace',
      action: 'replace_pictogram',
      originalToken: '协助',
      normalizedToken: '帮助',
      createdAt: CREATED_AT - 2000
    }
  ],
  feedbackDrafts: [
    {
      id: 'cloud-e2e-feedback',
      sessionId: 'cloud-e2e-session',
      outputSignature: 'cloud-e2e-output',
      candidates: [{ sentence: '我需要帮助。', feedback: 'up' }],
      createdAt: CREATED_AT - 1000,
      updatedAt: CREATED_AT - 1000
    }
  ]
};

function extractMultipartFile(body, contentType) {
  const boundary = /boundary=([^;]+)/i.exec(contentType || '')?.[1];
  if (!boundary) throw new Error('Missing multipart boundary');

  const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'));
  const footer = Buffer.from(`\r\n--${boundary}`);
  const footerStart = body.indexOf(footer, headerEnd + 4);
  if (headerEnd < 0 || footerStart < 0) {
    throw new Error('Invalid multipart body');
  }
  return body.subarray(headerEnd + 4, footerStart);
}

async function installEncryptedArchiveApi(
  page,
  { uploadPattern, downloadPattern, authToken, fileName, format, archiveRef }
) {
  const context = page.context();
  await context.route(downloadPattern, async route => {
    if (!archiveRef.value) {
      await route.fulfill({ status: 404, body: 'Missing encrypted fixture' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: archiveRef.value
    });
  });
  await context.route(uploadPattern, async route => {
    expect(route.request().method()).toBe('POST');
    const request = route.request();
    expect(request.headers().authorization).toBe(`Bearer ${authToken}`);
    const body = request.postDataBuffer();
    archiveRef.value = extractMultipartFile(
      body,
      request.headers()['content-type']
    );

    expect(body.toString('utf8')).toContain(fileName);
    expect(archiveRef.value.subarray(0, 8).toString('ascii')).toBe('PIE2EE01');
    expect(archiveRef.value.subarray(0, 4).toString('hex')).not.toBe(
      '504b0304'
    );

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        format,
        contractVersion: 2,
        size: archiveRef.value.length
      })
    });
  });
}

async function writePrivateDeviceData(page, data = PRIVATE_DEVICE_DATA) {
  await page.evaluate(
    ({ storage, values }) => {
      Object.entries(storage).forEach(([name, key]) => {
        localStorage.setItem(key, JSON.stringify(values[name]));
      });
      localStorage.setItem(
        'cboard_communication_patient_id',
        'playwright-patient'
      );
      localStorage.setItem(
        'cboard_communication_workspace_id',
        'playwright-workspace'
      );
    },
    { storage: PRIVATE_DEVICE_DATA_STORAGE, values: data }
  );
}

async function clearPrivateDeviceData(page) {
  await page.evaluate(storage => {
    Object.values(storage).forEach(key => localStorage.removeItem(key));
  }, PRIVATE_DEVICE_DATA_STORAGE);
}

async function readPrivateDeviceData(page) {
  return page.evaluate(storage => {
    const read = key => JSON.parse(localStorage.getItem(key) || '[]');
    return Object.fromEntries(
      Object.entries(storage).map(([name, key]) => [name, read(key)])
    );
  }, PRIVATE_DEVICE_DATA_STORAGE);
}

test.describe('Production private cloud encryption', () => {
  test('uploads only ciphertext and restores only after local decryption review', async ({
    page
  }) => {
    const archiveRef = { value: null };
    await installEncryptedArchiveApi(page, {
      uploadPattern: /\/communication\/private-library(?:[?#].*)?$/,
      downloadPattern: /\/communication\/private-library\/download(?:[?#].*)?$/,
      authToken: PRIVATE_PICTURE_AUTH_TOKEN,
      fileName: 'picinterpreter-private-picture-library.pijenc',
      format: 'picinterpreter-private-picture-library-encrypted',
      archiveRef
    });

    await page.goto('/settings/export', { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      ({ key, value }) => {
        localStorage.setItem(key, JSON.stringify([value]));
        localStorage.setItem(
          'cboard_communication_patient_id',
          value.patientId
        );
        localStorage.setItem(
          'cboard_communication_workspace_id',
          value.workspaceId
        );
      },
      { key: PRIVATE_PICTURE_STORAGE_KEY, value: PRIVATE_PICTURE }
    );
    await persistAuthenticatedUser(page, PRIVATE_PICTURE_AUTH_TOKEN);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#private-picture-library-passphrase').fill(PASSPHRASE);
    await page
      .locator('#private-picture-library-passphrase-confirmation')
      .fill(PASSPHRASE);
    await expect(
      page.locator('#private-picture-library-upload-button')
    ).toBeEnabled();
    await page.locator('#private-picture-library-upload-button').click();
    await expect.poll(() => archiveRef.value?.length || 0).toBeGreaterThan(8);
    await expect(
      page.getByText(
        'The end-to-end encrypted private account picture backup was replaced.'
      )
    ).toBeVisible();
    await expect(
      page.locator('#private-picture-library-passphrase')
    ).toHaveValue('');

    await page.evaluate(
      key => localStorage.removeItem(key),
      PRIVATE_PICTURE_STORAGE_KEY
    );
    await page.goto('/settings/import', { waitUntil: 'domcontentloaded' });

    const passphrase = page.locator('#private-picture-library-passphrase');
    await passphrase.fill('incorrect-password');
    await page.locator('#private-picture-library-download-button').click();
    await expect(
      page.getByText(
        'The recovery password is incorrect, or the encrypted backup was changed.'
      )
    ).toBeVisible();
    expect(
      await page.evaluate(
        key => localStorage.getItem(key),
        PRIVATE_PICTURE_STORAGE_KEY
      )
    ).toBeNull();

    await passphrase.fill(PASSPHRASE);
    await page.locator('#private-picture-library-download-button').click();
    const review = page.getByRole('region', { name: 'Import review' });
    await expect(review).toBeVisible();
    await expect(review).toContainText('1 personal pictures');
    await expect(page.locator('#confirm-import-button')).toBeEnabled();
    await page.locator('#confirm-import-button').click();

    await expect
      .poll(async () => {
        return page.evaluate(key => {
          return JSON.parse(localStorage.getItem(key) || '[]').length;
        }, PRIVATE_PICTURE_STORAGE_KEY);
      })
      .toBe(1);
    const restored = await page.evaluate(
      key => JSON.parse(localStorage.getItem(key) || '[]'),
      PRIVATE_PICTURE_STORAGE_KEY
    );
    expect(restored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tileId: PRIVATE_PICTURE.tileId,
          boardId: PRIVATE_PICTURE.boardId,
          labelSnapshot: PRIVATE_PICTURE.labelSnapshot
        })
      ])
    );
    await expect(passphrase).toHaveValue('');
  });

  test('encrypts and restores every complete private-data sidecar', async ({
    page
  }) => {
    const archiveRef = { value: null };
    await installEncryptedArchiveApi(page, {
      uploadPattern: /\/communication\/private-device-data(?:[?#].*)?$/,
      downloadPattern: /\/communication\/private-device-data\/download(?:[?#].*)?$/,
      authToken: PRIVATE_DEVICE_DATA_AUTH_TOKEN,
      fileName: 'picinterpreter-private-device-data.pijenc',
      format: 'picinterpreter-private-device-data-encrypted',
      archiveRef
    });

    await page.goto('/settings/export', { waitUntil: 'domcontentloaded' });
    await writePrivateDeviceData(page);
    await persistAuthenticatedUser(page, PRIVATE_DEVICE_DATA_AUTH_TOKEN);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.locator('#private-device-data-passphrase').fill(PASSPHRASE);
    await page
      .locator('#private-device-data-passphrase-confirmation')
      .fill(PASSPHRASE);
    const uploadButton = page.locator('#private-device-data-upload-button');
    await expect(uploadButton).toBeEnabled();
    await uploadButton.click();
    await expect.poll(() => archiveRef.value?.length || 0).toBeGreaterThan(8);
    await expect(
      page.getByText(
        'The end-to-end encrypted complete data backup was replaced.'
      )
    ).toBeVisible();
    await expect(page.locator('#private-device-data-passphrase')).toHaveValue(
      ''
    );

    await clearPrivateDeviceData(page);
    await page.goto('/settings/import', { waitUntil: 'domcontentloaded' });

    const passphrase = page.locator('#private-device-data-passphrase');
    const downloadButton = page.locator('#private-device-data-download-button');
    await passphrase.fill('incorrect-password');
    await downloadButton.click();
    await expect(
      page.getByText(
        'The recovery password is incorrect, or the encrypted backup was changed.'
      )
    ).toBeVisible();
    expect(await readPrivateDeviceData(page)).toEqual({
      savedPhrases: [],
      savedPhraseTombstones: [],
      history: [],
      receiverRecords: [],
      receiverCorrections: [],
      feedbackDrafts: []
    });

    await passphrase.fill(PASSPHRASE);
    await downloadButton.click();
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

    await expect
      .poll(async () => {
        const restored = await readPrivateDeviceData(page);
        return Object.values(restored).reduce(
          (count, items) => count + items.length,
          0
        );
      })
      .toBe(6);
    const restored = await readPrivateDeviceData(page);
    expect(restored.savedPhrases[0]).toMatchObject({
      id: 'cloud-e2e-phrase',
      sentence: '我要喝水'
    });
    expect(restored.savedPhraseTombstones[0]).toMatchObject({
      id: 'cloud-e2e-deleted-phrase'
    });
    expect(restored.history[0]).toMatchObject({ id: 'cloud-e2e-history' });
    expect(restored.receiverRecords[0]).toMatchObject({
      id: 'cloud-e2e-receiver',
      patientId: 'playwright-patient',
      workspaceId: 'playwright-workspace'
    });
    expect(restored.receiverCorrections[0]).toMatchObject({
      id: 'cloud-e2e-correction',
      patientId: 'playwright-patient',
      workspaceId: 'playwright-workspace'
    });
    expect(restored.feedbackDrafts[0]).toMatchObject({
      id: 'cloud-e2e-feedback'
    });
    await expect(passphrase).toHaveValue('');

    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await readPrivateDeviceData(page)).toEqual(restored);
  });
});
