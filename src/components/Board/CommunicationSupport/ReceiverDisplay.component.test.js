import React from 'react';
import { shallow } from 'enzyme';
import { act } from 'react-dom/test-utils';
import FullScreenDialog from '../../UI/FullScreenDialog';
import ReceiverDisplay from './ReceiverDisplay.component';
import PatientActionButton from './PatientActionButton.component';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import fs from 'fs';
import path from 'path';

jest.mock('../Symbol', () => {
  return function MockSymbol(props) {
    return <div className="MockSymbol">{props.label}</div>;
  };
});

describe('ReceiverDisplay', () => {
  test('renders matched symbols inside the dedicated full-screen surface', () => {
    const wrapper = shallow(
      <ReceiverDisplay
        open
        title="接收端全屏展示"
        items={[
          { id: 'want', label: '想', image: '/want.svg' },
          {
            id: 'apple',
            label: '苹果',
            image: '/apple.svg',
            attribution: {
              provider: 'opensymbols',
              originalId: 'mulberry:apple',
              name: 'OpenSymbols / mulberry',
              license: 'CC BY-SA 2.0 UK',
              licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/uk/',
              author: 'Mulberry Symbols',
              authorUrl: 'https://mulberrysymbols.org/',
              sourceUrl: 'https://www.opensymbols.org/symbols/mulberry/apple',
              repoKey: 'mulberry'
            }
          }
        ]}
        feedbackQuestion="你明白了吗？"
        understoodLabel="明白了"
        notUnderstoodLabel="没明白"
        repeatRequestedLabel="再说一次"
        onClose={jest.fn()}
        onFeedback={jest.fn()}
        onReplay={jest.fn()}
      />
    );

    expect(wrapper.find(FullScreenDialog).prop('fullWidth')).toBe(true);
    expect(wrapper.find(FullScreenDialog).prop('buttons')).toBeUndefined();
    expect(
      wrapper.find('.CommunicationSupportPanel__displayScreen')
    ).toHaveLength(1);
    expect(
      wrapper.find('.CommunicationSupportPanel__displayItem')
    ).toHaveLength(2);
    expect(
      wrapper.find('.CommunicationSupportPanel__displayOverlay').props()
    ).toEqual(
      expect.objectContaining({
        role: 'list',
        'aria-label': '按顺序排列的图片序列',
        tabIndex: 0
      })
    );
    wrapper
      .find('.CommunicationSupportPanel__displayItem')
      .forEach(item => expect(item.prop('role')).toBe('listitem'));
    wrapper.find('MockSymbol').forEach(symbol => {
      expect(symbol.prop('className')).toContain(
        'CommunicationSupportPanel__symbol--display'
      );
    });
    expect(
      wrapper.find('.CommunicationSupportPanel__displayAttribution').text()
    ).toContain(
      '苹果：OpenSymbols / mulberry · 作者：Mulberry Symbols · CC BY-SA 2.0 UK'
    );
  });
  test('keeps repeated symbols as distinct full-screen items', () => {
    const wrapper = shallow(
      <ReceiverDisplay
        open
        title="接收端全屏展示"
        items={[
          { id: 'water', label: '水', image: '/water.svg' },
          { id: 'water', label: '水', image: '/water.svg' }
        ]}
        feedbackQuestion="你明白了吗？"
        understoodLabel="明白了"
        notUnderstoodLabel="没明白"
        repeatRequestedLabel="再说一次"
        onClose={jest.fn()}
        onFeedback={jest.fn()}
        onReplay={jest.fn()}
      />
    );

    const keys = wrapper
      .find('.CommunicationSupportPanel__displayItem')
      .map(item => item.key());

    expect(keys).toEqual(['water-0', 'water-1']);
  });

  test('reports all patient choices and replays only on repeat request', () => {
    const onFeedback = jest.fn();
    const onReplay = jest.fn();
    const wrapper = shallow(
      <ReceiverDisplay
        open
        title="接收端全屏展示"
        items={[{ id: 'water', label: '水', image: '/water.svg' }]}
        feedbackQuestion="你明白了吗？"
        understoodLabel="明白了"
        notUnderstoodLabel="没明白"
        repeatRequestedLabel="再说一次"
        onClose={jest.fn()}
        onFeedback={onFeedback}
        onReplay={onReplay}
      />
    );

    wrapper
      .find(PatientActionButton)
      .filterWhere(
        button => button.prop('action') === PATIENT_ACTION_IDS.understood
      )
      .simulate('click');
    wrapper
      .find(PatientActionButton)
      .filterWhere(
        button => button.prop('action') === PATIENT_ACTION_IDS.notUnderstood
      )
      .simulate('click');
    wrapper
      .find(PatientActionButton)
      .filterWhere(
        button => button.prop('action') === PATIENT_ACTION_IDS.repeat
      )
      .simulate('click');

    expect(onFeedback.mock.calls.map(call => call[0])).toEqual([
      'understood',
      'not_understood',
      'repeat_requested'
    ]);
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  test('shares the confirmed sequence without closing the display', async () => {
    const onClose = jest.fn();
    const onShare = jest.fn(() =>
      Promise.resolve({ ok: true, message: '图片分享面板已打开。' })
    );
    const wrapper = shallow(
      <ReceiverDisplay
        open
        title="接收端全屏展示"
        items={[
          { id: 'want', label: '想', image: '/want.svg' },
          { id: 'water', label: '水', image: '/water.svg' }
        ]}
        speechText="我想喝水"
        feedbackQuestion="你明白了吗？"
        understoodLabel="明白了"
        notUnderstoodLabel="没明白"
        repeatRequestedLabel="再说一次"
        onClose={onClose}
        onFeedback={jest.fn()}
        onReplay={jest.fn()}
        onShare={onShare}
      />
    );

    await act(async () => {
      wrapper
        .find(PatientActionButton)
        .filterWhere(
          button => button.prop('action') === PATIENT_ACTION_IDS.share
        )
        .prop('onClick')();
      await Promise.resolve();
    });
    wrapper.update();

    expect(onShare).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'want' }),
        expect.objectContaining({ id: 'water' })
      ]),
      { speechText: '我想喝水' }
    );
    expect(
      wrapper.find('.CommunicationSupportPanel__displayShare p').text()
    ).toContain('图片分享面板已打开');
    expect(onClose).not.toHaveBeenCalled();
  });

  test('uses a vertical strip in portrait and a horizontal strip in landscape', () => {
    const css = fs.readFileSync(
      path.join(__dirname, 'CommunicationSupportPanel.css'),
      'utf8'
    );
    const baseStart = css.indexOf(
      '.CommunicationSupportPanel__displayOverlay {'
    );
    const baseEnd = css.indexOf(
      '.CommunicationSupportPanel__displayItem {',
      baseStart
    );
    const landscapeStart = css.indexOf('@media (orientation: landscape)');
    const landscapeEnd = css.indexOf(
      '.CommunicationSupportPanel__displayFeedback {',
      landscapeStart
    );
    const baseRule = css.slice(baseStart, baseEnd);
    const landscapeRule = css.slice(landscapeStart, landscapeEnd);

    expect(baseRule).toContain('flex-direction: column');
    expect(baseRule).toContain('overflow-y: auto');
    expect(baseRule).toContain('scroll-snap-type: y proximity');
    expect(landscapeRule).toContain('flex-direction: row');
    expect(landscapeRule).toContain('overflow-x: auto');
    expect(landscapeRule).toContain('scroll-snap-type: x proximity');
  });
});
