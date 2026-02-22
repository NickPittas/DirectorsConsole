/**
 * Gallery API Service
 *
 * Frontend service for communicating with the Orchestrator backend's gallery
 * endpoints (port 9820). Uses raw fetch — no axios, no TanStack Query.
 *
 * Every exported function takes `orchestratorUrl` as its first parameter so
 * callers can resolve the URL at runtime from project settings.
 */

// ---------------------------------------------------------------------------
// Types — Data models
// ---------------------------------------------------------------------------

export interface TagInfo {
  id: number;
  name: string;
  color: string;
}

export interface FileEntry {
  name: string;
  path: string;
  rel_path: string;
  size: number;
  modified: number;
  created: number;
  type: 'image' | 'video';
  extension: string;
  width?: number;
  height?: number;
  rating: number;
  tags: TagInfo[];
}

export interface FolderEntry {
  name: string;
  path: string;
  rel_path: string;
  files: FileEntry[];
  subfolders: string[];
  file_count: number;
  total_size: number;
}

export interface TrashEntry {
  name: string;
  path: string;
  original_path: string;
  size: number;
  trashed_at: string;
}

export interface ViewState {
  name: string;
  view_mode: string;
  sort_field: string;
  sort_direction: string;
  thumbnail_size: number;
  filters_json: string;
  current_path: string;
  folder_tree_state: string;
}

export interface SearchResult {
  file_path: string;
  rel_path: string;
  match_field: string;
  match_context: string;
  rating: number;
}

export interface DuplicateFile {
  name: string;
  path: string;
  size: number;
  modified: number;
}

export interface DuplicateGroup {
  hash: string;
  files: DuplicateFile[];
  size: number;
}

