import API, { resolveTrustedApiMediaUrl } from './api';
jest.mock('../store');
jest.mock('../constants', () => ({
  ...jest.requireActual('../constants'),
  API_URL: '/api/'
}));

test.each([
  '/pictograms/arasaac/35949/image',
  '/pictograms/opensymbols/c3ludGhldGlj.0123456789abcdef0123456789abcdef/image',
  '/pictograms/globalsymbols/c3ludGhldGlj.0123456789abcdef0123456789abcdef/image'
])(
  'search and confirmation preserve the deployed API mount: %s',
  async path => {
    expect(resolveTrustedApiMediaUrl(window.location.origin + path)).toBe(
      window.location.origin + '/api' + path
    );
    expect(
      resolveTrustedApiMediaUrl(window.location.origin + '/api' + path)
    ).toBe(window.location.origin + '/api' + path);
    expect(resolveTrustedApiMediaUrl('https://foreign.invalid' + path)).toBe(
      ''
    );
    const post = jest.spyOn(API.axiosInstance, 'post').mockResolvedValue({
      data: {
        results: [{ token: '可以', pictogram: { id: 'test', imageUrl: path } }]
      }
    });
    const blob = new Blob(['png'], { type: 'image/png' });
    const get = jest
      .spyOn(API.axiosInstance, 'get')
      .mockResolvedValue({ data: blob });
    const [candidate] = await API.searchCommunicationPictograms(['可以']);
    expect(candidate.pictogram.image).toBe(
      window.location.origin + '/api' + path
    );
    await expect(
      API.downloadCommunicationPictogram(candidate.pictogram)
    ).resolves.toBe(blob);
    expect(get.mock.calls[0][0]).toBe(window.location.origin + '/api' + path);
    await expect(
      API.downloadCommunicationPictogram({
        image: window.location.origin + path
      })
    ).resolves.toBe(blob);
    expect(get.mock.calls[1][0]).toBe(window.location.origin + '/api' + path);
    await expect(
      API.downloadCommunicationPictogram({
        image: 'https://foreign.invalid' + path
      })
    ).rejects.toThrow('Invalid public');
    post.mockRestore();
    get.mockRestore();
  }
);

test.each([
  '/pictograms/globalsymbols/unsigned/image',
  '/pictograms/globalsymbols/c3ludGhldGlj.1234/image',
  '/pictograms/unknown/c3ludGhldGlj.0123456789abcdef0123456789abcdef/image',
  '/communication/private-library/image',
  'https://globalsymbols.com/uploads/image.png'
])('rejects unsupported download paths before requesting: %s', async image => {
  const get = jest.spyOn(API.axiosInstance, 'get');
  try {
    await expect(API.downloadCommunicationPictogram({ image })).rejects.toThrow(
      'Invalid public'
    );
    expect(get).not.toHaveBeenCalled();
  } finally {
    get.mockRestore();
  }
});
