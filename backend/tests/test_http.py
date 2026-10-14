"""Unit tests: routing, request parsing, and JSON responses (core/http.py)."""

import base64
import json
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from core.http import ApiError, Request, Router, _strip_api_prefix, response


def event(method="GET", path="/", body=None, b64=False):
    if body is not None and b64:
        body = base64.b64encode(body.encode()).decode()
    return {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "headers": {"Content-Type": "application/json"},
        "body": body,
        "isBase64Encoded": b64,
    }


@pytest.mark.parametrize("raw, expected", [
    ("/api/project-tracker/projects/3", "/projects/3"),   # via CloudFront
    ("/api/project-tracker", "/"),
    ("/projects/3", "/projects/3"),                       # via the local proxy
    ("/", "/"),
])
def test_api_prefix_is_stripped_for_both_environments(raw, expected):
    assert _strip_api_prefix(raw) == expected


def test_router_matches_path_params():
    router = Router()

    @router.route("GET", "/projects/{id}/milestones/{milestone_id}")
    def handler(req):
        return req.params

    assert router.dispatch(event("GET", "/projects/7/milestones/9")) == {"id": "7", "milestone_id": "9"}


def test_router_ignores_trailing_slash():
    router = Router()
    router.route("GET", "/health")(lambda req: "ok")
    assert router.dispatch(event("GET", "/health/")) == "ok"


def test_unknown_path_is_404_and_wrong_method_is_405():
    router = Router()
    router.route("GET", "/projects")(lambda req: "ok")

    with pytest.raises(ApiError) as not_found:
        router.dispatch(event("GET", "/nope"))
    assert not_found.value.status == 404

    with pytest.raises(ApiError) as wrong_method:
        router.dispatch(event("DELETE", "/projects"))
    assert wrong_method.value.status == 405


def test_request_parses_json_including_base64_bodies():
    assert Request(event(body='{"a": 1}')).json() == {"a": 1}
    assert Request(event(body='{"a": 1}', b64=True)).json() == {"a": 1}
    assert Request(event(body=None)).json() == {}


@pytest.mark.parametrize("body", ["{not json", "[1, 2]", '"text"'])
def test_bad_json_bodies_are_400(body):
    with pytest.raises(ApiError) as excinfo:
        Request(event(body=body)).json()
    assert excinfo.value.status == 400


def test_headers_are_case_insensitive():
    assert Request(event()).headers["content-type"] == "application/json"


def test_response_converts_money_and_dates_for_json():
    result = response(200, {
        "rate": Decimal("50.00"),
        "start": date(2026, 10, 1),
        "at": datetime(2026, 10, 1, 9, 30, tzinfo=timezone.utc),
    })
    body = json.loads(result["body"])
    assert body["rate"] == 50.0                       # a number, not "50.00"
    assert body["start"] == "2026-10-01"
    assert body["at"].startswith("2026-10-01T09:30")  # ISO 8601 with "T"
    assert result["headers"]["Content-Type"] == "application/json"


def test_204_responses_have_no_body():
    assert "body" not in response(204)
