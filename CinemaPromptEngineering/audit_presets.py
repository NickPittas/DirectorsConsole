"""Audit all film presets for invalid enum values."""

from cinema_rules.presets.live_action import LIVE_ACTION_PRESETS
from cinema_rules.schemas.live_action import CameraBody, LensFamily, LensManufacturer, FilmStock

valid_bodies = {e.value for e in CameraBody}
valid_families = {e.value for e in LensFamily}
valid_manufacturers = {e.value for e in LensManufacturer}
valid_stocks = {e.value for e in FilmStock}

issues = []
for preset_id, preset in LIVE_ACTION_PRESETS.items():
    # Check camera bodies
    for body in preset.camera_body:
        if body not in valid_bodies:
            issues.append(f'{preset_id}: Invalid camera_body "{body}"')
    
    # Check lens families  
    for family in preset.lens_family:
        if family not in valid_families:
            issues.append(f'{preset_id}: Invalid lens_family "{family}"')
    
    # Check lens manufacturers
    for mfr in preset.lens_manufacturer:
        if mfr not in valid_manufacturers:
            issues.append(f'{preset_id}: Invalid lens_manufacturer "{mfr}"')
    
    # Check film stocks
    for stock in preset.film_stock:
        if stock not in valid_stocks:
            issues.append(f'{preset_id}: Invalid film_stock "{stock}"')

for issue in issues:
    print(issue)
print(f'\nTotal issues: {len(issues)}')
