import React, { useEffect } from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import {
  ON_DEVICE_SPEECH_STATUS,
  checkOnDeviceSpeechRecognition,
  installOnDeviceSpeechRecognition,
  isWeChatWebView,
  normalizeBrowserRecognitionLanguage,
  shouldUseBrowserSpeechRecognition,
  useBrowserSpeechRecognition
} from './browserSpeech';

function SpeechHarness({ onChange, options }) {
  const speech = useBrowserSpeechRecognition('zh-CN', options);

  useEffect(
    () => {
      onChange(speech);
    },
    [onChange, speech]
  );

  return null;
}

describe('browser speech environment', () => {
  test('disables browser recognition inside WeChat webviews', () => {
    const userAgent = 'Mozilla/5.0 MicroMessenger/8.0.49';

    expect(isWeChatWebView(userAgent)).toBe(true);
    expect(shouldUseBrowserSpeechRecognition(userAgent)).toBe(false);
  });

  test('keeps browser recognition available in regular browsers', () => {
    const userAgent = 'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36';

    expect(isWeChatWebView(userAgent)).toBe(false);
    expect(shouldUseBrowserSpeechRecognition(userAgent)).toBe(true);
  });

  test('checks and installs browser-managed on-device language packs', async () => {
    const SpeechRecognitionImpl = {
      available: jest
        .fn()
        .mockResolvedValueOnce('downloadable')
        .mockResolvedValueOnce('available'),
      install: jest.fn().mockResolvedValue(true)
    };

    await expect(
      checkOnDeviceSpeechRecognition(SpeechRecognitionImpl, 'zh-CN')
    ).resolves.toBe(ON_DEVICE_SPEECH_STATUS.downloadable);
    await expect(
      installOnDeviceSpeechRecognition(SpeechRecognitionImpl, 'zh-CN')
    ).resolves.toBe(ON_DEVICE_SPEECH_STATUS.available);
    expect(SpeechRecognitionImpl.available).toHaveBeenCalledWith({
      langs: ['zh-CN'],
      processLocally: true
    });
    expect(SpeechRecognitionImpl.install).toHaveBeenCalledWith({
      langs: ['zh-CN'],
      processLocally: true
    });
  });

  test('starts recognition with processLocally after the pack is available', async () => {
    const instances = [];
    class FakeSpeechRecognition {
      static available = jest.fn().mockResolvedValue('available');
      static install = jest.fn().mockResolvedValue(true);

      constructor() {
        this.processLocally = false;
        instances.push(this);
      }

      start() {}
      stop() {}
      abort() {}
    }
    const originalSpeechRecognition = window.SpeechRecognition;
    let speech;
    window.SpeechRecognition = FakeSpeechRecognition;
    const wrapper = mount(
      <SpeechHarness
        onChange={nextSpeech => {
          speech = nextSpeech;
        }}
      />
    );

    try {
      await act(async () => {
        await Promise.resolve();
      });
      wrapper.update();
      expect(speech.onDeviceStatus).toBe(ON_DEVICE_SPEECH_STATUS.available);

      act(() => {
        speech.startListening(jest.fn(), {
          language: 'zh-CN',
          processLocally: true
        });
      });
      expect(instances[0].processLocally).toBe(true);
      expect(instances[0].lang).toBe('zh-CN');
    } finally {
      wrapper.unmount();
      window.SpeechRecognition = originalSpeechRecognition;
    }
  });

  test('uses Cantonese only when explicitly requested for the current recording', () => {
    const instances = [];
    class FakeSpeechRecognition {
      constructor() {
        instances.push(this);
      }
      start() {}
      stop() {}
      abort() {}
    }
    const originalSpeechRecognition = window.SpeechRecognition;
    let speech;
    window.SpeechRecognition = FakeSpeechRecognition;
    const wrapper = mount(
      <SpeechHarness
        onChange={nextSpeech => {
          speech = nextSpeech;
        }}
      />
    );

    try {
      act(() => {
        speech.startListening(jest.fn(), { language: 'yue-HK' });
      });
      expect(instances[0].lang).toBe('yue-HK');
      expect(normalizeBrowserRecognitionLanguage('unknown')).toBe('zh-CN');
    } finally {
      wrapper.unmount();
      window.SpeechRecognition = originalSpeechRecognition;
    }
  });

  test('ignores results emitted by a superseded recognition instance', () => {
    const instances = [];

    class FakeSpeechRecognition {
      constructor() {
        instances.push(this);
      }

      start() {
        if (this.onstart) {
          this.onstart();
        }
      }

      stop() {}

      abort() {}
    }

    const originalSpeechRecognition = window.SpeechRecognition;
    let speech;
    const onFirstResult = jest.fn();
    const onSecondResult = jest.fn();

    window.SpeechRecognition = FakeSpeechRecognition;

    const wrapper = mount(
      <SpeechHarness
        onChange={nextSpeech => {
          speech = nextSpeech;
        }}
      />
    );

    try {
      act(() => {
        speech.startListening(onFirstResult);
      });
      wrapper.update();

      const firstRecognition = instances[0];

      act(() => {
        speech.startListening(onSecondResult);
      });
      wrapper.update();

      const secondRecognition = instances[1];
      const buildResult = transcript => ({
        resultIndex: 0,
        results: [
          {
            0: { transcript },
            isFinal: true
          }
        ]
      });

      act(() => {
        firstRecognition.onresult(buildResult('旧结果'));
        secondRecognition.onresult(buildResult('新结果'));
      });

      expect(onFirstResult).not.toHaveBeenCalled();
      expect(onSecondResult).toHaveBeenCalledWith('新结果');
    } finally {
      wrapper.unmount();
      window.SpeechRecognition = originalSpeechRecognition;
    }
  });

  test('exposes real audio levels and cleans the monitor across speech lifecycles', () => {
    const instances = [];
    class FakeSpeechRecognition {
      constructor() {
        instances.push(this);
      }

      start() {
        if (this.onstart) this.onstart();
      }

      stop() {}
      abort() {}
    }
    const monitor = {
      start: jest.fn(() => Promise.resolve(true)),
      stop: jest.fn()
    };
    let monitorCallbacks;
    const createAudioLevelMonitor = jest.fn(callbacks => {
      monitorCallbacks = callbacks;
      return monitor;
    });
    const originalSpeechRecognition = window.SpeechRecognition;
    let speech;
    window.SpeechRecognition = FakeSpeechRecognition;
    const wrapper = mount(
      <SpeechHarness
        options={{ createAudioLevelMonitor }}
        onChange={nextSpeech => {
          speech = nextSpeech;
        }}
      />
    );

    try {
      act(() => {
        speech.startListening(jest.fn());
      });
      wrapper.update();

      expect(createAudioLevelMonitor).toHaveBeenCalledTimes(1);
      expect(monitor.start).toHaveBeenCalledTimes(1);

      act(() => {
        monitorCallbacks.onAvailabilityChange(true);
        monitorCallbacks.onLevel(0.65);
      });
      wrapper.update();

      expect(speech.audioLevelAvailable).toBe(true);
      expect(speech.audioLevel).toBe(0.65);

      act(() => {
        speech.stopListening();
      });
      wrapper.update();
      expect(monitor.stop).toHaveBeenCalledTimes(1);
      expect(speech.audioLevelAvailable).toBe(false);
      expect(speech.audioLevel).toBe(0);

      act(() => {
        speech.startListening(jest.fn());
      });
      wrapper.update();
      act(() => {
        instances[1].onend();
      });
      wrapper.update();
      expect(monitor.stop).toHaveBeenCalledTimes(2);
    } finally {
      wrapper.unmount();
      window.SpeechRecognition = originalSpeechRecognition;
    }

    expect(monitor.stop).toHaveBeenCalledTimes(2);
  });

  test('releases the audio monitor when the speech hook unmounts', () => {
    class FakeSpeechRecognition {
      start() {
        if (this.onstart) this.onstart();
      }
      stop() {}
      abort() {}
    }
    const monitor = {
      start: jest.fn(() => Promise.resolve(true)),
      stop: jest.fn()
    };
    const originalSpeechRecognition = window.SpeechRecognition;
    let speech;
    window.SpeechRecognition = FakeSpeechRecognition;
    const wrapper = mount(
      <SpeechHarness
        options={{ createAudioLevelMonitor: () => monitor }}
        onChange={nextSpeech => {
          speech = nextSpeech;
        }}
      />
    );

    act(() => {
      speech.startListening(jest.fn());
    });
    wrapper.unmount();
    window.SpeechRecognition = originalSpeechRecognition;

    expect(monitor.stop).toHaveBeenCalledTimes(1);
  });
});
