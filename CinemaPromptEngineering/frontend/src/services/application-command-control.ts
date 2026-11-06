const commandChecks = new WeakMap<object, () => boolean>();

/** Keep browser-only authority attached to the exact dispatched command. */
export function trackApplicationCommand(command: object, check: () => boolean): () => void {
  commandChecks.set(command, check);
  return () => commandChecks.set(command, () => false);
}

export function isApplicationCommandCurrent(command: object): boolean {
  try {
    return commandChecks.get(command)?.() ?? true;
  } catch {
    return false;
  }
}
