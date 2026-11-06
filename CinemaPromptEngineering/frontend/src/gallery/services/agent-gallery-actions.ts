import {
  createFolder,
  getFileInfo,
  moveFiles,
  renameFile,
  restoreFiles,
  setRatings,
  scanFolder,
  scanTree,
  searchFiles,
  trashFiles,
} from './gallery-service';
import { importGalleryMedia } from './agent-gallery-media';
import {
  getGalleryWorkspace,
  refreshGalleryWorkspace,
  setGalleryWorkspace,
} from './gallery-workspace';

export type GalleryAgentRequest =
  | { operation: 'snapshot' }
  | { operation: 'open_folder'; rootPath: string; orchestratorUrl?: string }
  | { operation: 'list'; folderPath?: string }
  | { operation: 'file_info'; filePath: string }
  | { operation: 'import_media'; filePath: string }
  | { operation: 'search'; query: string; folderPath?: string }
  | { operation: 'rename'; filePath: string; newName: string }
  | { operation: 'move'; filePaths: string[]; destination: string }
  | { operation: 'trash'; filePaths: string[] }
  | { operation: 'restore'; filePaths: string[] }
  | { operation: 'create_folder'; parentPath: string; name: string }
  | { operation: 'rate'; ratings: Record<string, number> };

type RequestRecord = Record<string, unknown>;

function requestRecord(value: GalleryAgentRequest): RequestRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Gallery request must be an object.');
  }
  return value as unknown as RequestRecord;
}

function assertKeys(request: RequestRecord, ...allowed: string[]): void {
  const extra = Object.keys(request).find((key) => !allowed.includes(key));
  if (extra) throw new Error(`Unsupported Gallery argument: ${extra}.`);
}

function boundedString(value: unknown, name: string, max = 4096): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  if (value.length > max) throw new Error(`${name} must be ${max} characters or fewer.`);
  if (value.includes('\0')) throw new Error(`${name} cannot contain NUL characters.`);
  return value;
}

function optionalPath(value: unknown): string | undefined {
  return value === undefined ? undefined : boundedString(value, 'Folder path');
}

function serverUrl(value: unknown): string {
  const server = boundedString(value, 'Gallery server URL', 2048).trim();
  let url: URL;
  try {
    url = new URL(server);
  } catch {
    throw new Error('Enter a valid Gallery server URL.');
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new Error('Gallery server must use http or https without credentials.');
  }
  return server.replace(/\/+$/, '');
}

function workspaceForRead() {
  const workspace = getGalleryWorkspace();
  if (!workspace.rootPath) throw new Error('Select a Gallery folder here first.');
  return workspace;
}

function isWorkspaceCurrent(workspace: ReturnType<typeof getGalleryWorkspace>): boolean {
  const current = getGalleryWorkspace();
  return current.revision === workspace.revision
    && current.rootPath === workspace.rootPath
    && current.orchestratorUrl === workspace.orchestratorUrl;
}

function assertWorkspaceCurrent(workspace: ReturnType<typeof getGalleryWorkspace>): void {
  if (!isWorkspaceCurrent(workspace)) throw new Error('Gallery workspace changed while the request was running.');
}

function basename(value: unknown, name: string): string {
  const result = boundedString(value, name);
  if (result.includes('/') || result.includes('\\') || result.includes('..') || result === '.') {
    throw new Error(`${name} must be a basename.`);
  }
  return result;
}

function filePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error('File paths must contain between 1 and 100 items.');
  }
  const paths = value.map((path) => boundedString(path, 'File path'));
  if (new Set(paths).size !== paths.length) throw new Error('File paths must be unique.');
  return paths;
}

async function runMutation<T extends { success: boolean }>(
  workspace: ReturnType<typeof getGalleryWorkspace>,
  write: () => Promise<T>,
  isPartial: (result: T) => boolean = () => false,
  renames?: (result: T) => { old_path: string; new_path: string }[],
): Promise<unknown> {
  assertWorkspaceCurrent(workspace);
  let result: T;
  try {
    result = await write();
  } catch (error) {
    if (!isWorkspaceCurrent(workspace)) return {
      status: 'outcome_unknown_after_scope_change', workspace,
      error: error instanceof Error ? error.message : String(error),
    };
    throw error;
  }
  if (!isWorkspaceCurrent(workspace)) {
    return { status: 'outcome_unknown_after_scope_change', workspace, result };
  }
  if (!result.success) return { status: 'failed', workspace, result };

  refreshGalleryWorkspace(workspace.revision);
  if (renames) {
    const renameMap = Object.fromEntries(renames(result)
      .filter(({ old_path, new_path }) => old_path && new_path && old_path !== new_path)
      .map(({ old_path, new_path }) => [old_path, new_path] as const));
    if (Object.keys(renameMap).length > 0) {
      window.dispatchEvent(new CustomEvent('gallery:files-renamed', { detail: { renameMap } }));
    }
  }
  return {
    status: isPartial(result) ? 'partial' : 'success',
    workspace: getGalleryWorkspace(),
    result,
  };
}

function assertSuccess<T extends { success: boolean; message: string }>(result: T): T {
  if (!result.success) throw new Error(result.message || 'Gallery request failed.');
  return result;
}

