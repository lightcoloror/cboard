import React, { useEffect } from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import {
  isWeChatWebView,
  shouldUseBrowserSpeechRecognition,
  useBrowserSpeechRecognition
} from './browserSpeech';

function SpeechHarness({ onChange }) {
  const speech = useBrowserSpeechRecognition();

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
});
