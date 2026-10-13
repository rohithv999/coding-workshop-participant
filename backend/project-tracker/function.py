"""Project Tracker API - Lambda entry point."""

import logging

from core import db
from core.http import ApiError, Router, error_response, response

logger = logging.getLogger()
logger.setLevel(logging.INFO)

router = Router()


@router.route("GET", "/")
@router.route("GET", "/health")
def health(_req):
    return response(200, {"status": "ok", "database": db.ping()})


def handler(event=None, context=None):
    try:
        return router.dispatch(event or {})
    except ApiError as exc:
        return error_response(exc.status, exc.message, exc.details)
    except Exception:  # pylint: disable=broad-except
        logger.exception("Unhandled error")
        return error_response(500, "Internal server error")