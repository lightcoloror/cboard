// jsdom has no image decoder; real decoding is covered by production-browser acceptance.
jest.mock('../../../common/communicationSupport/browserImageVerification', () => ({
  verifyBrowserLocalImage: async () => ({ status: 'available', width: 1, height: 1 })
}));
import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import MissingTokenQueue from './MissingTokenQueue.component';
import { createCommunicationRepository } from '../../../common/communicationSupport/repository';
import { createScopedCommunicationStorage } from '../../../common/communicationSupport/scopedCommunicationStorage';
import {
  applyMissingTokenResolutions,
  filterMissingTokenResolutionsByCorrectionMemory
} from '../../../common/communicationSupport/missingTokens';
import { readPersonalImageBlob } from './PersonalImageManager.component';
import { getReviewedArasaacIds } from '../../../common/communicationSupport/reviewedArasaac';
import {
  buildArasaacSemanticFields,
  buildPictogramSemantics
} from '../../../common/communicationSupport/pictogramSemantics';
import API from '../../../api/api';

jest.mock('../../../constants', () => ({
  ...jest.requireActual('../../../constants'),
  API_URL: '/api/'
}));

jest.mock('../Symbol', () => props => (
  <img src={props.image} alt={props.label} />
));

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=';
const liveFixture = process.env.TUYUJIA_LIVE_PICTOGRAM_FIXTURE
  ? JSON.parse(
      require('fs').readFileSync(
        process.env.TUYUJIA_LIVE_PICTOGRAM_FIXTURE,
        'utf8'
      )
    )
  : null;
const bytes = (encoded = png) =>
  new Blob([Uint8Array.from(atob(encoded), char => char.charCodeAt(0))], {
    type: 'image/png'
  });
const picture = {
  id: 'arasaac-2392',
  label: '家里人',
  image: 'https://api.example.test/pictograms/arasaac/2392/image',
  source: {
    provider: 'arasaac',
    originalId: '2392',
    name: 'ARASAAC',
    license: 'CC BY-NC-SA 4.0',
    sourceUrl: 'https://arasaac.org/pictograms/2392'
  }
};

