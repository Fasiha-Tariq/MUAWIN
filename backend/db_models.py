
from datetime import datetime, timezone
from sqlalchemy import Boolean, ForeignKey, Index
from sqlalchemy import DateTime, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True
    )
    workflow_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    course_name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(30), default="pending", nullable=False
    )
    instruction: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    workflow_key: Mapped[str | None] = mapped_column(
        String(80),
        unique=True,
        nullable=True,
    )

    teacher_username: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True
    )
    workflow_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    message: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    details: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
