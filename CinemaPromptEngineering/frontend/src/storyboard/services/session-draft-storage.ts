const DATABASE_NAME = 'directors-console-session-drafts';
const STORE_NAME = 'drafts';
const DATABASE_VERSION = 1;
const DRAFT_KEY_PREFIX = 'draft:';
const ACTIVE_POINTER_KEY = 'active:pointer';
const ACTIVE_POINTER_KIND = 'active-draft-pointer';
const RECORD_VERSION = 1 as const;

export const SESSION_DRAFT_DATABASE_NAME = DATABASE_NAME;

/**
 * The payload is intentionally opaque to this adapter. Callers must materialize
 * media as Blob values before saving; blob: URL strings are not restorable media.
 */
export interface VersionedDraftRecord<T> {
  version: typeof RECORD_VERSION;
  identity: string;
  updatedAt: number;
  data: T;
}

export interface SaveDraftOptions {
  activate: boolean;
}

export class SessionDraftStorageError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SessionDraftStorageError';
    this.cause = cause;
  }
}

interface ActiveDraftPointer {
  kind: typeof ACTIVE_POINTER_KIND;
  identity: string;
}

type TransactionSetup<T> = (
  store: IDBObjectStore,
  setResult: (value: T) => void,
  abort: (cause: unknown) => void,
) => void;

let database: IDBDatabase | null = null;
let openingDatabase: Promise<IDBDatabase> | null = null;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describeCause(cause: unknown): string {
  return cause instanceof Error && cause.message ? ` (${cause.message})` : '';
}

function operationError(operation: string, cause: unknown): SessionDraftStorageError {
  if (cause instanceof SessionDraftStorageError) return cause;
  return new SessionDraftStorageError(`Session draft ${operation} failed${describeCause(cause)}`, cause);
}

function requireIdentity(identity: string): void {
  if (typeof identity !== 'string' || identity.trim().length === 0) {
    throw new SessionDraftStorageError('Session draft identity must be a non-empty string.');
  }
}

function draftKey(identity: string): string {
  return `${DRAFT_KEY_PREFIX}${identity}`;
}

function validateDraftRecord<T>(value: unknown, expectedIdentity?: string): VersionedDraftRecord<T> {
  if (!isObject(value)) {
    throw new SessionDraftStorageError('Stored session draft is corrupt: its envelope is not an object.');
  }
  if (value.version !== RECORD_VERSION) {
    throw new SessionDraftStorageError(
      `Stored session draft is unsupported: expected envelope version ${RECORD_VERSION}.`,
    );
  }
  if (typeof value.identity !== 'string' || value.identity.trim().length === 0) {
    throw new SessionDraftStorageError('Stored session draft is corrupt: its identity is invalid.');
  }
  if (expectedIdentity !== undefined && value.identity !== expectedIdentity) {
    throw new SessionDraftStorageError('Stored session draft is corrupt: its identity does not match its key.');
  }
  if (typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) {
    throw new SessionDraftStorageError('Stored session draft is corrupt: its updatedAt value is invalid.');
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'data')) {
    throw new SessionDraftStorageError('Stored session draft is corrupt: its data field is missing.');
  }
  return value as unknown as VersionedDraftRecord<T>;
}

function validatePointer(value: unknown): ActiveDraftPointer {
  if (!isObject(value) || value.kind !== ACTIVE_POINTER_KIND) {
    throw new SessionDraftStorageError('Stored active session draft pointer is corrupt.');
  }
  if (typeof value.identity !== 'string' || value.identity.trim().length === 0) {
    throw new SessionDraftStorageError('Stored active session draft pointer has an invalid identity.');
  }
  return value as unknown as ActiveDraftPointer;
}

function openDatabase(): Promise<IDBDatabase> {
  if (database) return Promise.resolve(database);
  if (openingDatabase) return openingDatabase;

  const factory = globalThis.indexedDB;
  if (!factory) {
    return Promise.reject(
      new SessionDraftStorageError('IndexedDB is unavailable; session drafts cannot be stored on this runtime.'),
    );
  }

  let request: IDBOpenDBRequest;
  let settled = false;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const rejectOpen = (cause: unknown): void => {
      if (settled) return;
      settled = true;
      reject(operationError('storage open', cause));
    };

    try {
      request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (cause) {
      rejectOpen(cause);
      return;
    }

    request.onupgradeneeded = (event: IDBVersionChangeEvent): void => {
      try {
        const upgradedDatabase = (event.target as IDBOpenDBRequest).result;
        if (!upgradedDatabase.objectStoreNames.contains(STORE_NAME)) {
          upgradedDatabase.createObjectStore(STORE_NAME);
        }
      } catch (cause) {
        rejectOpen(cause);
        request.transaction?.abort();
      }
    };
    request.onblocked = (): void => {
      rejectOpen(new Error('another connection is blocking the database upgrade; close that connection and retry'));
    };
    request.onerror = (): void => {
      rejectOpen(request.error ?? new Error('the browser reported an IndexedDB open error'));
    };
    request.onsuccess = (): void => {
      const openedDatabase = request.result;
      if (settled) {
        openedDatabase.close();
        return;
      }
      openedDatabase.onversionchange = (): void => {
        if (database === openedDatabase) database = null;
        openedDatabase.close();
      };
      database = openedDatabase;
      settled = true;
      resolve(openedDatabase);
    };
  });

  openingDatabase = pending;
  void pending.then(
    () => {
      if (openingDatabase === pending) openingDatabase = null;
    },
    () => {
      if (openingDatabase === pending) openingDatabase = null;
    },
  );
  return pending;
}

