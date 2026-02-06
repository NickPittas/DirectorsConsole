/**
 * FileBrowser - Windows Explorer-like file browser for Load/Save operations
 */

export { FileBrowserDialog } from './FileBrowserDialog';
export type { FileBrowserDialogProps } from './FileBrowserDialog';
export { useFileBrowser } from './hooks/useFileBrowser';
export type {
  TreeNode,
  FolderItem,
  ProjectMetadata,
  FileBrowserState,
  UseFileBrowserReturn,
} from './hooks/useFileBrowser';
export { DriveTreeView } from './components/DriveTreeView';
export { FolderContentsView } from './components/FolderContentsView';
export { BreadcrumbBar } from './components/BreadcrumbBar';
