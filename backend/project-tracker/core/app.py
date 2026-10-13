"""Shared router instance that every API module registers its routes on."""

from core.http import Router

router = Router()