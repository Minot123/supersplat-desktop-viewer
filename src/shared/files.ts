export const SUPPORTED_FILE_LABELS = ['.ply', '.sog', '.meta.json', '.lod-meta.json'] as const;

export type OpenFilePayload = {
  directory: string;
  name: string;
  path: string;
};
