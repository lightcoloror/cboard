import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import ExpressionLoopPanel from './ExpressionLoopPanel.component';
import PatientActionButton from './PatientActionButton.component';
import { PATIENT_ACTION_IDS } from '../../../common/communicationSupport/patientActionLanguage';
import { createBrowserCommunicationSharePort } from '../../../common/communicationSupport/browserCommunicationShare';

const output = [
  {
    id: 'synthetic-person-a',
    label: '合成人甲',
    image: 'blob:synthetic-private-a'
  },
  { id: 'no', label: '不' },
  { id: 'water', label: '喝水' }
];
const done = { ok: true, message: '合成分享完成' };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let wrappers = [];
afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount());
  wrappers = [];
  jest.clearAllTimers();
  jest.useRealTimers();
});
function fixture(overrides = {}) {
  const props = {
    output,
    boards: [],
    activeBoardId: 'synthetic',
    pictogramOrdering: {},
    savedPhrases: [],
    onApplyOutput: jest.fn(),
    onPictogramUsed: jest.fn(),
    onSpeak: jest.fn((text, complete) => complete()),
    onCancelSpeech: jest.fn(),
    onSavePhrase: jest.fn(),
    onAppendHistory: jest.fn(entry => ({ ...entry, id: 'synthetic-history' })),
    onSaveCandidateFeedbackDraft: jest.fn(entry => ({
      ...entry,
      id: 'synthetic-draft'
    })),
    onDiscardCandidateFeedbackDraft: jest.fn(() => true),
    candidateFeedbackDrafts: [],
    conversationSessionId: 'synthetic-session-a',
    onUseSavedPhrase: jest.fn(),
    onShareExpression: jest.fn().mockResolvedValue(done),
    candidateAutoplayDelaySeconds: 0,
    ...overrides
  };
  let wrapper;
  act(() => {
    wrapper = mount(<ExpressionLoopPanel {...props} />);
  });
  wrapper.update();
  wrappers.push(wrapper);
  const action = id => {
    wrapper.update();
    return wrapper
      .find(PatientActionButton)
      .filterWhere(button => button.prop('action') === id)
      .first()
      .prop('onClick');
  };
  return {
    props,
    wrapper,
    action,
    share: () => action(PATIENT_ACTION_IDS.share)()
  };
}

test('two immediate clicks on one share handler dispatch only once', async () => {
  const pending = deferred(),
    f = fixture({ onShareExpression: jest.fn(() => pending.promise) });
  let tasks;
  act(() => {
    const click = f.action(PATIENT_ACTION_IDS.share);
    tasks = [click(), click()];
  });
  const calls = f.props.onShareExpression.mock.calls.length;
  await act(async () => {
    pending.resolve(done);
    await Promise.all(tasks);
  });
  expect(calls).toBe(1);
});

test('reject and undo do not resurrect a previous share or overwrite a new attempt', async () => {
  const old = deferred(),
    next = deferred();
  const onShareExpression = jest
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise);
  const f = fixture({ onShareExpression });
  let first, second;
  act(() => {
    first = f.share();
    f.action(PATIENT_ACTION_IDS.notUnderstood)();
  });
  expect(onShareExpression.mock.calls[0][1].isCurrent()).toBe(false);
  act(() => {
    f.action(PATIENT_ACTION_IDS.undo)();
  });
  act(() => {
    second = f.share();
  });
  await act(async () => {
    old.resolve({ ok: true, message: '过期结果' });
    await first;
  });
  f.wrapper.update();
  expect(f.wrapper.text()).not.toContain('过期结果');
  expect(
    f.wrapper
      .find('#communication-expression-share')
      .first()
      .prop('disabled')
  ).toBe(true);
  await act(async () => {
    next.resolve(done);
    await second;
  });
  f.wrapper.update();
  expect(f.wrapper.text()).toContain(done.message);
});

test('choosing another sentence invalidates pending sharing before speech completes', async () => {
  const pending = deferred(),
    f = fixture({
      onShareExpression: jest.fn(() => pending.promise),
      onSpeak: jest.fn()
    });
  let task;
  act(() => {
    task = f.share();
  });
  act(() => {
    f.wrapper
      .find('button.CommunicationSupportPanel__candidate')
      .at(1)
      .simulate('click');
  });
  expect(f.props.onShareExpression.mock.calls[0][1].isCurrent()).toBe(false);
  await act(async () => {
    pending.resolve(done);
    await task;
    f.props.onSpeak.mock.calls[0][1]();
  });
  f.wrapper.update();
  expect(f.wrapper.text()).not.toContain(done.message);
});

