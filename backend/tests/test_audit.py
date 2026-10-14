"""Unit tests: audit diff and snapshot helpers (core/audit.py)."""

from datetime import date
from decimal import Decimal

from core.audit import diff, snapshot


def test_diff_records_only_real_changes():
    before = {"name": "Old", "budget": Decimal("50000.00"), "end_date": date(2026, 12, 31)}
    updates = {"name": "New", "budget": Decimal("50000"), "end_date": date(2026, 12, 31)}
    assert diff(before, updates) == {"name": {"from": "Old", "to": "New"}}


def test_diff_makes_money_and_dates_json_friendly():
    changes = diff({"budget": Decimal("100"), "start_date": date(2026, 1, 1)},
                   {"budget": Decimal("250.5"), "start_date": date(2026, 2, 1)})
    assert changes == {
        "budget": {"from": 100.0, "to": 250.5},
        "start_date": {"from": "2026-01-01", "to": "2026-02-01"},
    }


def test_passwords_are_never_logged():
    changes = diff({"password_hash": "old"}, {"password": "NewSecret1", "password_hash": "new"})
    assert changes == {}
    assert snapshot({"username": "abc123", "password": "x"}, ("username", "password")) == {"username": "abc123"}


def test_snapshot_picks_requested_fields():
    record = {"name": "Server work", "budget": Decimal("10"), "internal": "skip"}
    assert snapshot(record, ("name", "budget", "missing")) == {"name": "Server work", "budget": 10.0}
