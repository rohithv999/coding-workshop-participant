"""Integration tests: assignments, the 40-hour rule, hours/cost math, costs, and workload."""

from datetime import date, timedelta

from conftest import TODAY, iso, unique


def weekdays_between(start, end):
    """Independent weekday count, to check the database view's math."""
    count, day = 0, start
    while day <= end:
        count += day.weekday() < 5
        day += timedelta(days=1)
    return count


def test_hours_and_costs_match_an_independent_calculation(manager, employee, project):
    start, end = TODAY - timedelta(days=14), TODAY + timedelta(days=14)
    status, assignment = manager.post(f"/projects/{project['id']}/assignments", {
        "user_id": employee.user["id"], "hours_per_day": 4,
        "start_date": start.isoformat(), "end_date": end.isoformat(),
    })
    assert status == 201

    planned = weekdays_between(start, end) * 4
    worked = weekdays_between(start, TODAY) * 4
    assert assignment["planned_hours"] == planned
    assert assignment["worked_hours"] == worked
    assert assignment["planned_cost"] == planned * 50   # employee rate is $50/h

    _, refreshed = manager.get(f"/projects/{project['id']}")
    assert refreshed["budget_spent"] == worked * 50
    assert refreshed["budget_remaining"] == 100000 - worked * 50


def test_the_40_hour_week_is_enforced_across_projects(admin, manager, employee, project):
    first = {"user_id": employee.user["id"], "hours_per_day": 6, "start_date": iso(1), "end_date": iso(20)}
    assert manager.post(f"/projects/{project['id']}/assignments", first)[0] == 201

    _, other_project = admin.post("/projects", {
        "name": unique("Other "), "manager_id": manager.user["id"],
        "start_date": iso(-10), "end_date": iso(60), "budget": 1000,
    })
    overlapping = {**first, "hours_per_day": 4}
    status, data = manager.post(f"/projects/{other_project['id']}/assignments", overlapping)
    assert status == 409
    assert data["details"]["available_hours_per_day"] == 2

    assert manager.post(f"/projects/{other_project['id']}/assignments", {**first, "hours_per_day": 2})[0] == 201


def test_the_same_person_cannot_be_assigned_twice(manager, employee, project):
    body = {"user_id": employee.user["id"], "hours_per_day": 1, "start_date": iso(1), "end_date": iso(2)}
    assert manager.post(f"/projects/{project['id']}/assignments", body)[0] == 201
    assert manager.post(f"/projects/{project['id']}/assignments", body)[0] == 409


def test_employees_see_hours_but_not_pay(manager, employee, project):
    manager.post(f"/projects/{project['id']}/assignments", {
        "user_id": employee.user["id"], "hours_per_day": 2, "start_date": iso(-3), "end_date": iso(3),
    })
    status, team = employee.get(f"/projects/{project['id']}/assignments")
    assert status == 200
    assert "planned_hours" in team[0]
    assert not {"hourly_rate", "planned_cost", "worked_cost"} & set(team[0])


def test_removing_a_future_assignment_deletes_it(manager, employee, project):
    _, assignment = manager.post(f"/projects/{project['id']}/assignments", {
        "user_id": employee.user["id"], "hours_per_day": 2, "start_date": iso(5), "end_date": iso(10),
    })
    assert manager.delete(f"/projects/{project['id']}/assignments/{assignment['id']}")[0] == 204
    _, team = manager.get(f"/projects/{project['id']}/assignments")
    assert assignment["id"] not in [a["id"] for a in team]


def test_removing_a_started_assignment_ends_it_yesterday(manager, employee, project):
    _, assignment = manager.post(f"/projects/{project['id']}/assignments", {
        "user_id": employee.user["id"], "hours_per_day": 2, "start_date": iso(-10), "end_date": iso(10),
    })
    assert manager.delete(f"/projects/{project['id']}/assignments/{assignment['id']}")[0] == 204
    _, team = manager.get(f"/projects/{project['id']}/assignments")
    ended = next(a for a in team if a["id"] == assignment["id"])
    assert ended["end_date"] == iso(-1)   # worked hours before today are kept


def test_past_costs_are_spent_and_future_costs_are_committed(manager, project):
    pid = project["id"]
    assert manager.post(f"/projects/{pid}/costs", {
        "category": "hardware", "description": "Servers", "amount": 5000, "cost_date": iso(-2),
    })[0] == 201
    assert manager.post(f"/projects/{pid}/costs", {
        "category": "software", "description": "Licenses", "amount": 1200, "cost_date": iso(30),
    })[0] == 201

    _, p = manager.get(f"/projects/{pid}")
    assert p["other_costs_spent"] == 5000
    assert p["other_costs_total"] == 6200
    assert p["budget_spent"] == p["labor_spent"] + 5000


def test_cost_validation_and_employee_access(manager, employee, project):
    status, data = manager.post(f"/projects/{project['id']}/costs", {"category": "snacks", "amount": -5})
    assert status == 400
    assert set(data["details"]) >= {"category", "amount", "description", "cost_date"}
    assert employee.get(f"/projects/{project['id']}/costs")[0] == 403


def test_workload_reports_weekly_hours(manager, employee, project):
    monday = TODAY - timedelta(days=TODAY.weekday()) + timedelta(weeks=1)
    manager.post(f"/projects/{project['id']}/assignments", {
        "user_id": employee.user["id"], "hours_per_day": 6,
        "start_date": monday.isoformat(), "end_date": (monday + timedelta(days=4)).isoformat(),
    })
    status, data = manager.get("/workload", {"start": monday.isoformat(), "weeks": "1"})
    assert status == 200
    row = next(e for e in data["employees"] if e["id"] == employee.user["id"])
    assert row["weeks"][0]["hours"] == 30        # 6h x 5 weekdays
    assert row["weeks"][0]["utilization"] == 75  # of 40h
    assert employee.get("/workload")[0] == 403


def test_workload_start_snaps_to_monday(manager):
    wednesday = date(2026, 11, 4)
    _, data = manager.get("/workload", {"start": wednesday.isoformat(), "weeks": "1"})
    assert data["start"] == "2026-11-02"
