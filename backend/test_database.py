
from sqlalchemy import text

from backend.database import engine
from backend.db_models import Base

# Create initial tables for the prototype.
Base.metadata.create_all(bind=engine)

# Verify that PostgreSQL accepts a query.
with engine.connect() as connection:
    result = connection.execute(
        text("SELECT current_database(), version()")
    )
    database_name, version = result.fetchone()

print("Connected successfully!")
print("Database:", database_name)
print("PostgreSQL:", version)
print("Tables created:", list(Base.metadata.tables.keys()))
