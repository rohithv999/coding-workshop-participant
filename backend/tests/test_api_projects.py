"""Integration tests: projects, budgets, milestones, and archiving."""

from conftest import iso, unique


def assign(client, project_id, user_id, **extra):
    body = {"user_id": user_id, "hours_per_day": 4, "start_date": iso(-5), "end_date": iso(5), **extra}
    return client.post(f"/projects/{project_id}/assignments", body)


def test_only_admins_create_projects(manager):
    status, _ = manager.post("/projects", {"name": "x"})
    assert status == 403


def test_project_dates_are_validated(admin, manager):
    status, data = admin.post("/projects", {
        "name": unique("P"), "manager_id": manager.user["id"],
        "start_date": iso(10), "end_date": iso(0),
    })
    assert status == 400 and "end_date" in data["details"]


def test_employees_only_see_projects_they_are_assigned_to(manager, employee, project):
    assert employee.get(f"/projects/{project['id']}")[0] == 404

    assert assign(manager, project["id"], employee.user["id"])[0] == 201
    status, seen = employee.get(f"/projects/{project['id']}")
    assert status == 200
    # Employees see progress and hours, but no money (it could reveal pay rates)
    assert not [key for key in seen if "budget" in key or "cost" in key or key == "labor_spent"]


def test_other_managers_cannot_see_the_project(create_user, project):
    other = create_user("manager")
    assert other.get(f"/projects/{project['id']}")[0] == 404


def test_budget_changes_are_recorded_with_a_reason(manager, project):
    status, updated = manager.put(f"/projects/{project['id']}", {"budget": 120000, "budget_reason": "More scope"})
    assert status == 200 and updated["budget"] == 120000

    status, history = manager.get(f"/projects/{project['id']}/budget-history")
    assert status == 200
    assert history[0]["old_amount"] == 100000
    assert history[0]["new_amount"] == 120000
    assert history[0]["reason"] == "More scope"


def test_managers_cannot_reassign_their_project(manager, project):
    status, data = manager.put(f"/projects/{project['id']}", {"manager_id": 1})
    assert status == 400 and "manager_id" in data["details"]


def test_project_is_done_only_when_every_milestone_is_complete(manager, project):
    pid = project["id"]
    status, data = manager.post(f"/projects/{pid}/complete")
    assert status == 409 and "at least one milestone" in data["error"]

    milestones = []
    for name in ("Scope servers", "Decommission servers"):
        status, milestone = manager.post(f"/projects/{pid}/milestones", {
            "name": name, "start_date": iso(-5), "end_date": iso(5),
        })
        assert status == 201
        milestones.append(milestone)

    manager.put(f"/projects/{pid}/milestones/{milestones[0]['id']}", {"status": "complete"})
    status, data = manager.post(f"/projects/{pid}/complete")
    assert status == 409
    assert data["details"] == {"milestones_total": 2, "milestones_complete": 1}

    status, done_milestone = manager.put(f"/projects/{pid}/milestones/{milestones[1]['id']}", {"status": "complete"})
    assert done_milestone["completed_at"] is not None

    status, done = manager.post(f"/projects/{pid}/complete")
    assert status == 200
    assert done["status"] == "done" and done["progress_percent"] == 100

    # Milestones are locked once the project is done
    status, _ = manager.put(f"/projects/{pid}/milestones/{milestones[0]['id']}", {"status": "in_progress"})
    assert status == 409


def test_milestone_dates_must_fit_inside_the_project(manager, project):
    status, data = manager.post(f"/projects/{project['id']}/milestones", {
        "name": "Too early", "start_date": iso(-400), "end_date": iso(0),
    })
    assert status == 400 and "start_date" in data["details"]


def test_archived_projects_are_hidden_and_read_only(admin, manager, project):
    pid = project["id"]
    assert admin.delete(f"/projects/{pid}")[0] == 204

    assert manager.get(f"/projects/{pid}")[0] == 404
    assert pid not in [p["id"] for p in manager.get("/projects")[1]]
    assert manager.get("/projects", {"archived": "true"})[0] == 403

    status, _ = admin.put(f"/projects/{pid}", {"name": "Renamed"})
    assert status == 409

    status, restored = admin.post(f"/projects/{pid}/unarchive")
    assert status == 200 and restored["is_archived"] is False
