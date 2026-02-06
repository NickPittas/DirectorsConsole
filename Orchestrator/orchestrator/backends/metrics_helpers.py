"""Shared helpers for backend metrics collection."""

from __future__ import annotations

from typing import Any, Protocol
import logging

class MetricsClient(Protocol):
    async def get_system_stats(self) -> dict[str, Any]:
        ...

    async def get_metrics_agent(self) -> dict[str, Any] | None:
        ...

    async def get_queue_status(self) -> dict[str, Any]:
        ...

logger = logging.getLogger(__name__)


async def safe_get_system_stats(client: MetricsClient) -> dict[str, Any]:
    try:
        return await client.get_system_stats()
    except Exception as exc:
        logger.debug("Failed to fetch system stats", exc_info=exc)
        return {}


async def safe_get_metrics_agent(client: MetricsClient) -> dict[str, Any] | None:
    try:
        return await client.get_metrics_agent()
    except Exception as exc:
        logger.debug("Failed to fetch metrics agent", exc_info=exc)
        return None


async def safe_get_queue_status(client: MetricsClient) -> dict[str, Any]:
    try:
        return await client.get_queue_status()
    except Exception as exc:
        logger.debug("Failed to fetch queue status", exc_info=exc)
        return {}
