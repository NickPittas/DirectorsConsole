export type GalleryStatusKind = 'loading' | 'empty' | 'error';

export interface GalleryStatusInput {
  projectPath: string;
  isProjectLoading: boolean;
  isLoading: boolean;
  isLoadingFiles: boolean;
  error: string | null;
  currentFiles: unknown[];
}

export interface GalleryStatus {
  kind: GalleryStatusKind;
  message: string;
}

export function getGalleryStatus(input: GalleryStatusInput): GalleryStatus {
  if (!input.projectPath) {
    return input.isProjectLoading
      ? { kind: 'loading', message: 'Loading project…' }
      : { kind: 'empty', message: 'Open a project in Storyboard to browse the gallery' };
  }
  if (input.error) return { kind: 'error', message: input.error };
  if (input.isLoadingFiles) return { kind: 'loading', message: 'Loading files…' };
  if (input.isLoading) return { kind: 'loading', message: 'Scanning folders…' };
  if (input.isProjectLoading) return { kind: 'loading', message: 'Loading project…' };
  if (input.currentFiles.length === 0) return { kind: 'empty', message: 'No files in this folder' };
  return { kind: 'empty', message: '' };
}

export function isCurrentGalleryRequest(
  requestId: number,
  currentRequestId: number,
  requestProjectPath: string,
  currentProjectPath: string,
): boolean {
  return requestId === currentRequestId && requestProjectPath === currentProjectPath;
}

export async function runGuardedGalleryRequest<T>(
  requestId: number,
  requestProjectPath: string,
  getCurrent: () => { requestId: number; projectPath: string },
  request: () => Promise<T>,
  apply: (result: T) => void | Promise<void>,
  fail: (error: unknown) => void,
  finish: () => void,
): Promise<void> {
  const isCurrent = () => {
    const current = getCurrent();
    return isCurrentGalleryRequest(
      requestId,
      current.requestId,
      requestProjectPath,
      current.projectPath,
    );
  };

  try {
    const result = await request();
    if (isCurrent()) await apply(result);
  } catch (error) {
    if (isCurrent()) fail(error);
  } finally {
    if (isCurrent()) finish();
  }
}
