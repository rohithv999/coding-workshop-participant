"""HTTP helpers: routing, request parsing, and consistent JSON responses."""

import base64
import json
import re
from datetime import date, datetime
from decimal import Decimal

class ApiError(Exception):
    """Raise anywhere in a handler to return a clean error response."""

    def __init__(self, status, message, details=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.details = details


def _json_default(value):
    """Convert database types into JSON-friendly values."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def response(status, body=None):
    resp = {"statusCode": status, "headers": {"Content-Type": "application/json"}}
    if body is not None:
        resp["body"] = json.dumps(body, default=_json_default)
    return resp

    
def error_response(status, message, details=None):
    body = {"error": message}
    if details:
        body["details"] = details
    return response(status, body)


def _strip_api_prefix(path):
    """CloudFront forwards /api/{service}/... unchanged, while the local proxy strips it.
    Normalize both so routes always match without the prefix."""
    parts = path.split("/")
    if len(parts) >= 3 and parts[1] == "api":
        return "/" + "/".join(parts[3:])
    return path


class Request:
    """Wraps a Lambda function URL event (payload format 2.0)."""

    def __init__(self, event, params=None):
        http = (event.get("requestContext") or {}).get("http") or {}
        self.method = http.get("method", "GET").upper()
        self.path = _strip_api_prefix(event.get("rawPath") or "/")
        self.params = params or {}
        self.query = event.get("queryStringParameters") or {}
        self.headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
        body = event.get("body")
        if body and event.get("isBase64Encoded"):
            body = base64.b64decode(body).decode("utf-8")
        self._raw_body = body
        self.user = None  # set by auth later

    def json(self):
        if not self._raw_body:
            return {}
        try:
            data = json.loads(self._raw_body)
        except json.JSONDecodeError as exc:
            raise ApiError(400, "Request body must be valid JSON") from exc
        if not isinstance(data, dict):
            raise ApiError(400, "Request body must be a JSON object")
        return data


class Router:
    def __init__(self):
        self._routes = []

    def route(self, method, pattern):
        """Decorator: @router.route("GET", "/projects/{id}")"""
        regex = re.compile("^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", pattern.rstrip("/")) + "/?$")

        def decorator(fn):
            self._routes.append((method.upper(), regex, fn))
            return fn

        return decorator

    def dispatch(self, event):
        probe = Request(event)
        path_exists = False
        for method, regex, fn in self._routes:
            match = regex.match(probe.path)
            if not match:
                continue
            path_exists = True
            if method == probe.method:
                return fn(Request(event, match.groupdict()))
        if path_exists:
            raise ApiError(405, f"Method {probe.method} not allowed on {probe.path}")
        raise ApiError(404, f"Route not found: {probe.method} {probe.path}")