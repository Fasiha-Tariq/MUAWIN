
def main():
    from sqlalchemy import text

    from backend.database import engine
    from backend.db_models import Base

    Base.metadata.create_all(bind=engine)
    with engine.connect() as connection:
        database_name, version = connection.execute(
            text("SELECT current_database(), version()")
        ).one()

    print("Connected successfully!")
    print("Database:", database_name)
    print("PostgreSQL:", version)
    print("Tables created:", list(Base.metadata.tables.keys()))


if __name__ == "__main__":
    main()
