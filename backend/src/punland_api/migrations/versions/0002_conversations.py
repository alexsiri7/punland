"""Conversations: what each character remembers of a player's game.

Revision ID: 0002
"""

import alembic.op as op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as pg

revision = "0002"
down_revision = "0001"


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("player_id", sa.Uuid(), primary_key=True),
        sa.Column("character", sa.String(40), primary_key=True),
        sa.Column("state", sa.JSON().with_variant(pg.JSONB(), "postgresql"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("conversations")
