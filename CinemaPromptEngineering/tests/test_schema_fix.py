from cinema_rules.schemas.live_action import LensManufacturer, LensFamily, LensConfig
import pytest

def test_new_enums():
    # Verify Sony and Fujifilm exist in LensManufacturer
    assert LensManufacturer.SONY == "Sony"
    assert LensManufacturer.FUJIFILM == "Fujifilm"
    
    # Verify Sony_CineAlta exists in LensFamily
    assert LensFamily.SONY_CINEALTA == "Sony_CineAlta"
    
    # Verify LensConfig validation
    config = LensConfig(
        manufacturer="Sony",
        family="Sony_CineAlta",
        focal_length_mm=50
    )
    assert config.manufacturer == LensManufacturer.SONY
    assert config.family == LensFamily.SONY_CINEALTA
