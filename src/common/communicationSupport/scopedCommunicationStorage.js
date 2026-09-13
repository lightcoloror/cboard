// Authenticated content never falls back to the former guest/global keys.
// The resolver is evaluated on every access so account switches cannot reuse a
// repository closure pointing at the preceding person's data.
export function createScopedCommunicationStorage(storage, resolve) {
  const keyFor = key => {
    const context = resolve();
    if (!context || !context.accountId) return key;
    const ids = [
      context.accountId,
      context.familyId || 'unselected',
      context.profileId || 'unselected'
    ];
    return `communication-v2:${ids.map(encodeURIComponent).join(':')}:${key}`;
  };
  return {
    getItem: key => {
      const context = resolve();
      if (context?.profileId && key === 'cboard_communication_patient_id')
        return context.profileId;
      if (context?.familyId && key === 'cboard_communication_workspace_id')
        return context.familyId;
      return storage.getItem(keyFor(key));
    },
    setItem: (key, value) => storage.setItem(keyFor(key), value),
    removeItem: key => storage.removeItem(keyFor(key))
  };
}
