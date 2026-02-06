from __future__ import annotations

import asyncio


class AsyncWorker:
    def submit(self, coro):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(coro)
            return None

        return loop.create_task(coro)