export interface FolderStats {
  path: string;
  total_files: number;
  total_size: number;
  image_count: number;
  video_count: number;
  subfolder_count: number;
  by_extension: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Types — Response envelopes
// ---------------------------------------------------------------------------

export interface ScanResult {
  success: boolean;
  folders: FolderEntry[];
  total_files: number;
  total_size: number;
  message: string;
}

/** Lightweight folder entry — no file data, just structure. */
export interface TreeFolderEntry {
  name: string;
  path: string;
  rel_path: string;
  subfolders: string[];
  file_count: number;
}

export interface ScanTreeResult {
  success: boolean;
  folders: TreeFolderEntry[];
  message: string;
}

export interface ScanFolderResult {
  success: boolean;
  files: FileEntry[];
  folder_path: string;
  message: string;
}

export interface FileInfoResult {
  success: boolean;
  file: FileEntry | null;
  png_metadata: Record<string, unknown> | null;
  message: string;
}

export interface MoveFilesResult {
  success: boolean;
  moved: { old_path: string; new_path: string }[];
  skipped: string[];
  errors: string[];
  message: string;
}

export interface RenameFileResult {
  success: boolean;
  old_path: string;
  new_path: string;
  message: string;
}

export interface BatchRenamePreview {
  old_path: string;
  old_name: string;
  new_name: string;
  new_path: string;
}

export interface BatchRenameResult {
  success: boolean;
  previews: BatchRenamePreview[];
  renamed: number;
  errors: string[];
  message: string;
}

export interface TrashFilesResult {
  success: boolean;
  trashed: string[];
  errors: string[];
  message: string;
}

export interface TrashListResult {
  success: boolean;
  files: TrashEntry[];
  total_size: number;
  message: string;
}

export interface RestoreResult {
  success: boolean;
  restored: string[];
  errors: string[];
  message: string;
}

export interface EmptyTrashResult {
  success: boolean;
  message: string;
}

export interface RatingsGetResult {
  success: boolean;
  ratings: Record<string, number>;
  message: string;
}

export interface RatingsSetResult {
  success: boolean;
  ratings: Record<string, number>;
  message: string;
}

export interface TagsListResult {
  success: boolean;
  tags: TagInfo[];
  message: string;
}

export interface TagCreateResult {
  success: boolean;
  tag: TagInfo;
  message: string;
}

export interface TagDeleteResult {
  success: boolean;
  message: string;
}

export interface FileTagsResult {
  success: boolean;
  message: string;
  tags?: TagInfo[];
}

export interface ViewGetResult {
  success: boolean;
  view: ViewState | null;
  message: string;
}

export interface ViewSaveResult {
  success: boolean;
  message: string;
}

export interface SearchResultResponse {
  success: boolean;
  results: SearchResult[];
  total: number;
  message: string;
}

export interface FindDuplicatesResult {
  success: boolean;
  groups: DuplicateGroup[];
  total_duplicates: number;
  wasted_space: number;
  message: string;
}

export interface FolderStatsResult {
  success: boolean;
  path: string;
  total_files: number;
  total_size: number;
  image_count: number;
  video_count: number;
  subfolder_count: number;
  by_extension: Record<string, number>;
  message: string;
}

// ---------------------------------------------------------------------------
// Types — Request bodies (exported for callers that want to build them ahead)
// ---------------------------------------------------------------------------

export interface ScanRecursiveRequest {
  folder_path: string;
  include_dimensions?: boolean;
}

export interface FileInfoRequest {
  file_path: string;
  project_path?: string;
}

export interface MoveFilesRequest {
  file_paths: string[];
  target_folder: string;
  project_path?: string;
  conflict?: 'skip' | 'overwrite' | 'rename';
}

export interface RenameFileRequest {
  file_path: string;
  new_name: string;
  project_path?: string;
}

export interface BatchRenameRequest {
  file_paths: string[];
  pattern: string;
  start_index?: number;
  pad_width?: number;
  project_path?: string;
  dry_run?: boolean;
}

export interface AutoRenameRequest {
  folder_path: string;
  naming_pattern?: string;
  project_path?: string;
  dry_run?: boolean;
}

export interface TrashFilesRequest {
  file_paths: string[];
  project_path: string;
  use_os_trash?: boolean;
}

export interface RestoreRequest {
  file_paths: string[];
  project_path: string;
}

export interface EmptyTrashRequest {
  project_path: string;
}

export interface RatingsSetRequest {
  project_path: string;
  ratings: Record<string, number>;
}

export interface TagCreateRequest {
  project_path: string;
  name: string;
  color?: string;
}

export interface FileTagsRequest {
  project_path: string;
  file_path: string;
  tag_ids: number[];
  action: 'add' | 'remove';
}

export interface ViewStateRequest {
  project_path: string;
  name: string;
  view_mode: string;
  sort_field: string;
  sort_direction: string;
  thumbnail_size: number;
  filters_json: string;
  current_path: string;
  folder_tree_state: string;
}

export interface SearchRequest {
  project_path: string;
  query: string;
  folder_path?: string;
  max_results?: number;
}

export interface FindDuplicatesRequest {
  folder_path: string;
  project_path?: string;
}

export interface FolderStatsRequest {
  folder_path: string;
}

// ---------------------------------------------------------------------------
// Internal fetch helpers
// ---------------------------------------------------------------------------

async function _post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gallery API error ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

async function _get<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gallery API error ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

async function _delete<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gallery API error ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Recursively scan a folder for image and video files.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator (e.g. `http://localhost:9820`)
 * @param folderPath      - Absolute path of the folder to scan
 * @param includeDimensions - If true, read image dimensions (slower)
 */
export async function scanRecursive(
  orchestratorUrl: string,
  folderPath: string,
  includeDimensions?: boolean,
): Promise<ScanResult> {
  const body: ScanRecursiveRequest = {
    folder_path: folderPath,
    include_dimensions: includeDimensions,
  };
  return _post<ScanResult>(`${orchestratorUrl}/api/gallery/scan-recursive`, body);
}

/**
 * Scan only the folder tree structure — no file metadata, no stat calls.
 * Returns almost instantly even on NAS.
 */
export async function scanTree(
  orchestratorUrl: string,
  folderPath: string,
): Promise<ScanTreeResult> {
  return _post<ScanTreeResult>(`${orchestratorUrl}/api/gallery/scan-tree`, { folder_path: folderPath });
}

/**
 * Scan a single folder for media files (NOT recursive).
 * Used when the user clicks on a folder in the tree.
 */
export async function scanFolder(
  orchestratorUrl: string,
  folderPath: string,
  projectPath: string,
): Promise<ScanFolderResult> {
  return _post<ScanFolderResult>(`${orchestratorUrl}/api/gallery/scan-folder`, {
    folder_path: folderPath,
    project_path: projectPath,
  });
}

/**
 * Get detailed info for a single file, including PNG metadata if applicable.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param filePath        - Absolute path to the file
 * @param projectPath     - Optional project path for resolving ratings/tags
 */
export async function getFileInfo(
  orchestratorUrl: string,
  filePath: string,
  projectPath?: string,
): Promise<FileInfoResult> {
  const body: FileInfoRequest = {
    file_path: filePath,
    project_path: projectPath,
  };
  return _post<FileInfoResult>(`${orchestratorUrl}/api/gallery/file-info`, body);
}

/**
 * Move one or more files to a target folder.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param filePaths       - Array of absolute file paths to move
 * @param targetFolder    - Destination folder path
 * @param projectPath     - Optional project path
 * @param conflict        - Conflict resolution strategy: 'skip' | 'overwrite' | 'rename'
 */
export async function moveFiles(
  orchestratorUrl: string,
  filePaths: string[],
  targetFolder: string,
  projectPath?: string,
  conflict?: 'skip' | 'overwrite' | 'rename',
): Promise<MoveFilesResult> {
  const body: MoveFilesRequest = {
    file_paths: filePaths,
    target_folder: targetFolder,
    project_path: projectPath,
    conflict,
  };
  return _post<MoveFilesResult>(`${orchestratorUrl}/api/gallery/move-files`, body);
}

/**
 * Create a new folder on the filesystem.
 */
export async function createFolder(
  orchestratorUrl: string,
  parentPath: string,
  folderName: string,
): Promise<{ success: boolean; created_path: string; message: string }> {
  return _post<{ success: boolean; created_path: string; message: string }>(
    `${orchestratorUrl}/api/create-folder`,
    { parent_path: parentPath, folder_name: folderName },
  );
}

/**
 * Rename a single file.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param filePath        - Absolute path to the file to rename
 * @param newName         - New filename (name only, not full path)
 * @param projectPath     - Optional project path
 */
export async function renameFile(
  orchestratorUrl: string,
  filePath: string,
  newName: string,
  projectPath?: string,
): Promise<RenameFileResult> {
  const body: RenameFileRequest = {
    file_path: filePath,
    new_name: newName,
    project_path: projectPath,
  };
  return _post<RenameFileResult>(`${orchestratorUrl}/api/gallery/rename-file`, body);
}

/**
 * Batch-rename multiple files using a pattern with index substitution.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param filePaths       - Array of absolute file paths
 * @param pattern         - Naming pattern (e.g. `shot_{index}`)
 * @param startIndex      - Starting index number (default 1)
 * @param projectPath     - Optional project path
 * @param dryRun          - If true, return previews without renaming
 */
export async function batchRename(
  orchestratorUrl: string,
  filePaths: string[],
  pattern: string,
  startIndex?: number,
  padWidth?: number,
  projectPath?: string,
  dryRun?: boolean,
): Promise<BatchRenameResult> {
  const body: BatchRenameRequest = {
    file_paths: filePaths,
    pattern,
    start_index: startIndex,
    pad_width: padWidth,
    project_path: projectPath,
    dry_run: dryRun,
  };
  return _post<BatchRenameResult>(`${orchestratorUrl}/api/gallery/batch-rename`, body);
}

/**
 * Auto-rename all files in a folder using a naming pattern.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param folderPath      - Absolute path to the folder
 * @param namingPattern   - Optional naming pattern override
 * @param projectPath     - Optional project path
 * @param dryRun          - If true, return previews without renaming
 */
export async function autoRename(
  orchestratorUrl: string,
  folderPath: string,
  namingPattern?: string,
  projectPath?: string,
  dryRun?: boolean,
): Promise<BatchRenameResult> {
  const body: AutoRenameRequest = {
    folder_path: folderPath,
    naming_pattern: namingPattern,
    project_path: projectPath,
    dry_run: dryRun,
  };
  return _post<BatchRenameResult>(`${orchestratorUrl}/api/gallery/auto-rename`, body);
}

/**
 * Move files to the project trash folder (or OS trash).
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param filePaths       - Array of absolute file paths to trash
 * @param projectPath     - Project path (required for trash folder location)
 * @param useOsTrash      - If true, use OS recycle bin instead of project trash
 */
export async function trashFiles(
  orchestratorUrl: string,
  filePaths: string[],
  projectPath: string,
  useOsTrash?: boolean,
): Promise<TrashFilesResult> {
  const body: TrashFilesRequest = {
    file_paths: filePaths,
    project_path: projectPath,
    use_os_trash: useOsTrash,
  };
  return _post<TrashFilesResult>(`${orchestratorUrl}/api/gallery/trash`, body);
}

/**
 * List files currently in the project trash.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param projectPath     - Project path to look up the trash folder
 */
export async function listTrash(
  orchestratorUrl: string,
  projectPath: string,
): Promise<TrashListResult> {
  const params = new URLSearchParams({ project_path: projectPath });
  return _get<TrashListResult>(`${orchestratorUrl}/api/gallery/trash?${params.toString()}`);
}

/**
 * Restore previously trashed files back to their original locations.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param filePaths       - Array of trash-folder file paths to restore
 * @param projectPath     - Project path
 */
export async function restoreFiles(
  orchestratorUrl: string,
  filePaths: string[],
  projectPath: string,
): Promise<RestoreResult> {
  const body: RestoreRequest = {
    file_paths: filePaths,
    project_path: projectPath,
  };
  return _post<RestoreResult>(`${orchestratorUrl}/api/gallery/restore`, body);
}

/**
 * Permanently delete all files in the project trash.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param projectPath     - Project path
 */
export async function emptyTrash(
  orchestratorUrl: string,
  projectPath: string,
): Promise<EmptyTrashResult> {
  const body: EmptyTrashRequest = {
    project_path: projectPath,
  };
  return _post<EmptyTrashResult>(`${orchestratorUrl}/api/gallery/empty-trash`, body);
}

/**
 * Get all file ratings for a project.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param projectPath     - Project path
 */
export async function getRatings(
  orchestratorUrl: string,
  projectPath: string,
): Promise<RatingsGetResult> {
  const params = new URLSearchParams({ project_path: projectPath });
  return _get<RatingsGetResult>(`${orchestratorUrl}/api/gallery/ratings?${params.toString()}`);
}

/**
 * Set (merge) file ratings for a project.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param projectPath     - Project path
 * @param ratings         - Map of file path to rating value
 */
export async function setRatings(
  orchestratorUrl: string,
  projectPath: string,
  ratings: Record<string, number>,
): Promise<RatingsSetResult> {
  const body: RatingsSetRequest = {
    project_path: projectPath,
    ratings,
  };
  return _post<RatingsSetResult>(`${orchestratorUrl}/api/gallery/ratings`, body);
}

/**
 * List all tags defined in a project.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param projectPath     - Project path
 */
export async function listTags(
  orchestratorUrl: string,
  projectPath: string,
): Promise<TagsListResult> {
  const params = new URLSearchParams({ project_path: projectPath });
  return _get<TagsListResult>(`${orchestratorUrl}/api/gallery/tags?${params.toString()}`);
}

/**
 * Create a new tag in the project.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param projectPath     - Project path
 * @param name            - Tag display name
 * @param color           - Optional hex color (e.g. `#ff0000`)
 */
export async function createTag(
  orchestratorUrl: string,
  projectPath: string,
  name: string,
  color?: string,
): Promise<TagCreateResult> {
  const body: TagCreateRequest = {
    project_path: projectPath,
    name,
    color,
  };
  return _post<TagCreateResult>(`${orchestratorUrl}/api/gallery/tags`, body);
}

/**
 * Delete a tag from the project.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param projectPath     - Project path
 * @param tagId           - Numeric tag ID to delete
 */
export async function deleteTag(
  orchestratorUrl: string,
  projectPath: string,
  tagId: number,
): Promise<TagDeleteResult> {
  const params = new URLSearchParams({
    project_path: projectPath,
    tag_id: String(tagId),
  });
  return _delete<TagDeleteResult>(`${orchestratorUrl}/api/gallery/tags?${params.toString()}`);
}

/**
 * Add or remove tags from a file.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param projectPath     - Project path
 * @param filePath        - Absolute path to the file
 * @param tagIds          - Array of tag IDs to add or remove
 * @param action          - 'add' to attach tags, 'remove' to detach them
 */
export async function updateFileTags(
  orchestratorUrl: string,
  projectPath: string,
  filePath: string,
  tagIds: number[],
  action: 'add' | 'remove',
): Promise<FileTagsResult> {
  const body: FileTagsRequest = {
    project_path: projectPath,
    file_path: filePath,
    tag_ids: tagIds,
    action,
  };
  return _post<FileTagsResult>(`${orchestratorUrl}/api/gallery/file-tags`, body);
}

/**
 * Retrieve a saved gallery view state.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param projectPath     - Project path
 * @param name            - View name (defaults to `'default'`)
 */
export async function getView(
  orchestratorUrl: string,
  projectPath: string,
  name: string = 'default',
): Promise<ViewGetResult> {
  const params = new URLSearchParams({ project_path: projectPath, name });
  return _get<ViewGetResult>(`${orchestratorUrl}/api/gallery/views?${params.toString()}`);
}

/**
 * Save the current gallery view state.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param viewState       - Full view state payload including project_path
 */
export async function saveView(
  orchestratorUrl: string,
  viewState: ViewStateRequest,
): Promise<ViewSaveResult> {
  return _post<ViewSaveResult>(`${orchestratorUrl}/api/gallery/views`, viewState);
}

/**
 * Search for files by name, metadata, or prompt text.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param projectPath     - Project path
 * @param query           - Search query string
 * @param folderPath      - Optional folder to limit the search scope
 * @param maxResults      - Maximum number of results to return
 */
export async function searchFiles(
  orchestratorUrl: string,
  projectPath: string,
  query: string,
  folderPath?: string,
  maxResults?: number,
): Promise<SearchResultResponse> {
  const body: SearchRequest = {
    project_path: projectPath,
    query,
    folder_path: folderPath,
    max_results: maxResults,
  };
  return _post<SearchResultResponse>(`${orchestratorUrl}/api/gallery/search`, body);
}

/**
 * Find duplicate files in a folder by content hash.
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param folderPath      - Absolute path to the folder to scan
 * @param projectPath     - Optional project path
 */
export async function findDuplicates(
  orchestratorUrl: string,
  folderPath: string,
  projectPath?: string,
): Promise<FindDuplicatesResult> {
  const body: FindDuplicatesRequest = {
    folder_path: folderPath,
    project_path: projectPath,
  };
  return _post<FindDuplicatesResult>(`${orchestratorUrl}/api/gallery/find-duplicates`, body);
}

/**
 * Get aggregate statistics for a folder (file counts, sizes, breakdowns).
 *
 * @param orchestratorUrl - Base URL of the Orchestrator
 * @param folderPath      - Absolute path to the folder
 */
export async function getFolderStats(
  orchestratorUrl: string,
  folderPath: string,
): Promise<FolderStatsResult> {
  const body: FolderStatsRequest = {
    folder_path: folderPath,
  };
  return _post<FolderStatsResult>(`${orchestratorUrl}/api/gallery/folder-stats`, body);
}
