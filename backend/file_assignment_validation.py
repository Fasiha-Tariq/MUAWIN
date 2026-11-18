def normalize_assignment_marks(value):
    """Validate assignment marks and return a whole-number grade."""
    if value is None:
        return None

    try:
        numeric_marks = float(str(value).strip())
    except (TypeError, ValueError):
        raise ValueError(
            f"Assignment total marks must be a whole number from 1 to 100; got {value!r}."
        )

    if not numeric_marks.is_integer() or not 1 <= numeric_marks <= 100:
        raise ValueError(
            f"Assignment total marks must be a whole number from 1 to 100; got {value!r}."
        )

    return int(numeric_marks)
