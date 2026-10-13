import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import MissingTokenQueue from './MissingTokenQueue.component';
import { createCommunicationRepository } from '../../../common/communicationSupport/repository';
import { createScopedCommunicationStorage } from '../../../common/communicationSupport/scopedCommunicationStorage';
import { applyMissingTokenResolutions, filterMissingTokenResolutionsByCorrectionMemory } from '../../../common/communicationSupport/missingTokens';
import { readPersonalImageBlob } from './PersonalImageManager.component';
import { getReviewedArasaacIds } from '../../../common/communicationSupport/reviewedArasaac';
import { buildArasaacSemanticFields } from '../../../common/communicationSupport/pictogramSemantics';

jest.mock('../../../api', () => ({}));
jest.mock('../Symbol', () => props => <img src={props.image} alt={props.label} />);

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=';
const bytes = () => new Blob([Uint8Array.from(atob(png), char => char.charCodeAt(0))], { type: 'image/png' });
const picture = { id: 'arasaac-2392', label: '家里人', image: 'https://api.example.test/pictograms/arasaac/2392/image',
  source: { provider: 'arasaac', originalId: '2392', name: 'ARASAAC', license: 'CC BY-NC-SA 4.0', sourceUrl: 'https://arasaac.org/pictograms/2392' } };

describe.each(['家里人', '尿片', '一点点'])('Web confirmed pictogram offline lifecycle: %s', token => {
  const id = getReviewedArasaacIds(token)[0];
  const candidate = { ...picture, id: `arasaac-${id}`, label: token,
    semantics: buildArasaacSemanticFields(token, token, 'zh', id).semantics,
    image: `https://api.example.test/pictograms/arasaac/${id}/image`,
    source: { ...picture.source, originalId: String(id), sourceUrl: `https://arasaac.org/pictograms/${id}` } };
  let repository, storage, context, wrapper, download, onReview, clock;
  beforeEach(() => {
    localStorage.clear();
    clock = 100;
    context = { accountId: 'synthetic-family-member', familyId: 'family-a', profileId: 'patient-a' };
    storage = createScopedCommunicationStorage(localStorage, () => context);
    repository = createCommunicationRepository({ storage, now: () => ++clock });
    const [record] = repository.recordMissingTokens({ tokens: [token], rawText: token });
    repository.reviewMissingToken(record.id, { status: 'suggested', suggestedPictogram: candidate, source: 'online' });
    download = jest.fn().mockResolvedValue(bytes());
    onReview = jest.fn((id, review) => repository.reviewMissingToken(id, review));
    wrapper = mount(<MissingTokenQueue records={repository.loadMissingTokens()} onReview={onReview}
      downloadOnlineImage={download} readPrivateImage={readPersonalImageBlob} />);
  });
  afterEach(() => wrapper.unmount());
  async function confirm() {
    await act(async () => {
      await wrapper.find('ForwardRef(Button)').filterWhere(node => node.text() === '确认使用').first().prop('onClick')();
    });
    wrapper.update();
  }
  test('requires confirmation then restores actual image bytes after repository restart while offline', async () => {
    expect(download).not.toHaveBeenCalled();
    const items = [{ token, tile: null, matchType: 'none' }];
    expect(applyMissingTokenResolutions(items, repository.loadMissingTokens(), [])[0].tile).toBeNull();
    await confirm();
    download.mockRejectedValue(new Error('offline'));
    const restarted = createCommunicationRepository({ storage });
    const saved = restarted.loadMissingTokens();
    expect(saved[0].resolvedPictogram.image).toBe(`data:image/png;base64,${png}`);
    expect(saved[0].resolvedPictogram.source.license).toBe(picture.source.license);
    expect(saved[0].resolvedPictogram.semantics).toEqual(candidate.semantics);
    const result = applyMissingTokenResolutions(items, saved, []);
    expect(result[0].tile.tile.image).toBe(`data:image/png;base64,${png}`);
    expect(result[0].tile.tile.vocalization).toBe(token);
    expect(download).toHaveBeenCalledTimes(1);
    // A later rejection still wins over the restored image, including offline.
    const allowed = filterMissingTokenResolutionsByCorrectionMemory(saved, { rules: [{ token,
      blockedPictogramIds: [candidate.id], tombstones: [{ pictogramId: candidate.id, createdAt: saved[0].updatedAt + 1 }] }] });
    expect(applyMissingTokenResolutions(items, allowed, [])[0].tile).toBeNull();
    context = { accountId: 'other', familyId: 'family-b', profileId: 'patient-b' };
    expect(createCommunicationRepository({ storage }).loadMissingTokens()).toEqual([]);
  });
  test('download failure retains the suggestion and can be retried', async () => {
    download.mockRejectedValueOnce(new Error('offline'));
    await confirm();
    expect(repository.loadMissingTokens()[0].status).toBe('suggested');
    expect(onReview).not.toHaveBeenCalled();
    await confirm();
    expect(repository.loadMissingTokens()[0].status).toBe('resolved');
  });
  test('quota failure never reports a successful resolution', async () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    try {
      await confirm();
      expect(repository.loadMissingTokens()[0].status).toBe('suggested');
      expect(wrapper.text()).toContain('尚未采用');
    } finally { spy.mockRestore(); }
  });
  test('duplicate confirmation and a review made during download cannot overwrite that review', async () => {
    let finish;
    download.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const click = wrapper.find('ForwardRef(Button)').filterWhere(node => node.text() === '确认使用').first().prop('onClick');
    let pending;
    await act(async () => { pending = click(); await click(); });
    expect(download).toHaveBeenCalledTimes(1);
    const record = repository.loadMissingTokens()[0];
    repository.reviewMissingToken(record.id, { status: 'ignored' });
    wrapper.setProps({ records: repository.loadMissingTokens() });
    await act(async () => { finish(bytes()); await pending; });
    expect(onReview).not.toHaveBeenCalled();
    expect(repository.loadMissingTokens()[0].status).toBe('ignored');
  });
});
