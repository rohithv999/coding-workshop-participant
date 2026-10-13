"""Reusable input validation. Collects every error so the client sees them all at once."""

import re
from datetime import date
from decimal import Decimal, InvalidOperation

from core.http import ApiError

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MISSING = object()


def path_id(req, name="id"):
    """Read a numeric id from the URL, e.g. /users/{id}. Non-numbers give 404."""
    value = req.params.get(name, "")
    if not value.isdigit() or int(value) < 1:
        raise ApiError(404, "Not found")
    return int(value)


class Validator:
    """
    Usage:
        v = Validator(req.json())               # create: required fields enforced
        v = Validator(req.json(), partial=True)  # update: only check fields sent
        v.text("first_name", required=True, max_length=100)
        values = v.check()                       # raises 400 with all errors, or returns clean values
    """

    def __init__(self, data, partial=False):
        self.data = data
        self.partial = partial
        self.errors = {}
        self.values = {}

    def _get(self, field, required):
        if field not in self.data:
            if required and not self.partial:
                self.errors[field] = "is required"
            return _MISSING
        return self.data[field]

    def reject_unknown(self, allowed_fields):
        for field in sorted(set(self.data) - set(allowed_fields)):
            self.errors[field] = "is not an allowed field"

    def text(self, field, required=False, max_length=255):
        value = self._get(field, required)
        if value is _MISSING:
            return
        if value is None or (isinstance(value, str) and not value.strip()):
            if required:
                self.errors[field] = "is required"
            else:
                self.values[field] = None
            return
        if not isinstance(value, str):
            self.errors[field] = "must be text"
            return
        value = value.strip()
        if len(value) > max_length:
            self.errors[field] = f"must be at most {max_length} characters"
            return
        self.values[field] = value

    def email(self, field, required=False):
        self.text(field, required=required, max_length=255)
        value = self.values.get(field)
        if value is None:
            return
        if not EMAIL_PATTERN.match(value):
            self.errors[field] = "must be a valid email address"
            del self.values[field]
        else:
            self.values[field] = value.lower()

    def choice(self, field, options, required=False):
        value = self._get(field, required)
        if value is _MISSING:
            return
        if value not in options:
            self.errors[field] = f"must be one of: {', '.join(options)}"
            return
        self.values[field] = value

    def number(self, field, required=False, minimum=None, maximum=None):
        value = self._get(field, required)
        if value is _MISSING:
            return
        if isinstance(value, bool) or not isinstance(value, (int, float, str)):
            self.errors[field] = "must be a number"
            return
        try:
            number = Decimal(str(value))
        except InvalidOperation:
            self.errors[field] = "must be a number"
            return
        if not number.is_finite():
            self.errors[field] = "must be a number"
        elif minimum is not None and number < minimum:
            self.errors[field] = f"must be at least {minimum}"
        elif maximum is not None and number > maximum:
            self.errors[field] = f"must be at most {maximum}"
        else:
            self.values[field] = number

    def integer_id(self, field, required=False, nullable=False):
        value = self._get(field, required)
        if value is _MISSING:
            return
        if value is None:
            if nullable:
                self.values[field] = None
            else:
                self.errors[field] = "is required"
            return
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            self.errors[field] = "must be a valid id"
            return
        self.values[field] = value

    def date(self, field, required=False):
        value = self._get(field, required)
        if value is _MISSING:
            return
        if not isinstance(value, str):
            self.errors[field] = "must be a date (YYYY-MM-DD)"
            return
        try:
            self.values[field] = date.fromisoformat(value)
        except ValueError:
            self.errors[field] = "must be a date (YYYY-MM-DD)"

    def add_error(self, field, message):
        self.errors[field] = message

    def check(self):
        """Raise 400 with every error found, or return the cleaned values."""
        if self.errors:
            raise ApiError(400, "Validation failed", self.errors)
        return self.values