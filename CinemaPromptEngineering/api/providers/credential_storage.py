"""Server-side credential storage with encryption.

Stores LLM provider credentials in a local SQLite database with Fernet encryption.
The encryption key is derived from a machine-specific identifier or can be set via
environment variable for portability.
"""

import os
import json
import sqlite3
import hashlib
import base64
import logging
from pathlib import Path
from typing import Optional
from datetime import datetime

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class CredentialStorageError(RuntimeError):
    """A stored credential row exists but cannot be read safely."""


# =============================================================================
# Models
# =============================================================================

class ProviderCredentials(BaseModel):
    """Credentials for a single provider."""
    api_key: Optional[str] = None
    endpoint: Optional[str] = None
    oauth_token: Optional[str] = None
    oauth_refresh_token: Optional[str] = None
    oauth_expires_at: Optional[float] = None
    oauth_client_id: Optional[str] = None
    oauth_client_secret: Optional[str] = None
    updated_at: Optional[str] = None


class StoredSettings(BaseModel):
    """Complete stored settings."""
    active_provider: Optional[str] = None
    selected_model: Optional[str] = None
    target_model: Optional[str] = None
    providers: dict[str, ProviderCredentials] = {}


# =============================================================================
# Encryption
# =============================================================================

def _get_machine_id() -> str:
    """Get a machine-specific identifier for key derivation.
    
    Falls back to MAC address or hostname if machine ID cannot be determined.
    Handles PyInstaller bundled executables gracefully.
    """
    # Try environment variable first (for portability)
    env_key = os.environ.get("CINEMA_ENCRYPTION_SEED")
    if env_key:
        return env_key
    
    # Check for stored machine ID file first (ensures consistency across restarts)
    # This is especially important for PyInstaller where subprocess calls may fail
    if os.name == 'nt':
        machine_id_file = Path(os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming')) / 'CinemaPromptEngineering' / '.machine_id'
    else:
        machine_id_file = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local' / 'share')) / 'CinemaPromptEngineering' / '.machine_id'
    
    if machine_id_file.exists():
        try:
            stored_id = machine_id_file.read_text().strip()
            if stored_id:
                return stored_id
        except Exception:
            pass
    
    # Generate and store a new machine ID
    machine_id = None
    
    # Try to get machine-specific ID
    try:
        # Windows
        if os.name == 'nt':
            import subprocess
            # Use creationflags to hide console window in PyInstaller
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE
            
            result = subprocess.run(
                ['wmic', 'csproduct', 'get', 'uuid'],
                capture_output=True, text=True, timeout=5,
                startupinfo=startupinfo,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1 and lines[1].strip():
                machine_id = lines[1].strip()
        
        # Linux - machine-id
        if machine_id is None:
            linux_machine_id_path = Path("/etc/machine-id")
            if linux_machine_id_path.exists():
                machine_id = linux_machine_id_path.read_text().strip()
        
        # macOS - hardware UUID
        if machine_id is None and os.name != 'nt':
            import subprocess
            result = subprocess.run(
                ['system_profiler', 'SPHardwareDataType'],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.split('\n'):
                if 'Hardware UUID' in line:
                    machine_id = line.split(':')[1].strip()
                    break
    except Exception as e:
        logger.warning(f"Could not get machine ID via system command: {e}")
    
    # Secondary fallback - use MAC address (stable across sessions)
    if machine_id is None:
        try:
            import uuid as uuid_lib
            mac = uuid_lib.getnode()
            machine_id = f"mac-{mac:012x}"
        except Exception as e:
            logger.warning(f"Could not get MAC address: {e}")
    
    # Final fallback - use hostname + username
    if machine_id is None:
        import socket
        import getpass
        machine_id = f"{socket.gethostname()}-{getpass.getuser()}-cinema-fallback"
    
    # Store the machine ID for future use (ensures consistency)
    try:
        machine_id_file.parent.mkdir(parents=True, exist_ok=True)
        machine_id_file.write_text(machine_id)
    except Exception as e:
        logger.warning(f"Could not store machine ID file: {e}")
    
    return machine_id


def _derive_key(seed: str, salt: bytes) -> bytes:
    """Derive an encryption key from a seed string."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=498000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(seed.encode()))
    return key


class CredentialEncryption:
    """Handles encryption/decryption of credentials."""
    
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._fernet: Optional[Fernet] = None
        self._salt: Optional[bytes] = None
    
    def _ensure_initialized(self, conn: sqlite3.Connection):
        """Ensure encryption is initialized with salt from DB."""
        if self._fernet is not None:
            return
        
        # Get or create salt
        cursor = conn.execute("SELECT value FROM metadata WHERE key = 'salt'")
        row = cursor.fetchone()
        
        if row:
            self._salt = base64.b64decode(row[0])
        else:
            # Generate new salt
            self._salt = os.urandom(16)
            conn.execute(
                "INSERT INTO metadata (key, value) VALUES (?, ?)",
                ('salt', base64.b64encode(self._salt).decode())
            )
            conn.commit()
        
        # Derive key
        machine_id = _get_machine_id()
        key = _derive_key(machine_id, self._salt)
        self._fernet = Fernet(key)
    
    def encrypt(self, data: str, conn: sqlite3.Connection) -> str:
        """Encrypt a string."""
        self._ensure_initialized(conn)
        return self._fernet.encrypt(data.encode()).decode()
    
    def decrypt(self, data: str, conn: sqlite3.Connection) -> str:
        """Decrypt a string."""
        self._ensure_initialized(conn)
        return self._fernet.decrypt(data.encode()).decode()


# =============================================================================
# Storage
# =============================================================================

class CredentialStorage:
    """SQLite-based credential storage with encryption."""
    
    def __init__(self, db_path: Optional[Path] = None):
        if db_path is None:
            # Default to user data directory
            if os.name == 'nt':
                base = Path(os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming'))
            else:
                base = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local' / 'share'))
            
            db_path = base / 'CinemaPromptEngineering' / 'credentials.db'
        
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        self._encryption = CredentialEncryption(db_path)
        self._init_db()
        
        # Pre-initialize encryption to catch issues early
        self._pre_init_encryption()
    
    def _pre_init_encryption(self):
        """Pre-initialize encryption to ensure it's ready before first use."""
        try:
            with self._get_connection() as conn:
                self._encryption._ensure_initialized(conn)
            logger.info("[Storage] Encryption initialized successfully")
        except Exception as e:
            logger.error(f"[Storage] Failed to initialize encryption: {e}")
            raise
    
    def _init_db(self):
        """Initialize the database schema."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS credentials (
                    provider_id TEXT PRIMARY KEY,
                    encrypted_data TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            
            conn.commit()
    
    def _get_connection(self) -> sqlite3.Connection:
        """Get a database connection."""
        return sqlite3.connect(self.db_path)
    
    # -------------------------------------------------------------------------
    # Settings (non-sensitive)
    # -------------------------------------------------------------------------
    
    def get_setting(self, key: str) -> Optional[str]:
        """Get a non-sensitive setting."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT value FROM settings WHERE key = ?",
                (key,)
            )
            row = cursor.fetchone()
            return row[0] if row else None
    
    def set_setting(self, key: str, value: str):
        """Set a non-sensitive setting."""
        with self._get_connection() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO settings (key, value, updated_at) 
                   VALUES (?, ?, ?)""",
                (key, value, datetime.utcnow().isoformat())
            )
            conn.commit()
    
    # -------------------------------------------------------------------------
    # Credentials (sensitive, encrypted)
    # -------------------------------------------------------------------------
    
    def get_credentials(self, provider_id: str) -> Optional[ProviderCredentials]:
        """Get credentials for a provider.

        Returns ``None`` only when no row exists. Existing rows that cannot be
        decrypted or decoded raise ``CredentialStorageError`` so callers cannot
        mistake unreadable data for a new provider.
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    "SELECT encrypted_data, updated_at FROM credentials WHERE provider_id = ?",
                    (provider_id,)
                )
                row = cursor.fetchone()

                if not row:
                    logger.debug(f"[Storage] No credentials found for {provider_id}")
                    return None

                try:
                    decrypted = self._encryption.decrypt(row[0], conn)
                    data = json.loads(decrypted)
                    data['updated_at'] = row[1]
                    logger.debug(f"[Storage] Successfully loaded credentials for {provider_id}")
                    return ProviderCredentials(**data)
                except Exception as e:
                    logger.error(f"Failed to read credentials for {provider_id}: {e}")
                    raise CredentialStorageError(
                        f"Unable to read stored credentials for '{provider_id}'. "
                        "Restore the original CINEMA_ENCRYPTION_SEED or machine "
                        "identity; do not erase the credential data."
                    ) from e
        except CredentialStorageError:
            raise
        except Exception as e:
            logger.error(f"[Storage] Database error loading credentials for {provider_id}: {e}")
            raise CredentialStorageError(
                f"Unable to read stored credentials for '{provider_id}'. "
                "Restore the original CINEMA_ENCRYPTION_SEED or machine "
                "identity; do not erase the credential data."
            ) from e
    
    def _validate_existing_credentials(self, conn: sqlite3.Connection) -> None:
        """Validate every stored credential before writing any credential data."""
        rows = conn.execute(
            "SELECT provider_id, encrypted_data FROM credentials"
        ).fetchall()
        for provider_id, encrypted_data in rows:
            try:
                stored = json.loads(self._encryption.decrypt(encrypted_data, conn))
                ProviderCredentials(**stored)
            except Exception as exc:
                logger.error("Failed to validate credentials for %s: %s", provider_id, exc)
                raise CredentialStorageError(
                    f"Unable to read stored credentials for '{provider_id}'. "
                    "Restore the original CINEMA_ENCRYPTION_SEED or machine "
                    "identity; do not erase the credential data."
                ) from exc

    def set_credentials(self, provider_id: str, credentials: ProviderCredentials):
        """Set credentials for a provider."""
        with self._get_connection() as conn:
            # Validate all rows first, including when provider_id is new.
            self._validate_existing_credentials(conn)
            # Don't store updated_at in encrypted data
            data = credentials.model_dump(exclude={'updated_at'}, exclude_none=True)
            encrypted = self._encryption.encrypt(json.dumps(data), conn)
            
            conn.execute(
                """INSERT OR REPLACE INTO credentials (provider_id, encrypted_data, updated_at)
                   VALUES (?, ?, ?)""",
                (provider_id, encrypted, datetime.utcnow().isoformat())
            )
            conn.commit()
    
    def delete_credentials(self, provider_id: str):
        """Delete credentials for a provider."""
        with self._get_connection() as conn:
            conn.execute(
                "DELETE FROM credentials WHERE provider_id = ?",
                (provider_id,)
            )
            conn.commit()
            logger.info(f"[Storage] Deleted credentials for {provider_id}")
    
    def list_providers(self) -> list[str]:
        """List all providers with stored credentials."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute("SELECT provider_id FROM credentials")
                return [row[0] for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"[Storage] Database error listing credential providers: {e}")
            raise CredentialStorageError(
                "Unable to read stored credentials. Restore the original "
                "CINEMA_ENCRYPTION_SEED or machine identity; do not erase the "
                "credential data."
            ) from e
    
    # -------------------------------------------------------------------------
    # Bulk operations
    # -------------------------------------------------------------------------
    
    def get_all_settings(self) -> StoredSettings:
        """Get all settings and credentials."""
        settings = StoredSettings(
            active_provider=self.get_setting('active_provider'),
            selected_model=self.get_setting('selected_model'),
            target_model=self.get_setting('target_model'),
        )
        
        for provider_id in self.list_providers():
            creds = self.get_credentials(provider_id)
            if creds:
                settings.providers[provider_id] = creds
        
        return settings
    
    def save_all_settings(self, settings: StoredSettings):
        """Save all settings and credentials."""
        if settings.active_provider is not None:
            self.set_setting('active_provider', settings.active_provider)
        if settings.selected_model is not None:
            self.set_setting('selected_model', settings.selected_model)
        if settings.target_model is not None:
            self.set_setting('target_model', settings.target_model)
        
        for provider_id, creds in settings.providers.items():
            self.set_credentials(provider_id, creds)
    
    def import_from_localstorage(self, data: dict):
        """Import settings from localStorage format atomically.

        Input and all existing rows that the import may replace are validated
        before the first write. This prevents a database opened with the wrong
        encryption seed from losing its settings or ciphertext.
        """
        if not isinstance(data, dict):
            raise ValueError("localStorage import must be an object")

        active_provider = data.get('activeProvider')
        if active_provider is not None and not isinstance(active_provider, str):
            raise ValueError("activeProvider must be a string or null")

        providers = data.get('providers', {})
        if not isinstance(providers, dict):
            raise ValueError("providers must be an object")

        imported: dict[str, ProviderCredentials] = {}
        for provider_id, creds_data in providers.items():
            if not isinstance(provider_id, str) or not provider_id:
                raise ValueError("provider IDs must be non-empty strings")
            if not isinstance(creds_data, dict):
                raise ValueError(f"Credentials for '{provider_id}' must be an object")
            try:
                creds = ProviderCredentials(
                    api_key=creds_data.get('apiKey'),
                    endpoint=creds_data.get('endpoint'),
                    oauth_token=creds_data.get('oauthToken'),
                    oauth_refresh_token=creds_data.get('oauthRefreshToken'),
                    oauth_expires_at=creds_data.get('oauthExpiresAt'),
                    oauth_client_id=creds_data.get('oauthClientId'),
                    oauth_client_secret=creds_data.get('oauthClientSecret'),
                )
            except Exception as exc:
                raise ValueError(f"Invalid credentials for '{provider_id}'") from exc
            # Preserve the existing import behavior: empty provider entries do
            # not replace a stored row.
            if any([creds.api_key, creds.endpoint, creds.oauth_token]):
                imported[provider_id] = creds

        with self._get_connection() as conn:
            # Validate every row before changing credentials or settings. This
            # also rejects an import containing only genuinely new providers.
            self._validate_existing_credentials(conn)

            if active_provider is not None:
                conn.execute(
                    """INSERT OR REPLACE INTO settings (key, value, updated_at)
                       VALUES (?, ?, ?)""",
                    ('active_provider', active_provider, datetime.utcnow().isoformat()),
                )

            for provider_id, creds in imported.items():
                encrypted = self._encryption.encrypt(
                    json.dumps(creds.model_dump(exclude={'updated_at'}, exclude_none=True)),
                    conn,
                )
                conn.execute(
                    """INSERT OR REPLACE INTO credentials (provider_id, encrypted_data, updated_at)
                       VALUES (?, ?, ?)""",
                    (provider_id, encrypted, datetime.utcnow().isoformat()),
                )

            conn.commit()

        logger.info(f"[Storage] Imported {len(providers)} providers from localStorage format")


# =============================================================================
# Singleton instance
# =============================================================================

_storage_instance: Optional[CredentialStorage] = None


def get_credential_storage() -> CredentialStorage:
    """Get the singleton credential storage instance."""
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = CredentialStorage()
    return _storage_instance
