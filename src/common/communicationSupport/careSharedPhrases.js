import { decodeCareMedia } from './careMediaValues';
import { normalizeCommunicationSavedPhrases } from './storage';

// Presentation-only projection. Never save this list in the personal repository.
export function projectCareSharedPhrases(snapshot, role, image) {
  if (!snapshot || snapshot.locked || role === 'patient') return [];
  return Object.values(snapshot.resources || {})
    .filter(resource => resource.kind === 'favorite' && !resource.deleted)
    .flatMap(resource =>
      normalizeCommunicationSavedPhrases([
        {
          ...decodeCareMedia(resource.value, snapshot.media || {}, image),
          id: `family-shared:${resource.id}`,
          createdAt: resource.value.createdAt || resource.updatedAt || 1
        }
      ]).map(item => ({ ...item, careSharedReadOnly: true }))
    );
}

export function isCareSharedPhrase(item) {
  return Boolean(item && item.careSharedReadOnly === true);
}