test.each(['person', 'session', 'clear'])(
  '%s change invalidates old sharing and allows the current expression to share',
  async change => {
    const pending = deferred(),
      f = fixture({
        onShareExpression: jest
          .fn()
          .mockReturnValueOnce(pending.promise)
          .mockResolvedValueOnce(done)
      });
    let task;
    act(() => {
      task = f.share();
    });
    const patch =
      change === 'person'
        ? {
            output: [
              {
                ...output[0],
                id: 'synthetic-person-b',
                image: 'blob:synthetic-private-b'
              },
              ...output.slice(1)
            ]
          }
        : change === 'session'
        ? { conversationSessionId: 'synthetic-session-b' }
        : { output: [] };
    act(() => {
      f.wrapper.setProps(patch);
    });
    expect(f.props.onShareExpression.mock.calls[0][1].isCurrent()).toBe(false);
    await act(async () => {
      pending.resolve({ ok: true, message: '过期结果' });
      await task;
    });
    f.wrapper.update();
    expect(f.wrapper.text()).not.toContain('过期结果');
    if (change === 'clear')
      act(() => {
        f.wrapper.setProps({ output });
      });
    await act(async () => {
      await f.share();
    });
    f.wrapper.update();
    expect(f.wrapper.text()).toContain(done.message);
  }
);

test('unmount invalidates the exact pending request', async () => {
  const pending = deferred(),
    f = fixture({ onShareExpression: jest.fn(() => pending.promise) });
  let task;
  act(() => {
    task = f.share();
  });
  act(() => {
    f.wrapper.unmount();
  });
  wrappers = [];
  expect(f.props.onShareExpression.mock.calls[0][1].isCurrent()).toBe(false);
  await act(async () => {
    pending.resolve(done);
    await task;
  });
});

test('a current failure keeps the original expression and permits explicit retry', async () => {
  const f = fixture({
    onShareExpression: jest
      .fn()
      .mockRejectedValueOnce(new Error('synthetic failure'))
      .mockResolvedValueOnce(done)
  });
  await act(async () => {
    await f.share();
  });
  f.wrapper.update();
  expect(f.wrapper.text()).toContain('表达内容仍会保留');
  await act(async () => {
    await f.share();
  });
  f.wrapper.update();
  expect(f.wrapper.text()).toContain(done.message);
  expect(f.props.onApplyOutput).not.toHaveBeenCalled();
  expect(f.props.onSpeak).not.toHaveBeenCalled();
});

test('sharing by keyboard/direct callback cancels scheduled autoplay', async () => {
  jest.useFakeTimers();
  const f = fixture({ candidateAutoplayDelaySeconds: 5 });
  await act(async () => {
    await f.share();
  });
  act(() => {
    jest.advanceTimersByTime(10000);
  });
  expect(f.props.onSpeak).not.toHaveBeenCalled();
});

test('sharing cancels pending AI replacement without issuing another AI request', async () => {
  jest.useFakeTimers();
  const ai = deferred(),
    onGenerateAiSentences = jest.fn(() => ai.promise);
  const f = fixture({
    aiAvailable: true,
    onGenerateAiSentences,
    candidateAutoplayDelaySeconds: 5
  });
  let generate;
  act(() => {
    generate = f.action(PATIENT_ACTION_IDS.improve)();
  });
  await act(async () => {
    await f.share();
  });
  f.wrapper.update();
  expect(f.wrapper.text()).not.toContain('生成中');
  const before = f.wrapper
    .find('button.CommunicationSupportPanel__candidate')
    .map(node => node.text());
  await act(async () => {
    ai.resolve({
      candidates: ['合成替换句一', '合成替换句二', '合成替换句三']
    });
    await generate;
  });
  f.wrapper.update();
  expect(
    f.wrapper
      .find('button.CommunicationSupportPanel__candidate')
      .map(node => node.text())
  ).toEqual(before);
  expect(onGenerateAiSentences).toHaveBeenCalledTimes(1);
  expect(f.wrapper.text()).not.toContain('生成中');
  act(() => {
    jest.advanceTimersByTime(10000);
  });
  expect(f.props.onSpeak).not.toHaveBeenCalled();
});