describe.each([
  ['家里人', 'arasaac'],
  ['尿片', 'arasaac'],
  ['一点点', 'arasaac'],
  ['回家', 'arasaac'],
  ['家里人', 'globalsymbols'],
  ['家里人', 'opensymbols'],
  ['葡萄柚', 'opensymbols'],
  ...(liveFixture
    ? [[liveFixture.token, liveFixture.candidate.source.provider, liveFixture]]
    : [])
])(
  'Web confirmed pictogram offline lifecycle: %s / %s',
  (token, provider, captured) => {
    const id =
      token === '回家' ? 29714 : getReviewedArasaacIds(token)[0] || 2026;
    const encodedImage = captured ? captured.pngBase64 : png;
    const candidate = captured
      ? {
          ...captured.candidate,
          image: `${window.location.origin}/api${captured.candidate.imageUrl}`
        }
      : {
          ...picture,
          id: `${provider}-${id}`,
          label: token,
          semantics:
            provider !== 'arasaac'
              ? buildPictogramSemantics({
                  token,
                  provider,
                  originalId: id,
                  sourceLabels: [token]
                })
              : (token === '回家'
                  ? buildArasaacSemanticFields(token, 'come back', 'en', id, {
                      keywords: [{ keyword: 'come back' }]
                    })
                  : buildArasaacSemanticFields(token, token, 'zh', id)
                ).semantics,
          image: `${window.location.origin}/api/pictograms/${provider}/${
            provider === 'arasaac'
              ? id
              : 'c3ludGhldGlj.0123456789abcdef0123456789abcdef'
          }/image`,
          source: {
            ...picture.source,
            provider,
            name: provider,
            originalId: String(id),
            license:
              provider === 'arasaac' ? picture.source.license : 'CC BY-SA 4.0',
            sourceUrl: `https://${
              provider === 'arasaac'
                ? 'arasaac.org'
                : provider === 'globalsymbols'
                ? 'globalsymbols.com'
                : 'opensymbols.org'
            }/pictograms/${id}`
          }
        };
    let repository,
      storage,
      context,
      wrapper,
      download,
      onReview,
      clock,
      apiDownload,
      apiSearch;
    beforeEach(async () => {
      localStorage.clear();
      clock = 100;
      context = {
        accountId: 'synthetic-family-member',
        familyId: 'family-a',
        profileId: 'patient-a'
      };
      storage = createScopedCommunicationStorage(localStorage, () => context);
      repository = createCommunicationRepository({
        storage,
        now: () => ++clock
      });
      const [record] = repository.recordMissingTokens({
        tokens: [token],
        rawText: token
      });
      apiSearch = jest
        .spyOn(API.axiosInstance, 'post')
        .mockResolvedValue({
          data: { results: [{ token, pictogram: candidate }] }
        });
      const [found] = await API.searchCommunicationPictograms([token]);
      repository.reviewMissingToken(record.id, {
        status: 'suggested',
        suggestedPictogram: found.pictogram,
        source: 'online'
      });
      apiDownload = jest
        .spyOn(API.axiosInstance, 'get')
        .mockResolvedValue({ data: bytes(encodedImage) });
      download = jest.fn(pictogram =>
        API.downloadCommunicationPictogram(pictogram)
      );
      onReview = jest.fn((id, review) =>
        repository.reviewMissingToken(id, review)
      );
      wrapper = mount(
        <MissingTokenQueue
          records={repository.loadMissingTokens()}
          onReview={onReview}
          downloadOnlineImage={download}
          readPrivateImage={readPersonalImageBlob}
        />
      );
    });
    afterEach(() => {
      wrapper.unmount();
      apiDownload.mockRestore();
      apiSearch.mockRestore();
    });
    async function confirm() {
      await act(async () => {
        await wrapper
          .find('ForwardRef(Button)')
          .filterWhere(node => node.text() === '确认使用')
          .first()
          .prop('onClick')();
      });
      wrapper.update();
    }
    test('requires confirmation then restores actual image bytes after repository restart while offline', async () => {
      if (token === '回家')
        expect(wrapper.text()).toContain('图中动作和目的地与当前表达相符');
      expect(download).not.toHaveBeenCalled();
      const items = [{ token, tile: null, matchType: 'none' }];
      expect(
        applyMissingTokenResolutions(
          items,
          repository.loadMissingTokens(),
          []
        )[0].tile
      ).toBeNull();
      await confirm();
      expect(apiDownload).toHaveBeenCalledWith(candidate.image, {
        responseType: 'blob',
        timeout: 15000
      });
      download.mockRejectedValue(new Error('offline'));
      apiDownload.mockRejectedValue(new Error('offline'));
      apiSearch.mockRejectedValue(new Error('offline'));
      const restarted = createCommunicationRepository({ storage });
      const saved = restarted.loadMissingTokens();
      expect(saved[0].resolvedPictogram.image).toBe(
        `data:image/png;base64,${encodedImage}`
      );
      expect(saved[0].resolvedPictogram.source.license).toBe(
        candidate.source.license
      );
      expect(saved[0].resolvedPictogram.source.provider).toBe(provider);
      expect(saved[0].resolvedPictogram.semantics).toEqual(candidate.semantics);
      const result = applyMissingTokenResolutions(items, saved, []);
      expect(result[0].tile.tile.image).toBe(
        `data:image/png;base64,${encodedImage}`
      );
      expect(result[0].tile.tile.vocalization).toBe(token);
      expect(download).toHaveBeenCalledTimes(1);
      expect(apiSearch).toHaveBeenCalledTimes(1);
      // A later rejection still wins over the restored image, including offline.
      const allowed = filterMissingTokenResolutionsByCorrectionMemory(saved, {
        rules: [
          {
            token,
            blockedPictogramIds: [candidate.id],
            tombstones: [
              { pictogramId: candidate.id, createdAt: saved[0].updatedAt + 1 }
            ]
          }
        ]
      });
      expect(
        applyMissingTokenResolutions(items, allowed, [])[0].tile
      ).toBeNull();
      context = {
        accountId: 'other',
        familyId: 'family-b',
        profileId: 'patient-b'
      };
      expect(
        createCommunicationRepository({ storage }).loadMissingTokens()
      ).toEqual([]);
    });
    test('download failure retains the suggestion and can be retried', async () => {
      download.mockRejectedValueOnce(new Error('offline'));
      await confirm();
      expect(repository.loadMissingTokens()[0].status).toBe('suggested');
      expect(onReview).not.toHaveBeenCalled();
      await confirm();
      expect(repository.loadMissingTokens()[0].status).toBe('resolved');
    });
    test('hides persisted wrong-sense candidates without downloading or changing confirmed choices', () => {
      const [record] = repository.loadMissingTokens();
      wrapper.setProps({
        records: [
          {
            ...record,
            suggestedPictogram: {
              ...candidate,
              semantics: {
                ...candidate.semantics,
                relation: 'conflict',
                requiresReview: true
              }
            },
            suggestedPictograms: [
              {
                ...candidate,
                semantics: {
                  ...candidate.semantics,
                  relation: 'conflict',
                  requiresReview: true
                }
              }
            ]
          }
        ]
      });
      expect(
        wrapper
          .find('ForwardRef(Button)')
          .filterWhere(node => node.text() === '确认使用')
      ).toHaveLength(0);
      expect(wrapper.text()).not.toContain('有建议');
      expect(download).not.toHaveBeenCalled();
    });
    test('quota failure never reports a successful resolution', async () => {
      const spy = jest
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('quota');
        });
      try {
        await confirm();
        expect(repository.loadMissingTokens()[0].status).toBe('suggested');
        expect(wrapper.text()).toContain('尚未采用');
      } finally {
        spy.mockRestore();
      }
    });
    test('duplicate confirmation and a review made during download cannot overwrite that review', async () => {
      let finish;
      download.mockImplementation(
        () =>
          new Promise(resolve => {
            finish = resolve;
          })
      );
      const click = wrapper
        .find('ForwardRef(Button)')
        .filterWhere(node => node.text() === '确认使用')
        .first()
        .prop('onClick');
      let pending;
      await act(async () => {
        pending = click();
        await click();
      });
      expect(download).toHaveBeenCalledTimes(1);
      const record = repository.loadMissingTokens()[0];
      repository.reviewMissingToken(record.id, { status: 'ignored' });
      wrapper.setProps({ records: repository.loadMissingTokens() });
      await act(async () => {
        finish(bytes(encodedImage));
        await pending;
      });
      expect(onReview).not.toHaveBeenCalled();
      expect(repository.loadMissingTokens()[0].status).toBe('ignored');
    });
  }
);
