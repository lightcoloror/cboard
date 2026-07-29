import React, { useEffect } from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import {
  getCordovaSpeechRecognitionPlugin,
  normalizeCordovaRecognitionResult,
  useCordovaSpeechRecognition
} from './cordovaSpeech';

function SpeechHarness({ onChange }) {
  const speech = useCordovaSpeechRecognition();

  useEffect(
    () => {
      onChange(speech);
    },
    [onChange, speech]
  );

  return null;
}

function createPlugin(overrides = {}) {
  return {
    isRecognitionAvailable: success => success(true),
    isOnDeviceRecognitionAvailable: success => success(true),
    hasPermission: success => success(true),
    requestPermission: success => success(),
    startListening: success => success(['我想喝水']),
    stopListening: success => success(),
    ...overrides
  };
}

describe('Cordova speech recognition adapter', () => {
  const originalCordova = window.cordova;
  const originalPlugins = window.plugins;

  afterEach(() => {
    window.cordova = originalCordova;
    window.plugins = originalPlugins;
  });

  test('only selects the native plugin on Android or iOS', () => {
    const plugin = createPlugin();
    expect(
      getCordovaSpeechRecognitionPlugin({
        cordova: { platformId: 'electron' },
        plugins: { speechRecognition: plugin }
      })
    ).toBeNull();
    expect(
      getCordovaSpeechRecognitionPlugin({
        cordova: { platformId: 'android' },
        plugins: { speechRecognition: plugin }
      })
    ).toBe(plugin);
  });

  test('normalizes the first native result', () => {
    expect(normalizeCordovaRecognitionResult([' 我想喝水 ', '喝水'])).toBe(
      '我想喝水'
    );
    expect(normalizeCordovaRecognitionResult([])).toBe('');
  });

  test('uses the on-device plugin path after capability detection', async () => {
    const startListening = jest.fn(success => success(['我想喝水']));
    const plugin = createPlugin({ startListening });
    window.cordova = { platformId: 'android' };
    window.plugins = { speechRecognition: plugin };
    let speech;
    const onResult = jest.fn();
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
        await Promise.resolve();
      });
      wrapper.update();
      expect(speech.isAvailable).toBe(true);
      expect(speech.onDeviceStatus).toBe('available');

      act(() => {
        speech.startListening(onResult, {
          language: 'zh-CN',
          processLocally: true
        });
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      wrapper.update();

      expect(startListening).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          language: 'zh-CN',
          onDevice: true,
          showPopup: false
        })
      );
      expect(onResult).toHaveBeenCalledWith('我想喝水');
    } finally {
      wrapper.unmount();
    }
  });

  test('stays available when only the on-device recognizer exists', async () => {
    const plugin = createPlugin({
      isRecognitionAvailable: success => success(false),
      isOnDeviceRecognitionAvailable: success => success(true)
    });
    window.cordova = { platformId: 'android' };
    window.plugins = { speechRecognition: plugin };
    let speech;
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
        await Promise.resolve();
      });
      wrapper.update();
      expect(speech.isAvailable).toBe(true);
      expect(speech.onDeviceStatus).toBe('available');
    } finally {
      wrapper.unmount();
    }
  });

  test('does not silently start online recognition when local mode is unavailable', async () => {
    const startListening = jest.fn();
    const plugin = createPlugin({
      isOnDeviceRecognitionAvailable: success => success(false),
      startListening
    });
    window.cordova = { platformId: 'ios' };
    window.plugins = { speechRecognition: plugin };
    let speech;
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
        await Promise.resolve();
      });
      wrapper.update();
      expect(speech.onDeviceStatus).toBe('unavailable');

      act(() => {
        speech.startListening(jest.fn(), { processLocally: true });
      });
      wrapper.update();
      expect(startListening).not.toHaveBeenCalled();
      expect(speech.error).toContain('设备内语音包尚未就绪');
    } finally {
      wrapper.unmount();
    }
  });
});
