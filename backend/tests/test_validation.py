"""Unit tests: the reusable Validator and path_id (core/validation.py)."""

from datetime import date
from decimal import Decimal

import pytest

from core.http import ApiError
from core.validation import Validator, path_id


def errors_of(validator):
    with pytest.raises(ApiError) as excinfo:
        validator.check()
    assert excinfo.value.status == 400
    return excinfo.value.details


def test_reports_every_error_at_once():
    v = Validator({"email": "nope", "role": "boss"})
    v.text("name", required=True)
    v.email("email", required=True)
    v.choice("role", ("admin", "manager"), required=True)
    assert set(errors_of(v)) == {"name", "email", "role"}


def test_partial_mode_ignores_missing_required_fields():
    v = Validator({"name": "New name"}, partial=True)
    v.text("name", required=True)
    v.email("email", required=True)
    assert v.check() == {"name": "New name"}


def test_unknown_fields_are_rejected():
    v = Validator({"name": "x", "is_admin": True})
    v.reject_unknown({"name"})
    v.text("name")
    assert errors_of(v) == {"is_admin": "is not an allowed field"}


def test_text_is_trimmed_and_length_checked():
    v = Validator({"name": "  Sam  ", "code": "x" * 11})
    v.text("name")
    v.text("code", max_length=10)
    assert "code" in errors_of(v)
    assert Validator({"name": "  Sam  "}).values == {}  # nothing stored before validating
    v2 = Validator({"name": "  Sam  "})
    v2.text("name")
    assert v2.check() == {"name": "Sam"}


def test_blank_required_text_is_an_error():
    v = Validator({"name": "   "})
    v.text("name", required=True)
    assert errors_of(v) == {"name": "is required"}


def test_email_is_lowercased_and_format_checked():
    v = Validator({"email": "Sam@ACME.com"})
    v.email("email")
    assert v.check() == {"email": "sam@acme.com"}

    bad = Validator({"email": "not-an-email"})
    bad.email("email")
    assert "email" in errors_of(bad)


def test_numbers_become_decimals_with_bounds():
    v = Validator({"rate": "45.50"})
    v.number("rate", minimum=0, maximum=100)
    assert v.check() == {"rate": Decimal("45.50")}

    for value in [-1, 101, "abc", True, [1]]:
        bad = Validator({"rate": value})
        bad.number("rate", minimum=0, maximum=100)
        assert "rate" in errors_of(bad), value


def test_true_is_not_a_valid_id():
    # In Python, True == 1, so without an explicit check `"manager_id": true` would pass as id 1
    for value in [True, 0, -3, "2", 1.5]:
        v = Validator({"manager_id": value})
        v.integer_id("manager_id")
        assert "manager_id" in errors_of(v), value


def test_nullable_id_accepts_none():
    v = Validator({"manager_id": None})
    v.integer_id("manager_id", nullable=True)
    assert v.check() == {"manager_id": None}


def test_dates_are_parsed_or_rejected():
    v = Validator({"start": "2026-10-01"})
    v.date("start")
    assert v.check() == {"start": date(2026, 10, 1)}

    for value in ["2026-13-01", "10/01/2026", 20261001]:
        bad = Validator({"start": value})
        bad.date("start")
        assert "start" in errors_of(bad), value


class _FakeRequest:
    def __init__(self, params):
        self.params = params


@pytest.mark.parametrize("raw", ["abc", "0", "-1", "", "1.5"])
def test_path_id_returns_404_for_non_ids(raw):
    with pytest.raises(ApiError) as excinfo:
        path_id(_FakeRequest({"id": raw}))
    assert excinfo.value.status == 404


def test_path_id_returns_the_number():
    assert path_id(_FakeRequest({"id": "42"})) == 42
