import { currentImageOperationEpoch } from './imageOperationEpoch';

export function repairCatalogImage(candidate, tile) {
  return { ...candidate, tile,
    ...(candidate.persistedOutput ? { persistedOutput: {
      ...candidate.persistedOutput, image: tile.image,
      ...(tile.pictogramAttribution ? { attribution: tile.pictogramAttribution } : {})
    } } : {}) };
}

// Cached runtime images may no longer contain a signed download URL. Never
// reconstruct one from a label, a person's name or a provider's web page.
export function originalPublicImagePath(tile) {
  if (!tile || tile.personId || tile.person || tile.personIdentity || tile.isPerson) return '';
  const source = tile.pictogramAttribution || tile.source;
  if (!source || !['arasaac', 'opensymbols', 'globalsymbols'].includes(source.provider)) return '';
  if (source.provider === 'arasaac' && /^\d+$/.test(String(source.originalId || '')))
    return `/pictograms/arasaac/${source.originalId}/image`;
  const match = String(tile.image || '').match(/(\/pictograms\/(opensymbols|globalsymbols)\/[A-Za-z0-9_-]+\.[a-f0-9]{32}\/image)$/);
  return match && match[2] === source.provider && source.originalId ? match[1] : '';
}

export function createImageRepairOperation() {
  let version = 0, pending = null, prepared = null;
  return {
    cancel() { version += 1; pending = null; prepared = null; },
    prepare(key, work) {
      const epoch = currentImageOperationEpoch();
      if (prepared && prepared.key === key && prepared.epoch === epoch) return Promise.resolve(prepared.value);
      if (pending && pending.key === key && pending.epoch === epoch) return pending.promise;
      const revision = ++version;
      const promise = Promise.resolve().then(work).then(value => {
        if (revision !== version || epoch !== currentImageOperationEpoch()) return null;
        prepared = { key, value, epoch }; return value;
      }).finally(() => { if (revision === version) pending = null; });
      pending = { key, promise, epoch };
      return promise;
    }
  };
}
