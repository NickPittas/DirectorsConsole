import type { ApplicationCommand, ApplicationResult } from './contracts.js';

/** Transport commands never carry the Console's private project identity. */
export type WorkspaceCommand = CommandWithoutProject<ApplicationCommand>;

type CommandWithoutProject<Command> = Command extends ApplicationCommand
  ? Omit<Command, 'projectIdentity' | 'expectedConsoleBindingId'> & (
    Command['action'] extends 'prompt_engineer_action' | 'gallery_action' | 'inspect_media' | 'get_prompt_guidance' | 'get_application_snapshot'
      ? { expectedConsoleBindingId?: never }
      : { expectedConsoleBindingId: string }
  )
  : never;

export interface WorkspaceCommandMessage {
  sessionId: string;
  command: WorkspaceCommand;
}

export interface WorkspaceActionResult extends ApplicationResult {
  /** The original activation, even when another Console project is now active. */
  consoleBindingId?: string;
}

/** Browser-private context; never include projectIdentity in a tool result. */
export interface WorkspaceConsoleContext {
  bindingId: string;
  projectIdentity: string;
  projectRevision: number;
}

export interface WorkspaceConsoleAdapter {
  getContext(): WorkspaceConsoleContext | null;
  dispatch(command: ApplicationCommand): Promise<ApplicationResult>;
}
