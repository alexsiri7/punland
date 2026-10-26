"""Alembic environment: migrations run on the connection the app hands over (saves.migrate)."""

import alembic.context as context

context.configure(connection=context.config.attributes["connection"])
with context.begin_transaction():
    context.run_migrations()
