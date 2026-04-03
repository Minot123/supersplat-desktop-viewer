export const SUPPORTED_FILE_LABELS = ['.ply', '.sog', '.ssproj', '.meta.json', '.lod-meta.json'] as const;

export type OpenFilePayload = {
  contentName: string;
  directory: string;
  name: string;
  path: string;
  sizeBytes: number;
};
