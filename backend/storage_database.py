"""Connections shared by course management, Class Mode, and audit persistence."""

import os
import re
import sqlite3
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


def uses_postgres():
    backend = os.getenv("MUAWIN_STORAGE_BACKEND", "").lower()
    if backend == "sqlite":
        return False
    configured = bool(os.getenv("MUAWIN_DATABASE_URL"))
    if backend == "postgres" and not configured:
        raise RuntimeError("MUAWIN_DATABASE_URL is required for PostgreSQL storage.")
    return configured


class PostgresConnection:
    """Adapt parameter markers at the DB boundary while keeping queries parameterized."""

    is_postgres = True

    def __init__(self):
        from psycopg.rows import dict_row

        self.raw = _postgres_engine(os.environ["MUAWIN_DATABASE_URL"]).raw_connection()
        self.raw.driver_connection.row_factory = dict_row
        self.raw.execute("SET LOCAL ROLE service_role")

    def execute(self, query, parameters=()):
        self._ensure_role()
        if query.strip().upper() == "BEGIN IMMEDIATE":
            # Match the serialization existing Class Mode transactions rely on.
            return self.raw.execute("SELECT pg_advisory_xact_lock(68204117)")
        return self.raw.execute(self._parameters(query), tuple(
            int(value) if isinstance(value, bool) else value for value in parameters
        ))

    @staticmethod
    def _parameters(query):
        # Ignore literal question marks, such as the legacy reminder placeholder.
        return re.sub(r"'(?:''|[^'])*'|\?", lambda match:
                      "%s" if match.group() == "?" else match.group(), query)

    def executemany(self, query, parameters):
        self._ensure_role()
        with self.raw.cursor() as cursor:
            cursor.executemany(self._parameters(query), parameters)

    def _ensure_role(self):
        from psycopg.pq import TransactionStatus

        if self.raw.driver_connection.info.transaction_status == TransactionStatus.IDLE:
            self.raw.execute("SET LOCAL ROLE service_role")

    def columns(self, table):
        rows = self.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name=?
        """, (table,)).fetchall()
        return {row["column_name"] for row in rows}

    def commit(self):
        self.raw.commit()

    def rollback(self):
        self.raw.rollback()

    def close(self):
        self.raw.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, _exc, _traceback):
        if exc_type:
            self.rollback()
        else:
            self.commit()


def connect(path):
    if uses_postgres():
        return PostgresConnection()
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


@lru_cache(maxsize=2)
def _postgres_engine(url):
    from sqlalchemy import create_engine

    return create_engine(
        url.replace("postgresql://", "postgresql+psycopg://", 1),
        pool_size=3, max_overflow=2, pool_pre_ping=True, pool_recycle=180,
        connect_args={"connect_timeout": 15, "prepare_threshold": None},
    )


def columns(db, table):
    if isinstance(db, PostgresConnection):
        return db.columns(table)
    return {row["name"] for row in db.execute(f"PRAGMA table_info({table})")}


@lru_cache(maxsize=4)
def verify_schema(url):
    db = PostgresConnection()
    try:
        required = ("course_setup", "audit_events", "class_segments", "class_workflows")
        for table in required:
            if not db.columns(table):
                raise RuntimeError("Apply backend/supabase migrations before starting MUAWIN.")
        for table in ("class_chunks", "class_suggestions", "class_workflows"):
            if "created_order" not in db.columns(table):
                raise RuntimeError("Apply backend/supabase/002_ordering.sql before starting MUAWIN.")
        db.commit()
    finally:
        db.close()
