"""Tests for the Cinema Prompt Engineering FastAPI backend."""

import pytest
from fastapi.testclient import TestClient


# Import the FastAPI app - will fail until API is copied
# This import will work after we copy the API files
import sys
import os

# Add the CinemaPromptEngineering directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "CinemaPromptEngineering"))


try:
    from api.main import app
    API_AVAILABLE = True
except ImportError:
    API_AVAILABLE = False
    app = None


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    if not API_AVAILABLE:
        pytest.skip("API not yet available - needs to be copied from source")
    return TestClient(app)


class TestHealthEndpoints:
    """Test health check endpoints."""

    def test_root_endpoint(self, client):
        """Test the root endpoint returns status ok."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "cinema-prompt-engineering" in data["service"]

    def test_health_endpoint(self, client):
        """Test the /api/health endpoint returns healthy status."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data


class TestPresetsEndpoints:
    """Test film and animation presets endpoints."""

    def test_live_action_presets_returns_35_plus(self, client):
        """Test that live-action presets endpoint returns 35+ presets."""
        response = client.get("/presets/live-action")
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert "presets" in data
        assert data["count"] >= 35, f"Expected 35+ presets, got {data['count']}"
        assert len(data["presets"]) >= 35

    def test_live_action_presets_have_required_fields(self, client):
        """Test that presets have id, name, year, and era fields."""
        response = client.get("/presets/live-action")
        assert response.status_code == 200
        data = response.json()
        
        for preset in data["presets"]:
            assert "id" in preset
            assert "name" in preset
            assert "year" in preset
            assert "era" in preset

    def test_animation_presets_available(self, client):
        """Test that animation presets endpoint works."""
        response = client.get("/presets/animation")
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert "presets" in data
        assert data["count"] > 0

    def test_get_specific_live_action_preset(self, client):
        """Test getting a specific preset by ID."""
        # First get list to find a valid preset ID
        response = client.get("/presets/live-action")
        presets = response.json()["presets"]
        
        if presets:
            preset_id = presets[0]["id"]
            response = client.get(f"/presets/live-action/{preset_id}")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == preset_id


class TestGeneratePromptEndpoint:
    """Test the generate prompt endpoint."""

    def test_generate_prompt_live_action(self, client):
        """Test generating a prompt for live action project."""
        request_data = {
            "project_type": "live_action",
            "config": {
                "camera_type": "Digital",
                "camera_body": "ARRI_ALEXA_35",
                "film_stock": None,
                "aspect_ratio": "2.39:1",
                "lens_manufacturer": "ARRI",
                "lens_family": "ARRI_Signature_Prime",
                "shot_size": "Medium_Shot",
                "composition": "Centered",
                "movement": "Static",
                "time_of_day": "Golden_Hour",
                "lighting_style": "Naturalistic",
                "lighting_sources": ["Sun"],
                "mood": ["Serene"],
                "color_tone": ["Warm"],
            },
            "target_model": "sora",
        }
        
        response = client.post("/generate-prompt", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert "prompt" in data
        assert "validation" in data
        assert len(data["prompt"]) > 0

    def test_generate_prompt_animation(self, client):
        """Test generating a prompt for animation project."""
        request_data = {
            "project_type": "animation",
            "config": {
                "medium": "2D",
                "domain": "Anime",
                "style_domain": "Shonen",
                "line_treatment": "Clean_Bold",
                "color_application": "Cel_Shaded",
                "lighting_model": "Anime_Standard",
                "surface_detail": "Medium_Detail",
                "motion_style": "Dynamic_Action",
                "virtual_camera": "Anime_Standard",
                "shot_size": "Medium_Shot",
                "composition": "Centered",
                "mood": ["Energetic"],
                "color_tone": ["Vibrant"],
            },
            "target_model": "sora",
        }
        
        response = client.post("/generate-prompt", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert "prompt" in data
        assert "validation" in data
        assert len(data["prompt"]) > 0


class TestEnumEndpoints:
    """Test enum listing endpoints."""

    def test_list_enums(self, client):
        """Test listing all available enums."""
        response = client.get("/enums")
        assert response.status_code == 200
        data = response.json()
        assert "common" in data
        assert "live_action" in data
        assert "animation" in data

    def test_get_enum_values(self, client):
        """Test getting values for a specific enum."""
        response = client.get("/enums/shot_size")
        assert response.status_code == 200
        data = response.json()
        assert data["enum"] == "shot_size"
        assert "values" in data
        assert len(data["values"]) > 0


class TestValidationEndpoint:
    """Test configuration validation endpoint."""

    def test_validate_live_action_config(self, client):
        """Test validating a live action configuration."""
        request_data = {
            "project_type": "live_action",
            "config": {
                "camera_type": "Digital",
                "camera_body": "ARRI_ALEXA_35",
                "aspect_ratio": "2.39:1",
                "lens_manufacturer": "ARRI",
                "lens_family": "ARRI_Signature_Prime",
                "shot_size": "Medium_Shot",
                "composition": "Centered",
                "movement": "Static",
                "time_of_day": "Day",
                "lighting_style": "Naturalistic",
                "lighting_sources": ["Sun"],
                "mood": ["Neutral"],
                "color_tone": ["Natural"],
            },
        }
        
        response = client.post("/validate", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert "is_valid" in data
        assert "violations" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