export async function dispatchGalleryAgentAction(request: GalleryAgentRequest, isCurrent: () => boolean = () => true, signal?: AbortSignal): Promise<unknown> {
  if (!isCurrent()) throw new Error('The initiating agent action ended.');
  const args = requestRecord(request);
  switch (args.operation) {
    case 'snapshot':
      assertKeys(args, 'operation');
      return getGalleryWorkspace();
    case 'open_folder': {
      assertKeys(args, 'operation', 'rootPath', 'orchestratorUrl');
      const rootPath = boundedString(args.rootPath, 'Folder path');
      const before = getGalleryWorkspace();
      const orchestratorUrl = args.orchestratorUrl === undefined
        ? before.orchestratorUrl
        : serverUrl(args.orchestratorUrl);
      const tree = await scanTree(orchestratorUrl, rootPath);
      if (!isCurrent()) throw new Error('The initiating agent action ended; the Gallery folder was not changed.');
      assertWorkspaceCurrent(before);
      assertSuccess(tree);
      setGalleryWorkspace({ rootPath, orchestratorUrl });
      return { workspace: getGalleryWorkspace(), tree };
    }
    case 'list': {
      assertKeys(args, 'operation', 'folderPath');
      const workspace = workspaceForRead();
      const folderPath = optionalPath(args.folderPath) ?? workspace.rootPath;
      const [result, tree] = await Promise.all([
        scanFolder(workspace.orchestratorUrl, folderPath, workspace.rootPath),
        scanTree(workspace.orchestratorUrl, folderPath),
      ]);
      assertWorkspaceCurrent(workspace);
      return { workspace, result: assertSuccess(result), folders: assertSuccess(tree).folders,
        listingScope: 'Files in this directory and its descendant folder structure; list each folder to read its files.' };
    }
    case 'file_info': {
      assertKeys(args, 'operation', 'filePath');
      const workspace = workspaceForRead();
      const result = await getFileInfo(
        workspace.orchestratorUrl,
        boundedString(args.filePath, 'File path'),
        workspace.rootPath,
      );
      assertWorkspaceCurrent(workspace);
      return { workspace, result: assertSuccess(result) };
    }
    case 'import_media': {
      assertKeys(args, 'operation', 'filePath');
      return await importGalleryMedia(boundedString(args.filePath, 'File path'), signal, isCurrent);
    }
    case 'search': {
      assertKeys(args, 'operation', 'query', 'folderPath');
      const workspace = workspaceForRead();
      const result = await searchFiles(
        workspace.orchestratorUrl,
        workspace.rootPath,
        boundedString(args.query, 'Search query', 4096),
        optionalPath(args.folderPath),
      );
      assertWorkspaceCurrent(workspace);
      return { workspace, result: assertSuccess(result) };
    }
    case 'rename': {
      assertKeys(args, 'operation', 'filePath', 'newName');
      const workspace = workspaceForRead();
      return runMutation(
        workspace,
        () => renameFile(
          workspace.orchestratorUrl,
          boundedString(args.filePath, 'File path'),
          basename(args.newName, 'New name'),
          workspace.rootPath,
        ),
        undefined,
        (result) => [result],
      );
    }
    case 'move': {
      assertKeys(args, 'operation', 'filePaths', 'destination');
      const workspace = workspaceForRead();
      const paths = filePaths(args.filePaths);
      return runMutation(
        workspace,
        () => moveFiles(
          workspace.orchestratorUrl,
          paths,
          boundedString(args.destination, 'Destination'),
          workspace.rootPath,
        ),
        (result) => result.errors.length > 0
          || result.skipped.length > 0
          || result.moved.length < paths.length,
        (result) => result.moved,
      );
    }
    case 'trash':
    case 'restore': {
      assertKeys(args, 'operation', 'filePaths');
      const workspace = workspaceForRead();
      const paths = filePaths(args.filePaths);
      if (args.operation === 'trash') {
        return runMutation(
          workspace,
          () => trashFiles(workspace.orchestratorUrl, paths, workspace.rootPath),
          (result) => result.errors.length > 0 || result.trashed.length < paths.length,
        );
      }
      return runMutation(
        workspace,
        () => restoreFiles(workspace.orchestratorUrl, paths, workspace.rootPath),
        (result) => result.errors.length > 0 || result.restored.length < paths.length,
      );
    }
    case 'create_folder': {
      assertKeys(args, 'operation', 'parentPath', 'name');
      const workspace = workspaceForRead();
      return runMutation(
        workspace,
        () => createFolder(
          workspace.orchestratorUrl,
          boundedString(args.parentPath, 'Parent path'),
          basename(args.name, 'Folder name'),
        ),
      );
    }
    case 'rate': {
      assertKeys(args, 'operation', 'ratings');
      const workspace = workspaceForRead();
      if (!args.ratings || typeof args.ratings !== 'object' || Array.isArray(args.ratings)) {
        throw new Error('Ratings must be an object.');
      }
      const entries = Object.entries(args.ratings as Record<string, unknown>);
      if (entries.length > 100) throw new Error('Ratings may contain at most 100 files.');
      const ratings = Object.fromEntries(entries.map(([path, rating]) => {
        boundedString(path, 'File path');
        if (typeof rating !== 'number' || !Number.isFinite(rating) || !Number.isInteger(rating) || rating < 0 || rating > 5) {
          throw new Error('Ratings must be finite integers from 0 to 5.');
        }
        return [path, rating] as const;
      }));
      return runMutation(
        workspace,
        () => setRatings(workspace.orchestratorUrl, workspace.rootPath, ratings),
      );
    }
    default:
      throw new Error('Unsupported Gallery operation.');
  }
}
