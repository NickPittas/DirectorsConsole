import { recordLoadedProject, recordSavedProject } from './project-recent';

export interface ProjectSaveResult {
  success: boolean;
  savedPath?: string;
  error?: string;
}

export interface ProjectLoadResult {
  success: boolean;
  state?: { project_settings?: { name?: string } };
  error?: string;
}

/** Run the production Save/Save As completion path, recording only success. */
export async function saveProjectAndRecordRecent<T extends ProjectSaveResult>(
  projectName: string,
  save: () => Promise<T>,
): Promise<T> {
  const result = await save();
  if (result.success) recordSavedProject(projectName, result);
  return result;
}

/** Run the production selected-file load completion path, recording only success. */
export async function loadProjectAndRecordRecent<T extends ProjectLoadResult>(
  projectFilePath: string,
  load: () => Promise<T>,
): Promise<T> {
  const result = await load();
  if (result.success && result.state) recordLoadedProject(projectFilePath, result);
  return result;
}