function runTransaction<T>(
  operation: string,
  mode: IDBTransactionMode,
  setup: TransactionSetup<T>,
): Promise<T> {
  return openDatabase().then(
    (openedDatabase) => new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = openedDatabase.transaction(STORE_NAME, mode);
      } catch (cause) {
        reject(operationError(operation, cause));
        return;
      }

      let result: T | undefined;
      let failed = false;
      let failure: unknown;
      let settled = false;

      const abort = (cause: unknown): void => {
        if (!failed) {
          failed = true;
          failure = cause;
        }
        try {
          transaction.abort();
        } catch (abortCause) {
          if (!failure) failure = abortCause;
        }
      };

      transaction.onerror = (): void => {
        if (!failed) {
          failed = true;
          failure = transaction.error ?? new Error('the browser reported an IndexedDB transaction error');
        }
      };
      transaction.onabort = (): void => {
        if (settled) return;
        settled = true;
        reject(operationError(operation, failure ?? transaction.error ?? new Error('transaction aborted')));
      };
      transaction.oncomplete = (): void => {
        if (settled) return;
        settled = true;
        if (failed) {
          reject(operationError(operation, failure ?? new Error('transaction failed')));
        } else {
          resolve(result as T);
        }
      };

      try {
        setup(transaction.objectStore(STORE_NAME), value => {
          result = value;
        }, abort);
      } catch (cause) {
        abort(cause);
      }
    }),
    (cause) => Promise.reject(operationError(operation, cause)),
  );
}

export function saveDraft<T>(record: VersionedDraftRecord<T>, options: SaveDraftOptions): Promise<void> {
  const validatedRecord = validateDraftRecord<T>(record);
  requireIdentity(validatedRecord.identity);
  if (typeof options?.activate !== 'boolean') {
    throw new SessionDraftStorageError('Session draft save requires an explicit boolean activate option.');
  }

  return runTransaction<void>('save', 'readwrite', (store) => {
    store.put(validatedRecord, draftKey(validatedRecord.identity));
    if (options.activate) {
      const pointer: ActiveDraftPointer = {
        kind: ACTIVE_POINTER_KIND,
        identity: validatedRecord.identity,
      };
      store.put(pointer, ACTIVE_POINTER_KEY);
    }
  });
}

export function readDraft<T>(identity: string): Promise<VersionedDraftRecord<T> | null> {
  requireIdentity(identity);
  return runTransaction<VersionedDraftRecord<T> | null>('read', 'readonly', (store, setResult, abort) => {
    const request = store.get(draftKey(identity));
    request.onerror = (): void => {
      abort(request.error ?? new Error('the browser reported an IndexedDB read error'));
    };
    request.onsuccess = (): void => {
      try {
        setResult(request.result === undefined ? null : validateDraftRecord<T>(request.result, identity));
      } catch (cause) {
        abort(cause);
      }
    };
  });
}

export function readActiveDraft<T>(): Promise<VersionedDraftRecord<T> | null> {
  return runTransaction<VersionedDraftRecord<T> | null>('read active', 'readonly', (store, setResult, abort) => {
    const pointerRequest = store.get(ACTIVE_POINTER_KEY);
    pointerRequest.onerror = (): void => {
      abort(pointerRequest.error ?? new Error('the browser reported an IndexedDB pointer read error'));
    };
    pointerRequest.onsuccess = (): void => {
      // An absent pointer is a valid inactive-only/archive state. Only a
      // present pointer is authoritative and therefore subject to validation.
      if (pointerRequest.result === undefined) {
        setResult(null);
        return;
      }

      let pointer: ActiveDraftPointer;
      try {
        pointer = validatePointer(pointerRequest.result);
      } catch (cause) {
        abort(cause);
        return;
      }

      const recordRequest = store.get(draftKey(pointer.identity));
      recordRequest.onerror = (): void => {
        abort(recordRequest.error ?? new Error('the browser reported an IndexedDB active draft read error'));
      };
      recordRequest.onsuccess = (): void => {
        if (recordRequest.result === undefined) {
          abort(new Error('active session draft pointer references a missing draft record'));
          return;
        }
        try {
          setResult(validateDraftRecord<T>(recordRequest.result, pointer.identity));
        } catch (cause) {
          abort(cause);
        }
      };
    };
  });
}

export function deleteDraft(identity: string): Promise<void> {
  requireIdentity(identity);
  return runTransaction<void>('delete', 'readwrite', (store, _setResult, abort) => {
    store.delete(draftKey(identity));
    const pointerRequest = store.get(ACTIVE_POINTER_KEY);
    pointerRequest.onerror = (): void => {
      abort(pointerRequest.error ?? new Error('the browser reported an IndexedDB pointer read error'));
    };
    pointerRequest.onsuccess = (): void => {
      if (pointerRequest.result === undefined) return;
      try {
        const pointer = validatePointer(pointerRequest.result);
        if (pointer.identity === identity) store.delete(ACTIVE_POINTER_KEY);
      } catch (cause) {
        abort(cause);
      }
    };
  });
}
