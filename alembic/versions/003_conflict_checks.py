"""Cache conflict-check reports per set of documents

Revision ID: 003_conflict_checks
Revises: 002_timestamptz
Create Date: 2026-09-28 00:00:00.000000

The conflict check is one slow model call over every document in a
conversation, so its report is stored keyed by a hash of the document set
and reused until that set changes.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "003_conflict_checks"
down_revision: str | None = "002_timestamptz"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "conflict_checks",
        sa.Column("documents_key", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=False),
        sa.Column("report", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("documents_key"),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_conflict_checks_conversation_id", "conflict_checks", ["conversation_id"])


def downgrade() -> None:
    op.drop_index("ix_conflict_checks_conversation_id", table_name="conflict_checks")
    op.drop_table("conflict_checks")
