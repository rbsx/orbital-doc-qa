"""Give documents a stable position within their conversation

Revision ID: 004_document_positions
Revises: 003_conflict_checks
Create Date: 2026-09-28 00:00:00.000000

Labels (D1, D2, …) were derived from upload order, so removing a document
renumbered the ones after it and silently re-pointed earlier answers'
citations at the wrong file. Store each document's number at upload and never
reuse it. Existing documents are numbered in their current upload order.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004_document_positions"
down_revision: str | None = "003_conflict_checks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("position", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE documents SET position = numbered.position
        FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY conversation_id ORDER BY uploaded_at, id
            ) AS position
            FROM documents
        ) AS numbered
        WHERE documents.id = numbered.id
        """
    )
    op.alter_column("documents", "position", nullable=False)


def downgrade() -> None:
    op.drop_column("documents", "position")
