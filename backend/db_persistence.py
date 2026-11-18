from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from backend.database import SessionLocal
from backend.db_models import WorkflowRun, ActivityLog


def save_workflow(
    workflow_key: str,
    workflow_type: str,
    course_name: str,
    status: str,
    instruction: str,
    teacher_username: str | None = None,
) -> bool:
    """
    Create or update a persistent workflow record.

    workflow_key is the existing MUAWIN ID:
    wf-..., awf-..., or cwf-...
    """
    if not workflow_key:
        return False

    try:
        with SessionLocal() as db:
            with db.begin():
                workflow = db.scalar(
                    select(WorkflowRun).where(
                        WorkflowRun.workflow_key == workflow_key
                    )
                )

                if workflow is None:
                    workflow = WorkflowRun(
                        workflow_key=workflow_key,
                        workflow_type=workflow_type,
                        course_name=course_name or "Unknown course",
                        status=status,
                        instruction=instruction or "",
                        teacher_username=teacher_username,
                    )
                    db.add(workflow)
                else:
                    workflow.workflow_type = workflow_type
                    workflow.course_name = (
                        course_name or workflow.course_name
                    )
                    workflow.status = status
                    workflow.instruction = (
                        instruction or workflow.instruction
                    )

                    if teacher_username:
                        workflow.teacher_username = teacher_username

                    workflow.updated_at = datetime.now(timezone.utc)

        return True

    except SQLAlchemyError as exc:
        print(
            f"[DB WARNING] Could not save workflow "
            f"{workflow_key}: {exc}"
        )
        return False


def update_workflow_status(
    workflow_key: str,
    status: str,
) -> bool:
    """Update the status of an existing persistent workflow."""
    try:
        with SessionLocal() as db:
            with db.begin():
                workflow = db.scalar(
                    select(WorkflowRun).where(
                        WorkflowRun.workflow_key == workflow_key
                    )
                )

                if workflow is None:
                    print(
                        f"[DB WARNING] Workflow not found: "
                        f"{workflow_key}"
                    )
                    return False

                workflow.status = status
                workflow.updated_at = datetime.now(timezone.utc)

        return True

    except SQLAlchemyError as exc:
        print(
            f"[DB WARNING] Could not update workflow "
            f"{workflow_key}: {exc}"
        )
        return False


def log_activity(
    event_type: str,
    message: str,
    workflow_key: str | None = None,
    details: dict[str, Any] | None = None,
) -> bool:
    """
    Save an activity event.

    The existing ActivityLog.workflow_id column is an integer,
    so it stores the database row ID. The original MUAWIN string
    ID is kept in details["workflow_key"].
    """
    try:
        with SessionLocal() as db:
            with db.begin():
                workflow_db_id = None

                if workflow_key:
                    workflow = db.scalar(
                        select(WorkflowRun).where(
                            WorkflowRun.workflow_key == workflow_key
                        )
                    )

                    if workflow is not None:
                        workflow_db_id = workflow.id

                safe_details = dict(details or {})

                if workflow_key:
                    safe_details["workflow_key"] = workflow_key

                entry = ActivityLog(
                    workflow_id=workflow_db_id,
                    event_type=event_type,
                    message=message,
                    details=safe_details or None,
                )
                db.add(entry)

        return True

    except SQLAlchemyError as exc:
        print(f"[DB WARNING] Could not save activity: {exc}")
        return False
