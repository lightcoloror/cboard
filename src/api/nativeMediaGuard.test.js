import API from './api';
import { isAndroid, cvaFileToBlob } from '../cordova-util';

jest.mock('../store');
jest.mock('../cordova-util', () => ({
  ...jest.requireActual('../cordova-util'), isAndroid: jest.fn(() => false), cvaFileToBlob: jest.fn()
}));

const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
const image = 'data:image/png;base64,c3ludGhldGlj';
beforeEach(() => {
  isAndroid.mockReturnValue(false);
  jest.spyOn(API, 'uploadFile').mockResolvedValue('https://synthetic.invalid/saved.png');
});
afterEach(() => { jest.restoreAllMocks(); delete window.resolveLocalFileSystemURL; });

test('native media guard rejects before any upload when the operation already expired', async () => {
  await expect(API.uploadBoardLocalMedia({ id: 'board', caption: image, tiles: [{ id: 'tile', image }] },
    { guard: () => false })).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(API.uploadFile).not.toHaveBeenCalled();
});

test('a scope change during the first media batch stops later batches and rejects the old replacement', async () => {
  const gate = deferred();
  let current = true;
  API.uploadFile.mockReturnValue(gate.promise);
  const board = { id: 'board', tiles: Array.from({ length: 6 }, (_, index) => ({ id: `tile-${index}`, image })) };
  const saving = API.uploadBoardLocalMedia(board, { guard: () => current });
  const rejected = expect(saving).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  expect(API.uploadFile).toHaveBeenCalledTimes(5);
  current = false;
  gate.resolve('https://synthetic.invalid/old.png');
  await rejected;
  expect(API.uploadFile).toHaveBeenCalledTimes(5);
  expect(board.tiles.every(tile => tile.image === image)).toBe(true);
});

test('a late caption result is rejected after the scope changes', async () => {
  const gate = deferred();
  let current = true;
  API.uploadFile.mockReturnValue(gate.promise);
  const saving = API.uploadBoardLocalMedia({ id: 'board', caption: image, tiles: [] }, { guard: () => current });
  const rejected = expect(saving).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  current = false;
  gate.resolve('https://synthetic.invalid/caption.png');
  await rejected;
});

test('a delayed local-file read cannot upload under a newly selected scope', async () => {
  isAndroid.mockReturnValue(true);
  const gate = deferred();
  let current = true;
  window.resolveLocalFileSystemURL = jest.fn((url, success) => success({ file: done => done({ name: 'synthetic.png' }) }));
  cvaFileToBlob.mockReturnValue(gate.promise);
  const saving = API.uploadBoardLocalMedia({ id: 'board', tiles: [{ id: 'tile', image: 'file:///synthetic.png' }] },
    { guard: () => current });
  const rejected = expect(saving).rejects.toMatchObject({ code: 'BOARD_SAVE_CANCELLED' });
  await Promise.resolve();
  current = false;
  gate.resolve(new Blob(['synthetic'], { type: 'image/png' }));
  await rejected;
  expect(API.uploadFile).not.toHaveBeenCalled();
});
