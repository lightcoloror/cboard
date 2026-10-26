import { classifyImageReference } from './imageAvailability';
import { verifyBrowserLocalImage, decodeBrowserImage } from './browserImageVerification';
import { createImageRepairOperation, originalPublicImagePath, repairCatalogImage } from './imageRepair';
import { buildReceiverOutputPreview } from './receiverPipeline';
import { invalidateImageOperations } from './imageOperationEpoch';

test('repair updates the restored snapshot only, preserving person identity and duplicate order', () => {
  const original = { tile: { id:'same',label:'合成林安',image:'old',personId:'person-a' },
    persistedOutput: {id:'same',label:'合成林安',image:'old',personId:'person-a',backgroundColor:'#fff'} };
  const second = { ...original, persistedOutput: {...original.persistedOutput,personId:'person-b'} };
  const repaired = repairCatalogImage(original,{...original.tile,image:'new'});
  expect(buildReceiverOutputPreview([{tile:repaired},{tile:second},{tile:original}]).map(x=>[x.image,x.personId]))
    .toEqual([['new','person-a'],['old','person-b'],['old','person-a']]);
  expect(original.persistedOutput.image).toBe('old');
});

test.each(['blob:old', 'wxfile://tmp/a', 'http://tmp/a'])('temporary is never persistent: %s', value => {
  expect(classifyImageReference(value)).toBe('temporary');
});
test('public repair requires attribution, never a label or private identity', () => {
  const tile = { label: '测试林安', image: 'data:image/png;base64,AAAA', pictogramAttribution: { provider: 'device-private', originalId: '123' } };
  expect(originalPublicImagePath(tile)).toBe('');
  expect(originalPublicImagePath({ ...tile, pictogramAttribution: { provider: 'arasaac', originalId: '123' } })).toBe('/pictograms/arasaac/123/image');
  expect(originalPublicImagePath({ ...tile, pictogramAttribution: { provider: 'opensymbols', originalId: '123' } })).toBe('');
});
test('local checks never load remote addresses or blob references', async () => {
  const decode = jest.fn();
  expect(await verifyBrowserLocalImage('https://private.example.test/a.png', { decode })).toEqual({ status: 'remote-only' });
  expect(await verifyBrowserLocalImage('blob:session-only', { decode })).toEqual({ status: 'temporary' });
  expect(decode).not.toHaveBeenCalled();
});
test('embedded bytes must decode, and timeout differs from corruption', async () => {
  const source = 'data:image/png;base64,AAAA';
  expect((await verifyBrowserLocalImage(source, { decode: async () => { throw new Error('decode failed'); } })).status).toBe('corrupt');
  expect((await verifyBrowserLocalImage(source, { decode: async () => { throw new Error('timed out'); } })).status).toBe('check-failed');
  expect((await verifyBrowserLocalImage(source, { decode: async () => ({ width: 2, height: 2 }) })).status).toBe('available');
});

test('an uncached packaged picture is not reported as deleted or offline-ready', async () => {
  const decode = jest.fn();
  const cacheStorage = { match: jest.fn().mockResolvedValue(undefined) };
  expect(await verifyBrowserLocalImage('/symbols/mulberry/correct.svg', { decode, cacheStorage }))
    .toEqual({ status: 'not-cached' });
  expect(decode).not.toHaveBeenCalled();
  expect(await verifyBrowserLocalImage('', { decode, cacheStorage })).toEqual({ status: 'missing' });
  expect(await verifyBrowserLocalImage('/symbols/a.svg', {
    decode, cacheStorage: { match: async () => { throw new Error('storage denied'); } }
  })).toEqual({ status: 'check-failed' });
});
test('actual browser decoder requires load and nonzero dimensions', async () => {
  class Decoder { set src(value) { this.naturalWidth = 2; this.naturalHeight = 3; this.onload(); } }
  expect(await decodeBrowserImage('data:image/png;base64,AAAA', Decoder)).toEqual({ width: 2, height: 3 });
  class Corrupt { set src(value) { this.onerror(); } }
  await expect(decodeBrowserImage('data:image/png;base64,AAAA', Corrupt)).rejects.toThrow('decode');
});
test('double clicks and record-write retries reuse prepared bytes', async () => {
  let done; const work = jest.fn(() => new Promise(resolve => { done = resolve; }));
  const operation = createImageRepairOperation();
  const first = operation.prepare('a', work), second = operation.prepare('a', work);
  await Promise.resolve(); done('saved-bytes');
  expect(await first).toBe('saved-bytes'); expect(await second).toBe('saved-bytes');
  expect(await operation.prepare('a', work)).toBe('saved-bytes');
  expect(work).toHaveBeenCalledTimes(1);
});
test.each(['cancel', 'privacy'])('%s discards late download without deleting original image', async mode => {
  let done; const operation = createImageRepairOperation();
  const first = operation.prepare('a', () => new Promise(resolve => { done = resolve; }));
  await Promise.resolve();
  if (mode === 'cancel') operation.cancel(); else invalidateImageOperations();
  done('new image'); expect(await first).toBeNull();
});
