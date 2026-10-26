import {
  preserveCareLocalTileMedia,
  preserveCareLocalFavoriteMedia
} from './careLocalMediaProjection';
import { encodeCareMedia } from './careMediaValues';
const scope = { accountId: 'a', familyId: 'f', profileId: 'p' };
test('local sound survives changed cloud labels, but removed tiles and different scopes stay absent', () => {
  const local = [
    {
      id: 'b',
      tiles: [
        { id: 't', sound: 'data:audio/wav;base64,AA==' },
        { id: 'gone', sound: 'blob:gone' }
      ]
    }
  ];
  const cloud = [
    { id: 'b', tiles: [{ id: 't', label: '云端改名', sound: '' }] }
  ];
  expect(
    preserveCareLocalTileMedia(cloud, local, scope, scope)[0].tiles
  ).toEqual([
    { id: 't', label: '云端改名', sound: 'data:audio/wav;base64,AA==' }
  ]);
  for (const key of ['accountId', 'familyId', 'profileId'])
    expect(
      preserveCareLocalTileMedia(cloud, local, scope, {
        ...scope,
        [key]: 'other'
      })
    ).toBe(cloud);
  expect(preserveCareLocalTileMedia([], local, scope, scope)).toEqual([]);
});
test('clearing a recording is retained and favorite audio is independent from source tiles', async () => {
  const sound = 'data:audio/wav;base64,c3ludGhldGlj';
  const original = [
    {
      id: 'fav',
      sentence: '喝水',
      output: [{ id: 't', boardId: 'b', label: '水', sound }]
    }
  ];
  const payload = await encodeCareMedia(
    original[0],
    { view: () => ({ media: {} }) },
    jest.fn()
  );
  expect(JSON.stringify(payload)).not.toContain(sound);
  expect(payload.output[0]).not.toHaveProperty('sound');
  expect(
    preserveCareLocalFavoriteMedia([payload], original, scope, scope)[0]
      .output[0].sound
  ).toBe(sound);
  const cleared = [
    { ...original[0], output: [{ ...original[0].output[0], sound: '' }] }
  ];
  expect(
    preserveCareLocalFavoriteMedia([payload], cleared, scope, scope)[0]
      .output[0].sound
  ).toBe('');
  const other = {
    ...payload,
    output: [{ ...payload.output[0], boardId: 'other' }]
  };
  expect(
    preserveCareLocalFavoriteMedia([other], original, scope, scope)[0].output[0]
  ).not.toHaveProperty('sound');
  expect(
    preserveCareLocalFavoriteMedia([payload], original, scope, {
      ...scope,
      profileId: 'other'
    })
  ).toEqual([payload]);
  expect(preserveCareLocalFavoriteMedia([], original, scope, scope)).toEqual(
    []
  );
});
