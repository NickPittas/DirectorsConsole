"""Tests for API save_image endpoint."""

import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock

from orchestrator.api.server import save_image, SaveImageRequest

class TestSaveImage:
    
    @pytest.mark.asyncio
    async def test_save_image_with_subdir(self, tmp_path):
        """Test save_image creates subdirectories if they exist in filename."""
        
        # Setup mocks
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"fake image content"
        
        # Create a mock client that works as an async context manager
        mock_client_instance = MagicMock()
        # Mocking the get method to be async
        mock_client_instance.get = AsyncMock(return_value=mock_response)
        
        # Important: mocking __aenter__ and __aexit__ for 'async with'
        mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)
        
        # Patch httpx.AsyncClient to return our mock
        with patch("httpx.AsyncClient", return_value=mock_client_instance):
            
            # Request with subdirectory in filename
            filename = "subdir/test_image.png"
            # Use tmp_path fixture from pytest
            folder_path = str(tmp_path / "images")
            
            req = SaveImageRequest(
                image_url="http://example.com/img.png",
                folder_path=folder_path,
                filename=filename
            )
            
            # Execute
            response = await save_image(req)
            
            # Verify
            assert response.success is True
            expected_path = Path(folder_path) / filename
            assert expected_path.exists()
            assert expected_path.read_bytes() == b"fake image content"
