import { getRuntimePictogramStorageState } from './runtimePictogram';

test.each([
  ['data:image/png;base64,aGVsbG8=', 'embedded'],
  ['wxfile://saved/one.png', 'local-file'],
  ['http://usr/saved/one.png', 'local-file'],
  ['https://api.example.test/pictograms/1', 'remote'],
  ['blob:https://example.test/transient', 'remote'],
  ['', 'missing']
])(
  'does not claim remote or transient images persist offline: %s',
  (image, expected) => {
    expect(getRuntimePictogramStorageState({ image })).toBe(expected);
  }
);
