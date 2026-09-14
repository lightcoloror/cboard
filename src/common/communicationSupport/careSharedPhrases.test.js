import {
  projectCareSharedPhrases,
  isCareSharedPhrase
} from './careSharedPhrases';

const snapshot = {
  resources: {
    shared: {
      kind: 'favorite',
      id: 'same-id',
      value: { sentence: '共享句子', output: [] }
    },
    personal: {
      kind: 'personalFavorite',
      id: 'same-id',
      value: { sentence: '个人句子' }
    },
    deleted: {
      kind: 'favorite',
      id: 'gone',
      deleted: true,
      value: { sentence: '已删除' }
    }
  },
  media: {},
  locked: false
};
test.each(['relative', 'professional'])(
  'projects only authorized family resources for %s without modifying the source',
  role => {
    const before = JSON.stringify(snapshot);
    const items = projectCareSharedPhrases(snapshot, role, () => 'image');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'family-shared:same-id',
      sentence: '共享句子',
      output: [],
      careSharedReadOnly: true
    });
    expect(isCareSharedPhrase(items[0])).toBe(true);
    expect(isCareSharedPhrase({ id: 'same-id' })).toBe(false);
    expect(JSON.stringify(snapshot)).toBe(before);
  }
);
test('does not duplicate patient favorites or retain a previous scope when access disappears', () => {
  expect(projectCareSharedPhrases(snapshot, 'patient', () => '')).toEqual([]);
  expect(
    projectCareSharedPhrases(
      { ...snapshot, locked: true },
      'relative',
      () => ''
    )
  ).toEqual([]);
  expect(
    projectCareSharedPhrases({ resources: {}, media: {} }, 'relative', () => '')
  ).toEqual([]);
});
