"""Saves: one autosave per anonymous player.

Revision ID: 0001
"""

import alembic.op as op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as pg

revision = "0001"
down_revision = None


def upgrade() -> None:
    op.create_table(
        "saves",
        sa.Column("player_id", sa.Uuid(), primary_key=True),
        sa.Column("game", sa.JSON().with_variant(pg.JSONB(), "postgresql"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("saves")
