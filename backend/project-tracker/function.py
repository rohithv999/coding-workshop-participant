"""Project Tracker API - Lambda entry point."""

import logging

# Importing API modules registers their routes on the shared router
import api.auth  # noqa: F401  pylint: disable=unused-import
import api.users  # noqa: F401  pylint: disable=unused-import
import api.projects  # noqa: F401  pylint: disable=unused-import
import api.assignments  # noqa: F401  pylint: disable=unused-import
import api.costs  # noqa: F401  pylint: disable=unused-import
import api.milestones  # noqa: F401  pylint: disable=unused-import
import api.audit_log  # noqa: F401  pylint: disable=unused-import
import api.workload  # noqa: F401  pylint: disable=unused-import
from core import db
from core.app import router
from core.http import ApiError, error_response, response

logger = logging.getLogger()
logger.setLevel(logging.INFO)


@router.route("GET", "/")
@router.route("GET", "/health")
def health(_req):
    return response(200, {"status": "ok", "database": db.ping()})


def handler(event=None, context=None):
    try:
        db.ensure_schema()
        return router.dispatch(event or {})
    except ApiError as exc:
        return error_response(exc.status, exc.message, exc.details)
    except db.DatabaseUnavailable:
        logger.warning("Database unavailable; returning 503")
        return error_response(503, "The database is starting up. Please try again in a few seconds.")
    except Exception:  # pylint: disable=broad-except
        logger.exception("Unhandled error")
        return error_response(500, "Internal server error")