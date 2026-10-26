import { prepareSelectedPackagedImages, verifyBrowserLocalImage } from './browserImageVerification';

const source = '/symbols/mulberry/no.svg';
const item = { tile: { id: 'no', image: source } };
const response = () => ({ ok: true, blob: async () => ({ size: 20 }), clone: response });
function ports() {
  const values = new Map();
  const put = jest.fn(async (key, value) => { values.set(key, value); });
  return { values, put, cacheStorage: { match: jest.fn(async key => values.get(key)), open: jest.fn(async () => ({ put })) },
    fetchImage: jest.fn(async () => response()), decode: jest.fn(async () => ({ width: 8, height: 8 })) };
}
beforeEach(() => { URL.createObjectURL = jest.fn(() => 'blob:synthetic'); URL.revokeObjectURL = jest.fn(); });

test('explicit matching loads only selected packaged images and reads/decodes final cached bytes', async () => {
  const p = ports();
  expect(await prepareSelectedPackagedImages([item, item], p)).toEqual([{source, status:'available', width:8,height:8}]);
  expect(p.fetchImage).toHaveBeenCalledTimes(1);
  expect(p.fetchImage.mock.calls[0][0]).toBe(source);
  expect(p.fetchImage.mock.calls[0][1]).toMatchObject({credentials:'omit',redirect:'error'});
  expect(p.cacheStorage.open).toHaveBeenCalledWith('symbols-mulberry');
  expect(p.decode).toHaveBeenCalledTimes(2);
});
test('actual nested receiver candidates and existing Mulberry comma filenames are prepared', async () => {
  const p=ports();
  const nested={token:'喝',tile:{id:'drink',boardId:'home',tile:{id:'drink',image:'/symbols/mulberry/drink_,_to.svg'}}};
  expect((await prepareSelectedPackagedImages([nested],p))[0].status).toBe('available');
  expect(p.fetchImage.mock.calls[0][0]).toBe('/symbols/mulberry/drink_,_to.svg');
});
test('private people, local private references, remote sources and path traversal never fetch', async () => {
  const p = ports();
  const refs=['https://private.test/person.png','/api/private/person.png','/symbols/cboard/../secret.png','/symbols/cboard/name.png?person=abc','data:image/png;base64,AAAA'];
  const inputs=refs.map(image=>({tile:{image}}));
  inputs.push({tile:{image:source,pictogramAttribution:{provider:'device-private'}}});
  expect(await prepareSelectedPackagedImages(inputs,p)).toEqual([]);
  expect(p.fetchImage).not.toHaveBeenCalled();
});
test('existing cache is never silently overwritten, including a corrupt item', async () => {
  const p=ports();p.values.set(source,response());
  await prepareSelectedPackagedImages([item],p);
  expect(p.fetchImage).not.toHaveBeenCalled();expect(p.put).not.toHaveBeenCalled();
});
test('failed decode does not write or declare offline availability', async () => {
  const p=ports();p.decode.mockRejectedValue(new Error('decode failed'));
  expect((await prepareSelectedPackagedImages([item],p))[0].status).toBe('check-failed');
  expect(p.put).not.toHaveBeenCalled();
});
test('silent cache write failure is not offline success', async () => {
  const p=ports();p.put.mockImplementation(async()=>{});
  expect((await prepareSelectedPackagedImages([item],p))[0].status).toBe('not-cached');
});
test('cancelled matching cannot persist late image bytes', async () => {
  const p=ports();let current=true;p.fetchImage.mockImplementation(async()=>{current=false;return response();});
  await prepareSelectedPackagedImages([item],{...p,isCurrent:()=>current});
  expect(p.put).not.toHaveBeenCalled();
});
test('a cache entry added during download is preserved',async()=>{
  const p=ports(), other=response();
  p.fetchImage.mockImplementation(async()=>{p.values.set(source,other);return response();});
  await prepareSelectedPackagedImages([item],p);
  expect(p.put).not.toHaveBeenCalled();expect(p.values.get(source)).toBe(other);
});
test('restore availability checks remain local-only even when fetch is available', async () => {
  const p=ports();await verifyBrowserLocalImage(source,p);
  expect(p.fetchImage).not.toHaveBeenCalled();expect(p.put).not.toHaveBeenCalled();
});
