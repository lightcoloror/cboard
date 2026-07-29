import { expect } from '@playwright/test';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

export async function activate(target, useTouch) {
  if (useTouch) {
    await target.tap();
    return;
  }

  await target.click();
}

export async function blockRemoteHttpRequests(page) {
  await page.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    const isHttp =
      requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:';

    if (isHttp && !LOCAL_HOSTS.has(requestUrl.hostname)) {
      return route.abort('internetdisconnected');
    }

    return route.continue();
  });
}

export async function waitForProductionServiceWorker(page) {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker is unavailable in this browser');
    }

    await navigator.serviceWorker.ready;
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

export async function dismissBoardTour(page, useTouch) {
  const skipButton = page.locator('[data-test-id="button-skip"]');

  await skipButton.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});

  if (await skipButton.isVisible()) {
    await activate(skipButton, useTouch);
    await expect(page.locator('.react-joyride__overlay')).toBeHidden();
  }
}

export async function openCaregiverTools(panel, useTouch) {
  const toggle = panel.getByRole('button', { name: '照护工具' });

  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await activate(toggle, useTouch);
  }

  await expect(panel.locator('#communication-caregiver-tools')).toBeVisible();
}

export async function installBrowserSpeechHarness(page) {
  await page.addInitScript(() => {
    const harness = {
      audioMode: 'silent',
      contextCloseCount: 0,
      currentRecognition: null,
      trackStopCount: 0
    };

    class FakeSpeechRecognition {
      start() {
        harness.currentRecognition = this;
        if (this.onstart) this.onstart();
      }

      stop() {
        if (this.onend) this.onend();
      }

      abort() {
        if (this.onerror) this.onerror({ error: 'aborted' });
        if (this.onend) this.onend();
      }
    }

    class FakeAudioContext {
      createMediaStreamSource() {
        return {
          connect() {},
          disconnect() {}
        };
      }

      createAnalyser() {
        return {
          fftSize: 0,
          smoothingTimeConstant: 0,
          getByteTimeDomainData(samples) {
            samples.fill(128);
            if (harness.audioMode !== 'speaking') return;
            for (let index = 0; index < samples.length; index += 1) {
              samples[index] = index % 2 ? 255 : 1;
            }
          }
        };
      }

      close() {
        harness.contextCloseCount += 1;
        return Promise.resolve();
      }
    }

    harness.emitFinal = text => {
      const recognition = harness.currentRecognition;
      if (!recognition) throw new Error('Speech recognition is not active');
      const result = [{ transcript: text }];
      result.isFinal = true;
      if (recognition.onresult) {
        recognition.onresult({ resultIndex: 0, results: [result] });
      }
      if (recognition.onend) recognition.onend();
    };

    Object.defineProperty(window, '__cboardSpeechHarness', {
      configurable: true,
      value: harness
    });
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeSpeechRecognition
    });
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext
    });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => ({
        getTracks: () => [
          {
            stop() {
              harness.trackStopCount += 1;
            }
          }
        ]
      })
    });
  });
}

export async function installBrowserShareHarness(page) {
  await page.addInitScript(() => {
    const harness = { calls: [] };

    Object.defineProperty(window, '__cboardShareHarness', {
      configurable: true,
      value: harness
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: payload =>
        Boolean(payload && payload.files && payload.files.length)
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async payload => {
        harness.calls.push({
          files: Array.from(payload.files || []).map(file => ({
            name: file.name,
            size: file.size,
            type: file.type
          })),
          text: payload.text || '',
          title: payload.title || ''
        });
      }
    });
  });
}

export async function installBrowserTtsHarness(page) {
  await page.addInitScript(() => {
    const harness = { calls: [], cancelCount: 0 };
    const voice = {
      default: true,
      lang: 'zh-CN',
      localService: true,
      name: 'CBoard E2E Chinese',
      voiceURI: 'cboard-e2e-zh-CN'
    };

    class FakeSpeechSynthesisUtterance {
      constructor(text = '') {
        this.text = text;
      }
    }

    const speechSynthesis = {
      cancel() {
        harness.cancelCount += 1;
      },
      getVoices() {
        return [voice];
      },
      speak(utterance) {
        harness.calls.push({
          lang: utterance.lang || '',
          rate: utterance.rate,
          text: utterance.text || '',
          voiceURI: utterance.voiceURI || ''
        });
        window.setTimeout(() => {
          if (typeof utterance.onend === 'function') utterance.onend({});
        }, 0);
      }
    };

    Object.defineProperty(window, '__cboardTtsHarness', {
      configurable: true,
      value: harness
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeSpeechSynthesisUtterance
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: speechSynthesis
    });
  });
}

export async function completeCommunicationOnboarding(page, useTouch) {
  const onboarding = page.getByRole('dialog', {
    name: '双向沟通 · 第一次使用'
  });

  await expect(onboarding).toBeVisible();
  await activate(
    onboarding.getByRole('button', { name: '开始使用' }),
    useTouch
  );
  await expect(onboarding).toBeHidden();
}
