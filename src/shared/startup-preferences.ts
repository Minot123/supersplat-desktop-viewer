export const VIEW_PREFERENCE_STORAGE_KEYS = {
  initialCameraPose: 'supersplat.desktop.initialCameraPose.v1',
  editor: 'supersplat:preferences',
  language: 'i18nextLng',
  performanceMode: 'performanceMode',
  legacyRetinaDisplay: 'retinaDisplay',
  gamingControls: 'gamingControls',
  showAnnotations: 'showAnnotations'
} as const;

// Reset only app preferences, before either renderer reads them. Subsequent file
// opens and mode switches can still share settings for the rest of this run.
export const resetStartupPreferences = (
  getStorage: () => Pick<Storage, 'removeItem'> = () => window.localStorage
) => {
  try {
    const storage = getStorage();
    for (const key of Object.values(VIEW_PREFERENCE_STORAGE_KEYS)) {
      storage.removeItem(key);
    }
  } catch {
    // Both renderers fall back to defaults when browser storage is unavailable.
  }
};
