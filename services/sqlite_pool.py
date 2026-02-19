"""Thread-safe SQLite connection pool with WAL mode."""
import queue
import sqlite3
import threading
from pathlib import Path
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class SQLitePool:
    def __init__(self, db_path: str, pool_size: int = 5):
        self._db_path = db_path
        self._pool: queue.Queue = queue.Queue(maxsize=pool_size)
        self._lock = threading.Lock()
        for _ in range(pool_size):
            self._pool.put(self._make_conn())
        logger.info("SQLite pool initialized: %d connections to %s", pool_size, db_path)

    def _make_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def acquire(self, timeout: float = 10.0) -> sqlite3.Connection:
        try:
            return self._pool.get(timeout=timeout)
        except queue.Empty:
            raise RuntimeError("SQLite pool exhausted — all connections in use")

    def release(self, conn: sqlite3.Connection) -> None:
        self._pool.put(conn)

    class _Ctx:
        def __init__(self, pool: "SQLitePool"):
            self._pool = pool
            self._conn: Optional[sqlite3.Connection] = None

        def __enter__(self) -> sqlite3.Connection:
            self._conn = self._pool.acquire()
            return self._conn

        def __exit__(self, *_):
            if self._conn:
                self._pool.release(self._conn)

    def connection(self) -> "_Ctx":
        return self._Ctx(self)


_pool: Optional[SQLitePool] = None


def init_pool(db_path: str, pool_size: int = 5) -> None:
    global _pool
    _pool = SQLitePool(db_path, pool_size)


def get_pool() -> SQLitePool:
    if _pool is None:
        raise RuntimeError("SQLite pool not initialized — call init_pool() first")
    return _pool