test('real text adapter never downloads after rejection, then undo permits a fresh share', async () => {
  const menu = deferred(),
    share = jest
      .fn()
      .mockReturnValueOnce(menu.promise)
      .mockResolvedValueOnce(undefined),
    downloadBlob = jest.fn();
  const port = createBrowserCommunicationSharePort({
    navigatorRef: { share },
    downloadBlob
  });
  const f = fixture({ onShareExpression: port.shareExpressionText });
  let task;
  act(() => {
    task = f.share();
    f.action(PATIENT_ACTION_IDS.notUnderstood)();
  });
  await act(async () => {
    menu.reject(new Error('synthetic unsupported'));
    await task;
  });
  expect(downloadBlob).not.toHaveBeenCalled();
  act(() => {
    f.action(PATIENT_ACTION_IDS.undo)();
  });
  await act(async () => {
    await f.share();
  });
  expect(share).toHaveBeenCalledTimes(2);
  share.mock.calls.forEach(([payload]) =>
    expect(Object.keys(payload).sort()).toEqual(['text', 'title'])
  );
  expect(JSON.stringify(share.mock.calls)).not.toContain('blob:');
});

test('editing the picture sequence invalidates sharing before the parent applies new output', async () => {
  const pending = deferred(),
    f = fixture({ onShareExpression: jest.fn(() => pending.promise) });
  let task;
  act(() => {
    task = f.share();
  });
  act(() => {
    f.wrapper
      .find('button')
      .filterWhere(button => button.text() === '删除')
      .first()
      .simulate('click');
  });
  expect(f.props.onShareExpression.mock.calls[0][1].isCurrent()).toBe(false);
  expect(f.props.onApplyOutput).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve(done);
    await task;
  });
  f.wrapper.update();
  expect(f.wrapper.text()).not.toContain(done.message);
});

test('reusing a saved phrase invalidates old sharing without clearing the saved phrase', async () => {
  const pending = deferred();
  const saved = {
    id: 'synthetic-saved',
    sentence: '今晚不回家。',
    output: [{ id: 'home', label: '回家' }]
  };
  const f = fixture({
    savedPhrases: [saved],
    onShareExpression: jest.fn(() => pending.promise)
  });
  let task;
  act(() => {
    task = f.share();
  });
  act(() => {
    f.wrapper
      .find('button')
      .filterWhere(button => button.text() === '重用')
      .first()
      .simulate('click');
  });
  expect(f.props.onShareExpression.mock.calls[0][1].isCurrent()).toBe(false);
  await act(async () => {
    pending.resolve(done);
    await task;
  });
  f.wrapper.update();
  expect(f.wrapper.text()).not.toContain(done.message);
  expect(f.wrapper.text()).toContain(saved.sentence);
});

test('new AI generation invalidates sharing even before its response changes candidates', async () => {
  const pending = deferred(),
    ai = deferred();
  const f = fixture({
    onShareExpression: jest.fn(() => pending.promise),
    aiAvailable: true,
    onGenerateAiSentences: () => ai.promise
  });
  let task, generate;
  act(() => {
    task = f.share();
  });
  act(() => {
    generate = f.action(PATIENT_ACTION_IDS.improve)();
  });
  expect(f.props.onShareExpression.mock.calls[0][1].isCurrent()).toBe(false);
  await act(async () => {
    pending.resolve(done);
    await task;
    ai.resolve({ candidates: [] });
    await generate;
  });
  f.wrapper.update();
  expect(f.wrapper.text()).not.toContain(done.message);
});

test('rating an unchanged candidate does not cancel its valid share', async () => {
  const pending = deferred(),
    f = fixture({ onShareExpression: jest.fn(() => pending.promise) });
  let task;
  act(() => {
    task = f.share();
  });
  act(() => {
    f.wrapper
      .find('button.CommunicationSupportPanel__candidateFeedback')
      .first()
      .simulate('click');
  });
  expect(f.props.onShareExpression.mock.calls[0][1].isCurrent()).toBe(true);
  await act(async () => {
    pending.resolve(done);
    await task;
  });
  f.wrapper.update();
  expect(f.wrapper.text()).toContain(done.message);
});
