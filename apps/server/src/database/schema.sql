-- Campus Mesh — SQLite DDL Schema Definition

PRAGMA foreign_keys = ON;

-- Sessions Table: Holds authoritative classroom session metadata
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    session_code TEXT UNIQUE NOT NULL,
    class_name TEXT NOT NULL,
    instructor_name TEXT NOT NULL,
    passcode_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);

-- Resources Table: Uploaded files associated with sessions (Phase 2+)
CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    chunk_size INTEGER NOT NULL,
    total_chunks INTEGER NOT NULL,
    file_hash TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ready',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resources_session ON resources(session_id);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);

-- Chunk Manifests Table: 256 KB slice hashes (Phase 2+)
CREATE TABLE IF NOT EXISTS chunk_manifests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    sha256_hash TEXT NOT NULL,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    UNIQUE(resource_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_resource ON chunk_manifests(resource_id, chunk_index);
