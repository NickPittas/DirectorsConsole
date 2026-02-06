#!/usr/bin/env python3
"""
Example client demonstrating how to use the refactored Orchestrator API.

This shows how external tools (like StoryboardUI2) can submit jobs.
"""

import asyncio
import httpx
from typing import Any


class OrchestratorClient:
    """Client for the Director's Console Orchestrator API."""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        """Initialize the client.
        
        Args:
            base_url: Base URL of the Orchestrator API
        """
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
    
    async def health_check(self) -> dict[str, Any]:
        """Check API health status.
        
        Returns:
            Health status dict with status, timestamp, backends_online
        """
        response = await self.client.get(f"{self.base_url}/api/health")
        response.raise_for_status()
        return response.json()
    
    async def list_backends(self) -> list[dict[str, Any]]:
        """List available ComfyUI backends.
        
        Returns:
            List of backend info dicts
        """
        response = await self.client.get(f"{self.base_url}/api/backends")
        response.raise_for_status()
        return response.json()
    
    async def submit_job(
        self,
        workflow_id: str,
        parameters: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Submit a workflow job for execution.
        
        Args:
            workflow_id: ID of the workflow to execute
            parameters: Parameter overrides for the workflow
            metadata: Optional metadata about the job
            
        Returns:
            Job response with job_id, status, message, submitted_at
        """
        manifest = {
            "workflow_id": workflow_id,
            "parameters": parameters or {},
            "metadata": metadata or {},
        }
        
        response = await self.client.post(
            f"{self.base_url}/api/job",
            json=manifest,
        )
        response.raise_for_status()
        return response.json()


async def example_usage():
    """Example demonstrating API usage."""
    client = OrchestratorClient("http://localhost:8000")
    
    try:
        # 1. Check health
        print("Checking API health...")
        health = await client.health_check()
        print(f"  Status: {health['status']}")
        print(f"  Backends online: {health['backends_online']}")
        print()
        
        # 2. List backends
        print("Available backends:")
        backends = await client.list_backends()
        for backend in backends:
            print(f"  - {backend['name']} ({backend['id']}): "
                  f"{'online' if backend['online'] else 'offline'}")
        print()
        
        # 3. Submit a job
        print("Submitting job...")
        job = await client.submit_job(
            workflow_id="txt2img_basic",
            parameters={
                "prompt": "A beautiful mountain landscape at sunset",
                "negative_prompt": "blurry, low quality",
                "steps": 30,
                "cfg_scale": 7.5,
                "seed": 42,
            },
            metadata={
                "source": "example_client",
                "scene_id": "scene_001",
                "shot_number": 1,
            },
        )
        
        print(f"  Job ID: {job['job_id']}")
        print(f"  Status: {job['status']}")
        print(f"  Message: {job['message']}")
        print()
        
        print("✓ Job submitted successfully!")
        print()
        print("Note: The job is now executing asynchronously.")
        print("In a production system, you would:")
        print("  - Poll GET /api/job/{job_id} for status updates")
        print("  - Or subscribe to a WebSocket for real-time progress")
        
    finally:
        await client.close()


if __name__ == "__main__":
    print("=" * 70)
    print("Orchestrator API Example Client")
    print("=" * 70)
    print()
    
    asyncio.run(example_usage())
