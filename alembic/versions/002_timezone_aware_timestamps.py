"""Store timestamps as timestamptz

Revision ID: 002_timestamptz
Revises: 001_initial
Create Date: 2026-09-28 00:00:00.000000

Naive timestamps were serialized without an offset, so browsers parsed UTC
values as local time (e.g. new chats showed "1h ago" during BST). Existing
values were written by now() in a UTC session, so they are reinterpreted as UTC.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002_timestamptz"
down_revision: str | None = "001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = [
    ("conversations", "created_at"),
    ("conversations", "updated_at"),
    ("messages", "created_at"),
    ("documents", "uploaded_at"),
]


def upgrade() -> None:
    for table, column in COLUMNS:
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN {column} "
            f"TYPE timestamptz USING {column} AT TIME ZONE 'UTC'"
        )


def downgrade() -> None:
    for table, column in COLUMNS:
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN {column} "
            f"TYPE timestamp USING {column} AT TIME ZONE 'UTC'"
        )
