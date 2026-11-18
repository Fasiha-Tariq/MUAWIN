import unittest

from backend.file_assignment_validation import normalize_assignment_marks


class AssignmentMarksValidationTests(unittest.TestCase):
    def test_accepts_valid_integer_marks(self):
        for value, expected in [(1, 1), (100, 100), (25, 25), ("40", 40), (75.0, 75)]:
            with self.subTest(value=value):
                self.assertEqual(normalize_assignment_marks(value), expected)

    def test_rejects_invalid_marks(self):
        for value in [0, 101, -5, 1.5, "abc", "", "20.5"]:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    normalize_assignment_marks(value)

    def test_missing_marks_remain_optional(self):
        self.assertIsNone(normalize_assignment_marks(None))


if __name__ == "__main__":
    unittest.main()
