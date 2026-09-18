export const RECENT_PROJECTS_KEY = 'storyboard_recent_projects';
export const MAX_RECENT_PROJECTS = 10;

export interface RecentProject {
  name: string;
  path: string;
  projectDir: string;
  lastOpened: string;
}

interface SavedProjectResult {
  success: boolean;
  savedPath?: string;
}

interface LoadedProjectResult {
  success: boolean;
  state?: { project_settings?: { name?: string } };
}

export function getRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentProject(name: string, projectFilePath: string): void {
  const recents = getRecentProjects();
  const lastSlash = Math.max(projectFilePath.lastIndexOf('/'), projectFilePath.lastIndexOf('\\'));
  const projectDir = lastSlash > 0 ? projectFilePath.substring(0, lastSlash) : projectFilePath;
  const filtered = recents.filter(
    (recent) => recent.path.toLowerCase() !== projectFilePath.toLowerCase(),
  );

  filtered.unshift({
    name: name || getProjectFilename(projectFilePath),
    path: projectFilePath,
    projectDir,
    lastOpened: new Date().toISOString(),
  });
  localStorage.setItem(
    RECENT_PROJECTS_KEY,
    JSON.stringify(filtered.slice(0, MAX_RECENT_PROJECTS)),
  );
}

export function recordSavedProject(name: string, result: SavedProjectResult): void {
  if (result.success && result.savedPath) {
    addRecentProject(name || 'Untitled', result.savedPath);
  }
}

export function recordLoadedProject(
  selectedProjectFilePath: string,
  result: LoadedProjectResult,
): void {
  if (result.success && result.state && selectedProjectFilePath) {
    addRecentProject(
      result.state.project_settings?.name || getProjectFilename(selectedProjectFilePath),
      selectedProjectFilePath,
    );
  }
}

export function removeRecentProject(projectFilePath: string): void {
  const filtered = getRecentProjects().filter(
    (recent) => recent.path.toLowerCase() !== projectFilePath.toLowerCase(),
  );
  localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(filtered));
}

export function clearRecentProjects(): void {
  localStorage.removeItem(RECENT_PROJECTS_KEY);
}

function getProjectFilename(projectFilePath: string): string {
  const filename = projectFilePath.split(/[\\/]/).pop() || '';
  return filename.replace(/_project\.json$/i, '') || filename || 'Untitled';
}
