"""Live-Action Cinema Film Style Presets.

Contains 80+ film presets from cinematic canon, covering:
- Silent era to modern
- All major cinematic movements
- Complete visual grammar specifications
- Technical specifications (camera, film stock, aspect ratio, lenses)
"""

from pydantic import BaseModel, Field


class FilmPreset(BaseModel):
    """A film style preset that auto-populates configuration fields."""
    
    id: str = Field(description="Unique preset identifier (e.g., 'blade_runner')")
    name: str = Field(description="Display name (e.g., 'Blade Runner')")
    year: int = Field(description="Release year")
    era: str = Field(description="Time period classification")
    
    # Visual characteristics
    mood: list[str] = Field(default_factory=list, description="Primary moods")
    color_tone: list[str] = Field(default_factory=list, description="Color/tone characteristics")
    lighting_style: list[str] = Field(default_factory=list, description="Lighting techniques")
    lighting_sources: list[str] = Field(default_factory=list, description="Primary light sources")
    composition: list[str] = Field(default_factory=list, description="Composition techniques")
    shot_sizes: list[str] = Field(default_factory=list, description="Typical shot sizes")
    movement: list[str] = Field(default_factory=list, description="Camera movement patterns")
    
    # Technical specifications - NEW
    camera_type: str = Field(default="Film", description="Camera type: Digital or Film")
    camera_body: list[str] = Field(default_factory=list, description="Specific camera bodies used")
    film_stock: list[str] = Field(default_factory=list, description="Film stocks used (for film cameras)")
    aspect_ratio: str | None = Field(default=None, description="Original aspect ratio")
    lens_manufacturer: list[str] = Field(default_factory=list, description="Lens manufacturers used")
    lens_family: list[str] = Field(default_factory=list, description="Specific lens families used")
    primary_focal_lengths: list[int] = Field(default_factory=list, description="Common focal lengths used")
    
    # Constraints
    disallowed_moods: list[str] = Field(default_factory=list, description="Moods incompatible with this style")
    disallowed_sources: list[str] = Field(default_factory=list, description="Light sources incompatible with this era/style")


# =============================================================================
# FILM PRESETS - MONUMENTAL CINEMA CANON
# =============================================================================

LIVE_ACTION_PRESETS: dict[str, FilmPreset] = {
    
    # =========================================================================
    # CLASSIC HOLLYWOOD & FILM NOIR
    # =========================================================================
    
    "citizen_kane": FilmPreset(
        id="citizen_kane",
        name="Citizen Kane",
        year=1941,
        era="Pre_1950",
        mood=["Introspective"],
        color_tone=["Monochrome"],
        lighting_style=["Low_Key", "Hard_Lighting"],
        lighting_sources=["Tungsten"],
        composition=["Deep_Focus", "Low_Angle"],
        shot_sizes=["Wide_Shot", "Medium_Shot"],
        movement=["Static"],
        disallowed_sources=["LED", "HMI", "Kino_Flo"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Cooke"],
        lens_family=["Cooke_Speed_Panchro"],
        primary_focal_lengths=[24, 25, 35, 50],
    ),
    
    "casablanca": FilmPreset(
        id="casablanca",
        name="Casablanca",
        year=1942,
        era="Pre_1950",
        mood=["Melancholic", "Romantic"],
        color_tone=["Monochrome"],
        lighting_style=["Low_Key", "Soft_Lighting"],
        lighting_sources=["Tungsten", "Practical_Lights"],
        composition=["Rule_of_Thirds", "Frame_Within_Frame"],
        shot_sizes=["Medium_Shot", "Close_Up"],
        movement=["Static", "Minimal_Dolly"],
        disallowed_sources=["LED", "Neon", "HMI"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Warner_Bros"],
        lens_family=["Vintage_Spherical"],
        primary_focal_lengths=[35, 50, 75],
    ),
    
    "double_indemnity": FilmPreset(
        id="double_indemnity",
        name="Double Indemnity",
        year=1944,
        era="Pre_1950",
        mood=["Menacing", "Noir"],
        color_tone=["Monochrome", "High_Contrast_BW"],
        lighting_style=["Low_Key", "Hard_Lighting"],
        lighting_sources=["Tungsten"],
        composition=["High_Contrast", "Venetian_Blinds"],
        shot_sizes=["Medium_Shot", "Close_Up"],
        movement=["Static"],
        disallowed_sources=["LED", "HMI", "Neon"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Paramount"],
        lens_family=["Vintage_Spherical"],
        primary_focal_lengths=[35, 50],
    ),
    
    "the_maltese_falcon": FilmPreset(
        id="the_maltese_falcon",
        name="The Maltese Falcon",
        year=1941,
        era="Pre_1950",
        mood=["Suspicious", "Noir"],
        color_tone=["Monochrome"],
        lighting_style=["Low_Key"],
        lighting_sources=["Tungsten"],
        composition=["Centered"],
        shot_sizes=["Medium_Shot", "Close_Up"],
        movement=["Minimal"],
        disallowed_sources=["LED", "HMI"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Warner_Bros"],
        lens_family=["Vintage_Spherical"],
        primary_focal_lengths=[35, 50],
    ),
    
    "sunset_boulevard": FilmPreset(
        id="sunset_boulevard",
        name="Sunset Boulevard",
        year=1950,
        era="1950s",
        mood=["Haunting", "Gothic"],
        color_tone=["Monochrome"],
        lighting_style=["Expressionistic", "Low_Key"],
        lighting_sources=["Tungsten", "Practical_Lights"],
        composition=["Asymmetrical"],
        shot_sizes=["Medium_Shot", "Wide_Shot"],
        movement=["Slow_Dolly"],
        disallowed_sources=["LED", "HMI"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Paramount"],
        lens_family=["Vintage_Spherical"],
        primary_focal_lengths=[35, 50, 75],
    ),
    
    # =========================================================================
    # 1950s CLASSICS
    # =========================================================================
    
    "rashomon": FilmPreset(
        id="rashomon",
        name="Rashomon",
        year=1950,
        era="1950s",
        mood=["Ambiguous", "Introspective"],
        color_tone=["Monochrome"],
        lighting_style=["Naturalistic", "Hard_Lighting"],
        lighting_sources=["Sun"],
        composition=["Dynamic_Framing"],
        shot_sizes=["Medium_Shot"],
        movement=["Tracking"],
        disallowed_sources=["LED", "HMI"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Fuji_Eterna_500T"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Canon"],
        lens_family=["Vintage_Spherical"],
        primary_focal_lengths=[35, 50],
    ),
    
    "seven_samurai": FilmPreset(
        id="seven_samurai",
        name="Seven Samurai",
        year=1954,
        era="1950s",
        mood=["Epic", "Intense"],
        color_tone=["Monochrome"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Sun"],
        composition=["Dynamic_Blocking"],
        shot_sizes=["Wide_Shot", "Medium_Shot"],
        movement=["Tracking"],
        disallowed_sources=["LED", "HMI"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Fuji_Eterna_500T"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Canon"],
        lens_family=["Vintage_Spherical"],
        primary_focal_lengths=[25, 35, 50, 75],
    ),
    
    "vertigo": FilmPreset(
        id="vertigo",
        name="Vertigo",
        year=1958,
        era="1950s",
        mood=["Obsessive", "Dreamlike"],
        color_tone=["Saturated", "Stylized"],
        lighting_style=["Expressionistic"],
        lighting_sources=["Tungsten"],
        composition=["Centered"],
        shot_sizes=["Close_Up", "Medium_Shot"],
        movement=["Dolly_Zoom"],
        disallowed_sources=["LED"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Kodak_Vision3_500T_5219"],
        aspect_ratio="2.35:1",
        lens_manufacturer=["Paramount"],
        lens_family=["Vintage_Anamorphic"],
        primary_focal_lengths=[18, 35, 50, 100],
    ),
    
    "the_seventh_seal": FilmPreset(
        id="the_seventh_seal",
        name="The Seventh Seal",
        year=1957,
        era="1950s",
        mood=["Existential", "Contemplative"],
        color_tone=["Monochrome", "High_Contrast_BW"],
        lighting_style=["High_Contrast"],
        lighting_sources=["Sun"],
        composition=["Iconic_Silhouettes", "Symmetrical"],
        shot_sizes=["Wide_Shot"],
        movement=["Static"],
        disallowed_sources=["LED", "HMI"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[35, 50],
    ),
    
    "tokyo_story": FilmPreset(
        id="tokyo_story",
        name="Tokyo Story",
        year=1953,
        era="1950s",
        mood=["Contemplative", "Melancholic"],
        color_tone=["Monochrome"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Sun", "Practical_Lights"],
        composition=["Low_Angle", "Static"],
        shot_sizes=["Medium_Shot"],
        movement=["Static"],
        disallowed_sources=["LED", "HMI"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Fuji_Eterna_500T"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Canon"],
        lens_family=["Vintage_Spherical"],
        primary_focal_lengths=[35, 50],
    ),
    
    # =========================================================================
    # 1960s CINEMA
    # =========================================================================
    
    "2001_a_space_odyssey": FilmPreset(
        id="2001_a_space_odyssey",
        name="2001: A Space Odyssey",
        year=1968,
        era="1960s",
        mood=["Detached", "Ethereal"],
        color_tone=["Neutral", "Cool_Desaturated"],
        lighting_style=["High_Key", "Controlled"],
        lighting_sources=["Artificial"],
        composition=["Symmetrical", "Centered"],
        shot_sizes=["Wide_Shot"],
        movement=["Static", "Slow_Tracking"],
        disallowed_moods=["Cheerful", "Whimsical"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Super_Panavision_70", "Mitchell_BFC_65"],
        film_stock=["Kodak_65mm_200T"],
        aspect_ratio="2.20:1",
        lens_manufacturer=["Panavision", "Zeiss"],
        lens_family=["Panavision_Ultra_Speed", "Zeiss_Planar"],
        primary_focal_lengths=[50, 75, 100],
    ),
    
    "lawrence_of_arabia": FilmPreset(
        id="lawrence_of_arabia",
        name="Lawrence of Arabia",
        year=1962,
        era="1960s",
        mood=["Epic"],
        color_tone=["Warm_Saturated"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Sun"],
        composition=["Wide_Symmetrical", "Negative_Space"],
        shot_sizes=["EWS", "Wide_Shot"],
        movement=["Static", "Slow_Crane"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Super_Panavision_70"],
        film_stock=["Kodak_65mm_200T", "Eastman_5250"],
        aspect_ratio="2.20:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Ultra_Speed"],
        primary_focal_lengths=[28, 35, 50, 100, 482],
    ),
    
    "breathless": FilmPreset(
        id="breathless",
        name="Breathless",
        year=1960,
        era="1960s",
        mood=["Rebellious"],
        color_tone=["Monochrome"],
        lighting_style=["Available_Light", "Naturalistic"],
        lighting_sources=["Sun", "Practical_Lights"],
        composition=["Improvised", "Asymmetrical"],
        shot_sizes=["Medium_Shot", "Close_Up"],
        movement=["Handheld"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Eclair_NPR"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Angenieux"],
        lens_family=["Angenieux_Optimo"],
        primary_focal_lengths=[18, 25, 50],
    ),
    
    "jules_et_jim": FilmPreset(
        id="jules_et_jim",
        name="Jules et Jim",
        year=1962,
        era="1960s",
        mood=["Romantic", "Playful"],
        color_tone=["Monochrome"],
        lighting_style=["Soft_Lighting", "Naturalistic"],
        lighting_sources=["Sun"],
        composition=["Playful_Framing"],
        shot_sizes=["Medium_Shot", "Wide_Shot"],
        movement=["Kinetic", "Handheld"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Eclair_NPR"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="2.35:1",
        lens_manufacturer=["Angenieux"],
        lens_family=["Vintage_Anamorphic"],
        primary_focal_lengths=[25, 35, 50],
    ),
    
    "harakiri": FilmPreset(
        id="harakiri",
        name="Harakiri",
        year=1962,
        era="1960s",
        mood=["Oppressive", "Tragic"],
        color_tone=["Monochrome"],
        lighting_style=["Hard_Lighting"],
        lighting_sources=["Sun"],
        composition=["Geometric", "Symmetrical"],
        shot_sizes=["Wide_Shot", "Medium_Shot"],
        movement=["Controlled"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Fuji_Eterna_500T"],
        aspect_ratio="2.35:1",
        lens_manufacturer=["Canon"],
        lens_family=["Vintage_Anamorphic"],
        primary_focal_lengths=[35, 50, 75],
    ),
    
    "persona": FilmPreset(
        id="persona",
        name="Persona",
        year=1966,
        era="1960s",
        mood=["Psychological", "Introspective"],
        color_tone=["Monochrome", "High_Contrast_BW"],
        lighting_style=["High_Contrast"],
        lighting_sources=["Sun"],
        composition=["Extreme_Close_Up"],
        shot_sizes=["Close_Up", "ECU"],
        movement=["Static"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[50, 75, 100],
    ),
    
    "battle_of_algiers": FilmPreset(
        id="battle_of_algiers",
        name="The Battle of Algiers",
        year=1966,
        era="1960s",
        mood=["Urgent", "Documentary"],
        color_tone=["Monochrome"],
        lighting_style=["Available_Light", "Naturalistic"],
        lighting_sources=["Sun"],
        composition=["Documentary_Style"],
        shot_sizes=["Wide_Shot", "Medium_Shot"],
        movement=["Handheld"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[25, 35, 50],
    ),
    
    "la_dolce_vita": FilmPreset(
        id="la_dolce_vita",
        name="La Dolce Vita",
        year=1960,
        era="1960s",
        mood=["Existential", "Decadent"],
        color_tone=["Monochrome"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Practical_Lights", "Sun"],
        composition=["Wide_Frames"],
        shot_sizes=["Wide_Shot", "Medium_Shot"],
        movement=["Slow_Tracking"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="2.35:1",
        lens_manufacturer=["Technovision"],
        lens_family=["Vintage_Anamorphic"],
        primary_focal_lengths=[35, 50, 75],
    ),
    
    # =========================================================================
    # 1970s NEW HOLLYWOOD
    # =========================================================================
    
    "the_godfather": FilmPreset(
        id="the_godfather",
        name="The Godfather",
        year=1972,
        era="1970s",
        mood=["Menacing", "Intimate"],
        color_tone=["Warm_Desaturated"],
        lighting_style=["Low_Key", "Soft_Lighting"],
        lighting_sources=["Tungsten", "Practical_Lights"],
        composition=["Centered", "Negative_Space"],
        shot_sizes=["Medium_Shot", "Close_Up"],
        movement=["Static", "Slow_Dolly"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC", "Mitchell_BNCR"],
        film_stock=["Eastman_5254"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Bausch_Lomb"],
        lens_family=["Bausch_Lomb_Baltar"],
        primary_focal_lengths=[40, 50, 75],
    ),
    
    "taxi_driver": FilmPreset(
        id="taxi_driver",
        name="Taxi Driver",
        year=1976,
        era="1970s",
        mood=["Menacing", "Lonely"],
        color_tone=["Warm_Saturated"],
        lighting_style=["Low_Key", "Practical_Motivated"],
        lighting_sources=["Neon", "Tungsten"],
        composition=["Centered"],
        shot_sizes=["MCU", "Close_Up"],
        movement=["Slow_Dolly"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arricam_LT", "ARRI_35BL"],
        film_stock=["Eastman_5254"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Super_Speed"],
        primary_focal_lengths=[25, 35, 50],
    ),
    
    "apocalypse_now": FilmPreset(
        id="apocalypse_now",
        name="Apocalypse Now",
        year=1979,
        era="1970s",
        mood=["Surreal", "Oppressive"],
        color_tone=["Warm_Saturated"],
        lighting_style=["Expressionistic", "Naturalistic"],
        lighting_sources=["Sun", "Practical_Lights"],
        composition=["Asymmetrical"],
        shot_sizes=["Wide_Shot", "Close_Up"],
        movement=["Slow_Dolly", "Handheld"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Panaflex", "Arricam_ST"],
        film_stock=["Eastman_5247"],
        aspect_ratio="2.39:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[35, 50, 75, 100],
    ),
    
    "chinatown": FilmPreset(
        id="chinatown",
        name="Chinatown",
        year=1974,
        era="1970s",
        mood=["Paranoid", "Noir"],
        color_tone=["Warm_Desaturated"],
        lighting_style=["Naturalistic", "Low_Key"],
        lighting_sources=["Sun", "Practical_Lights"],
        composition=["Rule_of_Thirds", "Negative_Space"],
        shot_sizes=["Medium_Shot", "Wide_Shot"],
        movement=["Static", "Slow_Dolly"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Panaflex"],
        film_stock=["Eastman_5254"],
        aspect_ratio="2.35:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_C_Series"],
        primary_focal_lengths=[35, 50, 75, 100],
    ),
    
    "barry_lyndon": FilmPreset(
        id="barry_lyndon",
        name="Barry Lyndon",
        year=1975,
        era="1970s",
        mood=["Detached", "Melancholic"],
        color_tone=["Warm_Saturated", "Natural"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Candle", "Sun"],
        composition=["Painterly", "Symmetrical"],
        shot_sizes=["Wide_Shot"],
        movement=["Minimal", "Slow_Zoom"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Eastman_5254"],
        aspect_ratio="1.66:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Planar_f0.7"],
        primary_focal_lengths=[36, 50],
    ),
    
    "a_clockwork_orange": FilmPreset(
        id="a_clockwork_orange",
        name="A Clockwork Orange",
        year=1971,
        era="1970s",
        mood=["Provocative", "Surreal"],
        color_tone=["High_Contrast"],
        lighting_style=["Hard_Lighting"],
        lighting_sources=["Artificial"],
        composition=["Wide_Angle_Centered", "Symmetrical"],
        shot_sizes=["Wide_Shot"],
        movement=["Static"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35BL"],
        film_stock=["Eastman_5254"],
        aspect_ratio="1.66:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Super_Speed"],
        primary_focal_lengths=[18, 24, 35],
    ),
    
    "the_french_connection": FilmPreset(
        id="the_french_connection",
        name="The French Connection",
        year=1971,
        era="1970s",
        mood=["Gritty", "Urgent"],
        color_tone=["Cool_Desaturated"],
        lighting_style=["Available_Light", "Naturalistic"],
        lighting_sources=["Sun", "Practical_Lights"],
        composition=["Rough_Framing"],
        shot_sizes=["Medium_Shot", "Wide_Shot"],
        movement=["Handheld"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35BL"],
        film_stock=["Eastman_5254"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[25, 35, 50],
    ),
    
    "one_flew_over_cuckoos_nest": FilmPreset(
        id="one_flew_over_cuckoos_nest",
        name="One Flew Over the Cuckoo's Nest",
        year=1975,
        era="1970s",
        mood=["Oppressive", "Tragicomic"],
        color_tone=["Neutral_Desaturated"],
        lighting_style=["Soft_Natural", "Naturalistic"],
        lighting_sources=["Window", "Fluorescent"],
        composition=["Observational"],
        shot_sizes=["Medium_Shot"],
        movement=["Minimal"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Panaflex"],
        film_stock=["Eastman_5254"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[35, 50, 75],
    ),
    
    "the_mirror": FilmPreset(
        id="the_mirror",
        name="The Mirror",
        year=1975,
        era="1970s",
        mood=["Introspective", "Dreamlike"],
        color_tone=["Muted", "Sepia"],
        lighting_style=["Soft_Natural", "Naturalistic"],
        lighting_sources=["Window", "Sun"],
        composition=["Poetic"],
        shot_sizes=["Medium_Shot", "Wide_Shot"],
        movement=["Floating"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35"],
        film_stock=["Eastman_5254"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[35, 50],
    ),
    
    "star_wars_anh": FilmPreset(
        id="star_wars_anh",
        name="Star Wars: A New Hope",
        year=1977,
        era="1970s",
        mood=["Adventurous", "Epic"],
        color_tone=["Warm_Saturated"],
        lighting_style=["High_Key"],
        lighting_sources=["Artificial", "Sun"],
        composition=["Classic_Composition"],
        shot_sizes=["Wide_Shot", "Medium_Shot"],
        movement=["Crane", "Dolly"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Panaflex"],
        film_stock=["Eastman_5247"],
        aspect_ratio="2.35:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[35, 50, 75, 100],
    ),
    
    # =========================================================================
    # 1980s CINEMA
    # =========================================================================
    
    "blade_runner": FilmPreset(
        id="blade_runner",
        name="Blade Runner",
        year=1982,
        era="1980s",
        mood=["Gloomy", "Noir"],
        color_tone=["Cool_Desaturated"],
        lighting_style=["Low_Key", "Hard_Lighting", "Practical_Motivated"],
        lighting_sources=["Neon", "Tungsten", "Practical_Lights"],
        composition=["Centered", "Symmetrical"],
        shot_sizes=["Wide_Shot", "Medium_Shot"],
        movement=["Slow_Dolly", "Static"],
        disallowed_moods=["Cheerful", "Hopeful", "Whimsical"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Panaflex"],
        film_stock=["Eastman_5293", "Eastman_5294"],
        aspect_ratio="2.39:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_C_Series"],
        primary_focal_lengths=[35, 50, 75, 100],
    ),
    
    "blue_velvet": FilmPreset(
        id="blue_velvet",
        name="Blue Velvet",
        year=1986,
        era="1980s",
        mood=["Unsettling", "Surreal"],
        color_tone=["Highly_Saturated"],
        lighting_style=["Expressionistic", "Hard_Lighting"],
        lighting_sources=["Tungsten", "Practical_Lights"],
        composition=["Centered", "Asymmetrical"],
        shot_sizes=["Close_Up"],
        movement=["Slow_Push_In"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35BL"],
        film_stock=["Eastman_5247"],
        aspect_ratio="2.35:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[35, 50, 75],
    ),
    
    "brazil": FilmPreset(
        id="brazil",
        name="Brazil",
        year=1985,
        era="1980s",
        mood=["Absurd", "Oppressive"],
        color_tone=["Muted", "Cool_Desaturated"],
        lighting_style=["Expressionistic"],
        lighting_sources=["Artificial", "Fluorescent"],
        composition=["Overdesigned_Frames"],
        shot_sizes=["Wide_Shot"],
        movement=["Mechanical"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Panaflex"],
        film_stock=["Eastman_5247"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[24, 35, 50],
    ),
    
    "come_and_see": FilmPreset(
        id="come_and_see",
        name="Come and See",
        year=1985,
        era="1980s",
        mood=["Traumatic", "Oppressive"],
        color_tone=["Cool_Desaturated"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Overcast", "Sun"],
        composition=["Disorienting_Framing"],
        shot_sizes=["Close_Up", "Wide_Shot"],
        movement=["Slow_Handheld"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35"],
        film_stock=["Eastman_5247"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[18, 25, 35],
    ),
    
    "alien": FilmPreset(
        id="alien",
        name="Alien",
        year=1979,
        era="1970s",
        mood=["Claustrophobic", "Dread"],
        color_tone=["Cool_Desaturated"],
        lighting_style=["Low_Key"],
        lighting_sources=["Practical_Lights", "Artificial"],
        composition=["Industrial_Frames", "Negative_Space"],
        shot_sizes=["Wide_Shot", "Medium_Shot"],
        movement=["Slow_Creep"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Panaflex"],
        film_stock=["Eastman_5247"],
        aspect_ratio="2.35:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[35, 50, 75],
    ),
    
    # =========================================================================
    # 1990s CINEMA
    # =========================================================================
    
    "pulp_fiction": FilmPreset(
        id="pulp_fiction",
        name="Pulp Fiction",
        year=1994,
        era="1990s",
        mood=["Stylized", "Playful"],
        color_tone=["Warm_Saturated"],
        lighting_style=["High_Key", "Practical_Motivated"],
        lighting_sources=["Tungsten", "Practical_Lights"],
        composition=["Centered"],
        shot_sizes=["Medium_Shot"],
        movement=["Static"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Platinum", "Arricam_ST"],
        film_stock=["Kodak_Vision_500T_5279"],
        aspect_ratio="2.39:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[27, 35, 50, 75],
    ),
    
    "the_shawshank_redemption": FilmPreset(
        id="the_shawshank_redemption",
        name="The Shawshank Redemption",
        year=1994,
        era="1990s",
        mood=["Hopeful", "Melancholic"],
        color_tone=["Warm_Saturated"],
        lighting_style=["Soft_Lighting"],
        lighting_sources=["Sun", "Practical_Lights"],
        composition=["Rule_of_Thirds"],
        shot_sizes=["Wide_Shot", "Medium_Shot"],
        movement=["Slow_Dolly"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arricam_ST"],
        film_stock=["Eastman_5293", "Eastman_5294"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Super_Speed"],
        primary_focal_lengths=[25, 35, 50, 85],
    ),
    
    "schindlers_list": FilmPreset(
        id="schindlers_list",
        name="Schindler's List",
        year=1993,
        era="1990s",
        mood=["Somber", "Tragic"],
        color_tone=["Monochrome"],
        lighting_style=["Naturalistic", "Low_Key"],
        lighting_sources=["Practical_Lights", "Sun"],
        composition=["Rule_of_Thirds"],
        shot_sizes=["Medium_Shot"],
        movement=["Handheld"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arricam_ST", "ARRI_535B"],
        film_stock=["Kodak_Double_X_5222"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Super_Speed"],
        primary_focal_lengths=[25, 32, 40, 50],
    ),
    
    "la_haine": FilmPreset(
        id="la_haine",
        name="La Haine",
        year=1995,
        era="1990s",
        mood=["Angry", "Urgent"],
        color_tone=["Monochrome"],
        lighting_style=["Naturalistic", "Available_Light"],
        lighting_sources=["Practical_Lights", "Sun"],
        composition=["Street_Level"],
        shot_sizes=["Medium_Shot"],
        movement=["Handheld"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35BL"],
        film_stock=["Kodak_Double_X_5222"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[25, 35, 50],
    ),
    
    "heat": FilmPreset(
        id="heat",
        name="Heat",
        year=1995,
        era="1990s",
        mood=["Controlled", "Tense"],
        color_tone=["Cool_Desaturated"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Practical_Lights", "Sun"],
        composition=["Architectural"],
        shot_sizes=["Wide_Shot"],
        movement=["Locked_Off"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Platinum"],
        film_stock=["Kodak_Vision_500T_5279"],
        aspect_ratio="2.39:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[35, 50, 100],
    ),
    
    "the_thin_red_line": FilmPreset(
        id="the_thin_red_line",
        name="The Thin Red Line",
        year=1998,
        era="1990s",
        mood=["Contemplative", "Ethereal"],
        color_tone=["Warm_Saturated", "Natural"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Sun"],
        composition=["Organic_Wide_Frames"],
        shot_sizes=["Wide_Shot"],
        movement=["Floating"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Panaflex"],
        film_stock=["Kodak_Vision_500T_5279"],
        aspect_ratio="2.39:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[21, 27, 35, 50],
    ),
    
    "the_matrix": FilmPreset(
        id="the_matrix",
        name="The Matrix",
        year=1999,
        era="1990s",
        mood=["Stylized", "Paranoid"],
        color_tone=["Cool_Desaturated", "Green_Tint"],
        lighting_style=["Hard_Lighting"],
        lighting_sources=["Artificial"],
        composition=["Centered"],
        shot_sizes=["Medium_Shot", "Wide_Shot"],
        movement=["Controlled_Dolly"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Platinum"],
        film_stock=["Kodak_Vision_500T_5279"],
        aspect_ratio="2.39:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[27, 35, 50, 75, 100],
    ),
    
    "eyes_wide_shut": FilmPreset(
        id="eyes_wide_shut",
        name="Eyes Wide Shut",
        year=1999,
        era="1990s",
        mood=["Dreamlike", "Surreal"],
        color_tone=["Warm_Saturated"],
        lighting_style=["Soft_Lighting", "Practical_Motivated"],
        lighting_sources=["Tungsten", "Practical_Lights"],
        composition=["Centered"],
        shot_sizes=["MCU"],
        movement=["Slow_Tracking"],
        # Technical specifications
        camera_type="Film",
        camera_body=["ARRI_535B"],
        film_stock=["Eastman_5293"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Super_Speed"],
        primary_focal_lengths=[25, 35, 50],
    ),
    
    # =========================================================================
    # 2000s CINEMA
    # =========================================================================
    
    "in_the_mood_for_love": FilmPreset(
        id="in_the_mood_for_love",
        name="In the Mood for Love",
        year=2000,
        era="Modern",
        mood=["Melancholic", "Romantic"],
        color_tone=["Warm_Saturated"],
        lighting_style=["Soft_Lighting"],
        lighting_sources=["Practical_Lights"],
        composition=["Frame_Within_Frame"],
        shot_sizes=["MCU"],
        movement=["Slow_Tracking"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arricam_ST", "ARRI_535B"],
        film_stock=["Kodak_Vision_500T_5279"],
        aspect_ratio="1.66:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Super_Speed"],
        primary_focal_lengths=[35, 50, 75],
    ),
    
    "mulholland_drive": FilmPreset(
        id="mulholland_drive",
        name="Mulholland Drive",
        year=2001,
        era="Modern",
        mood=["Surreal", "Dreamlike"],
        color_tone=["Neutral", "Cool_Desaturated"],
        lighting_style=["Expressionistic", "Low_Key"],
        lighting_sources=["Practical_Lights", "Tungsten"],
        composition=["Asymmetrical", "Negative_Space"],
        shot_sizes=["MCU", "Close_Up"],
        movement=["Slow_Push_In", "Unsettling_Static"],
        disallowed_moods=["Cheerful"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Platinum"],
        film_stock=["Kodak_Vision_500T_5279"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[27, 35, 50, 75],
    ),
    
    "amelie": FilmPreset(
        id="amelie",
        name="Amelie",
        year=2001,
        era="Modern",
        mood=["Whimsical", "Romantic"],
        color_tone=["Warm_Saturated", "Stylized"],
        lighting_style=["Soft_Lighting"],
        lighting_sources=["Practical_Lights"],
        composition=["Centered"],
        shot_sizes=["Medium_Shot"],
        movement=["Gentle_Dolly"],
        # Technical specifications
        camera_type="Film",
        camera_body=["ARRI_535B"],
        film_stock=["Kodak_Vision_500T_5279"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[27, 35, 50],
    ),
    
    "oldboy": FilmPreset(
        id="oldboy",
        name="Oldboy",
        year=2003,
        era="Modern",
        mood=["Brutal", "Tragic"],
        color_tone=["Cool_Desaturated"],
        lighting_style=["Hard_Lighting"],
        lighting_sources=["Fluorescent", "Practical_Lights"],
        composition=["Constrained_Framing"],
        shot_sizes=["Medium_Shot"],
        movement=["Extended_Tracking"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35"],
        film_stock=["Kodak_Vision_500T_5279"],
        aspect_ratio="2.35:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[25, 35, 50],
    ),
    
    "memories_of_murder": FilmPreset(
        id="memories_of_murder",
        name="Memories of Murder",
        year=2003,
        era="Modern",
        mood=["Oppressive", "Melancholic"],
        color_tone=["Muted", "Cool_Desaturated"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Overcast", "Practical_Lights"],
        composition=["Observational"],
        shot_sizes=["Medium_Shot"],
        movement=["Slow_Tracking"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35"],
        film_stock=["Kodak_Vision_500T_5279"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[27, 35, 50, 75],
    ),
    
    "requiem_for_a_dream": FilmPreset(
        id="requiem_for_a_dream",
        name="Requiem for a Dream",
        year=2000,
        era="Modern",
        mood=["Anxious", "Despairing"],
        color_tone=["Highly_Saturated"],
        lighting_style=["Hard_Lighting"],
        lighting_sources=["Artificial"],
        composition=["Aggressive_Closeups"],
        shot_sizes=["ECU"],
        movement=["Fast_Montage"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_435"],
        film_stock=["Kodak_Vision_500T_5279"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Super_Speed"],
        primary_focal_lengths=[18, 25, 35],
    ),
    
    "children_of_men": FilmPreset(
        id="children_of_men",
        name="Children of Men",
        year=2006,
        era="Modern",
        mood=["Oppressive", "Urgent"],
        color_tone=["Cool_Desaturated"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Overcast", "Practical_Lights"],
        composition=["Handheld_Frames"],
        shot_sizes=["Wide_Shot"],
        movement=["Extended_Handheld"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arricam_LT"],
        film_stock=["Kodak_Vision2_500T_5218"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Master_Prime"],
        primary_focal_lengths=[18, 21, 25, 32],
    ),
    
    "no_country_for_old_men": FilmPreset(
        id="no_country_for_old_men",
        name="No Country for Old Men",
        year=2007,
        era="Modern",
        mood=["Menacing", "Bleak"],
        color_tone=["Neutral_Desaturated"],
        lighting_style=["Naturalistic", "Low_Key"],
        lighting_sources=["Sun", "Practical_Lights"],
        composition=["Negative_Space"],
        shot_sizes=["Wide_Shot"],
        movement=["Static"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arricam_LT", "ARRI_535B"],
        film_stock=["Kodak_Vision2_500T_5218"],
        aspect_ratio="2.39:1",
        lens_manufacturer=["Cooke"],
        lens_family=["Cooke_S4"],
        primary_focal_lengths=[27, 35, 50, 75],
    ),
    
    "there_will_be_blood": FilmPreset(
        id="there_will_be_blood",
        name="There Will Be Blood",
        year=2007,
        era="Modern",
        mood=["Oppressive", "Epic"],
        color_tone=["Warm_Desaturated"],
        lighting_style=["Naturalistic", "Low_Key"],
        lighting_sources=["Sun", "Practical_Lights"],
        composition=["Negative_Space"],
        shot_sizes=["Wide_Shot"],
        movement=["Slow_Crane"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_XL", "Arricam_LT"],
        film_stock=["Kodak_Vision2_500T_5218"],
        aspect_ratio="2.35:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[27, 35, 50, 75, 100],
    ),
    
    "the_dark_knight": FilmPreset(
        id="the_dark_knight",
        name="The Dark Knight",
        year=2008,
        era="Modern",
        mood=["Menacing", "Chaotic"],
        color_tone=["Cool_Desaturated"],
        lighting_style=["Low_Key"],
        lighting_sources=["Artificial", "Practical_Lights"],
        composition=["Centered"],
        shot_sizes=["Wide_Shot"],
        movement=["IMAX_Crane"],
        # Technical specifications
        camera_type="Film",
        camera_body=["IMAX_MSM_9802", "Panavision_Panaflex"],
        film_stock=["IMAX_500T", "Kodak_Vision_500T_5279"],
        aspect_ratio="2.39:1",
        lens_manufacturer=["Hasselblad", "Panavision"],
        lens_family=["Hasselblad_V", "Panavision_C_Series"],  # Hasselblad for IMAX, Panavision anamorphic for 35mm
        primary_focal_lengths=[50, 80, 100],
    ),
    
    "enter_the_void": FilmPreset(
        id="enter_the_void",
        name="Enter the Void",
        year=2009,
        era="Modern",
        mood=["Hallucinatory", "Surreal"],
        color_tone=["Neon", "Highly_Saturated"],
        lighting_style=["Expressionistic"],
        lighting_sources=["Neon", "Artificial"],
        composition=["POV_Framing"],
        shot_sizes=["Wide_Shot"],
        movement=["Floating"],
        # Technical specifications
        camera_type="Digital",
        camera_body=["RED_One"],
        film_stock=[],  # Digital
        aspect_ratio="2.39:1",
        lens_manufacturer=["Canon"],
        lens_family=["Canon_K35"],
        primary_focal_lengths=[18, 24, 35],
    ),
    
    # =========================================================================
    # 2010s CINEMA
    # =========================================================================
    
    "the_tree_of_life": FilmPreset(
        id="the_tree_of_life",
        name="The Tree of Life",
        year=2011,
        era="Modern",
        mood=["Transcendent", "Nostalgic"],
        color_tone=["Warm_Saturated", "Natural"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Sun"],
        composition=["Organic_Framing"],
        shot_sizes=["Wide_Shot", "Close_Up"],
        movement=["Floating_Handheld"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Panaflex"],
        film_stock=["Kodak_Vision3_500T_5219"],
        aspect_ratio="1.85:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[14, 17, 21, 27, 35],
    ),
    
    "drive": FilmPreset(
        id="drive",
        name="Drive",
        year=2011,
        era="Modern",
        mood=["Detached", "Noir"],
        color_tone=["Neon", "Cool_Saturated"],
        lighting_style=["Practical_Motivated"],
        lighting_sources=["Neon", "Practical_Lights"],
        composition=["Centered"],
        shot_sizes=["Medium_Shot"],
        movement=["Slow_Dolly"],
        # Technical specifications
        camera_type="Digital",
        camera_body=["Alexa"],
        film_stock=[],  # Digital
        aspect_ratio="2.39:1",
        lens_manufacturer=["Panavision"],
        lens_family=["Panavision_Primo"],
        primary_focal_lengths=[27, 35, 50, 75],
    ),
    
    "her": FilmPreset(
        id="her",
        name="Her",
        year=2013,
        era="Modern",
        mood=["Intimate", "Melancholic"],
        color_tone=["Warm_Saturated", "Pastel"],
        lighting_style=["Soft_Lighting"],
        lighting_sources=["Practical_Lights"],
        composition=["Centered"],
        shot_sizes=["MCU"],
        movement=["Slow_Tracking"],
        # Technical specifications
        camera_type="Digital",
        camera_body=["Alexa"],
        film_stock=[],  # Digital
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Master_Prime"],
        primary_focal_lengths=[32, 50, 65, 85],
    ),
    
    "under_the_skin": FilmPreset(
        id="under_the_skin",
        name="Under the Skin",
        year=2013,
        era="Modern",
        mood=["Alienated", "Eerie"],
        color_tone=["Cool_Desaturated"],
        lighting_style=["Minimal", "Naturalistic"],
        lighting_sources=["Overcast", "Practical_Lights"],
        composition=["Abstract"],
        shot_sizes=["Wide_Shot", "Medium_Shot"],
        movement=["Observational"],
        # Technical specifications
        camera_type="Digital",
        camera_body=["Alexa"],
        film_stock=[],  # Digital
        aspect_ratio="1.85:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Ultra_Prime"],
        primary_focal_lengths=[16, 24, 32, 50],
    ),
    
    "the_grand_budapest_hotel": FilmPreset(
        id="the_grand_budapest_hotel",
        name="The Grand Budapest Hotel",
        year=2014,
        era="Modern",
        mood=["Whimsical", "Nostalgic"],
        color_tone=["Highly_Saturated", "Pastel"],
        lighting_style=["High_Key"],
        lighting_sources=["Artificial"],
        composition=["Symmetrical", "Centered"],
        shot_sizes=["Wide_Shot"],
        movement=["Mechanical_Dolly"],
        # Technical specifications
        camera_type="Digital",
        camera_body=["Alexa_XT"],
        film_stock=[],  # Digital
        aspect_ratio="1.37:1",  # Academy ratio for period sequences
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Master_Prime"],
        primary_focal_lengths=[21, 25, 27, 32, 40],
    ),
    
    "mad_max_fury_road": FilmPreset(
        id="mad_max_fury_road",
        name="Mad Max: Fury Road",
        year=2015,
        era="Modern",
        mood=["Aggressive", "Chaotic"],
        color_tone=["Warm_Saturated", "Highly_Saturated"],
        lighting_style=["Hard_Lighting"],
        lighting_sources=["Sun"],
        composition=["Centered_Action"],
        shot_sizes=["Wide_Shot"],
        movement=["Fast_Tracking"],
        # Technical specifications - Shot digitally on ARRI Alexa XT with Zeiss Master Primes
        camera_type="Digital",
        camera_body=["Alexa_XT"],
        film_stock=[],  # Digital
        aspect_ratio="2.39:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Master_Prime"],
        primary_focal_lengths=[14, 21, 27, 32, 50],
    ),
    
    "moonlight": FilmPreset(
        id="moonlight",
        name="Moonlight",
        year=2016,
        era="Modern",
        mood=["Tender", "Melancholic"],
        color_tone=["Cool_Saturated"],
        lighting_style=["Soft_Lighting"],
        lighting_sources=["Moon", "Practical_Lights"],
        composition=["Intimate_Framing"],
        shot_sizes=["Close_Up"],
        movement=["Slow_Tracking"],
        # Technical specifications
        camera_type="Digital",
        camera_body=["Alexa_Mini"],
        film_stock=[],  # Digital
        aspect_ratio="2.39:1",
        lens_manufacturer=["Hawk"],
        lens_family=["Hawk_V_Lite"],
        primary_focal_lengths=[25, 35, 50, 75],
    ),
    
    "roma": FilmPreset(
        id="roma",
        name="Roma",
        year=2018,
        era="Modern",
        mood=["Contemplative", "Nostalgic"],
        color_tone=["Monochrome"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Sun", "Practical_Lights"],
        composition=["Wide_Static_Frames"],
        shot_sizes=["Wide_Shot"],
        movement=["Slow_Pan"],
        # Technical specifications - Shot on ARRI Alexa 65 with ARRI Prime 65 lenses (65mm large format)
        camera_type="Digital",
        camera_body=["Alexa_65"],
        film_stock=[],  # Digital
        aspect_ratio="2.39:1",
        lens_manufacturer=["ARRI"],
        lens_family=["ARRI_Prime_65"],
        primary_focal_lengths=[24, 28, 35, 50, 80, 100, 150],
    ),
    
    "the_lighthouse": FilmPreset(
        id="the_lighthouse",
        name="The Lighthouse",
        year=2019,
        era="Modern",
        mood=["Unhinged", "Claustrophobic"],
        color_tone=["Monochrome", "High_Contrast_BW"],
        lighting_style=["Hard_Lighting"],
        lighting_sources=["Practical_Lights"],
        composition=["Claustrophobic"],
        shot_sizes=["Close_Up", "Medium_Shot"],
        movement=["Rigid"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Panavision_Millennium_XL2"],
        film_stock=["Kodak_Double_X_5222"],
        aspect_ratio="1.19:1",  # Unique ratio!
        lens_manufacturer=["Panavision"],
        lens_family=["Vintage_Spherical"],
        primary_focal_lengths=[25, 32, 40],
    ),
    
    "parasite": FilmPreset(
        id="parasite",
        name="Parasite",
        year=2019,
        era="Modern",
        mood=["Tense", "Tragicomic"],
        color_tone=["Neutral_Saturated"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Practical_Lights", "Window"],
        composition=["Architectural_Symmetry"],
        shot_sizes=["Medium_Shot"],
        movement=["Slow_Tracking"],
        # Technical specifications - Shot on ARRI Alexa 65 with ARRI Prime DNA lenses
        camera_type="Digital",
        camera_body=["Alexa_65"],
        film_stock=[],  # Digital
        aspect_ratio="2.39:1",
        lens_manufacturer=["ARRI"],
        lens_family=["ARRI_Prime_DNA"],
        primary_focal_lengths=[18, 25, 35, 50, 65, 80],
    ),
    
    # =========================================================================
    # ADDITIONAL CLASSICS & ART CINEMA
    # =========================================================================
    
    "metropolis": FilmPreset(
        id="metropolis",
        name="Metropolis",
        year=1927,
        era="Silent_Era",
        mood=["Oppressive", "Gothic"],
        color_tone=["Monochrome"],
        lighting_style=["Expressionistic"],
        lighting_sources=["Artificial"],
        composition=["Symmetrical"],
        shot_sizes=["Wide_Shot"],
        movement=["Static"],
        disallowed_sources=["LED", "HMI", "Neon", "Kino_Flo"],
        # Technical specifications
        camera_type="Film",
        camera_body=["UFA_Custom"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.33:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Vintage_Spherical"],
        primary_focal_lengths=[35, 50],
    ),
    
    "un_chien_andalou": FilmPreset(
        id="un_chien_andalou",
        name="Un Chien Andalou",
        year=1929,
        era="Silent_Era",
        mood=["Surreal"],
        color_tone=["Monochrome"],
        lighting_style=["Expressionistic"],
        lighting_sources=["Artificial"],
        composition=["Disruptive"],
        shot_sizes=["Close_Up", "Wide_Shot"],
        movement=["Unpredictable"],
        disallowed_sources=["LED", "HMI", "Neon"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Pathe_Studio"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.33:1",
        lens_manufacturer=["Pathe"],
        lens_family=["Vintage_Spherical"],
        primary_focal_lengths=[35, 50],
    ),
    
    "bicycle_thieves": FilmPreset(
        id="bicycle_thieves",
        name="Bicycle Thieves",
        year=1948,
        era="Pre_1950",
        mood=["Melancholic", "Hopeful"],
        color_tone=["Monochrome"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Sun"],
        composition=["Street_Level"],
        shot_sizes=["Medium_Shot", "Wide_Shot"],
        movement=["Handheld"],
        disallowed_sources=["LED", "HMI"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Mitchell_BNC"],
        film_stock=["Eastman_Plus_X"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Cooke"],
        lens_family=["Vintage_Spherical"],
        primary_focal_lengths=[35, 50],
    ),
    
    "stalker": FilmPreset(
        id="stalker",
        name="Stalker",
        year=1979,
        era="1970s",
        mood=["Meditative", "Ethereal"],
        color_tone=["Cool_Desaturated", "Sepia"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Overcast", "Sun"],
        composition=["Negative_Space"],
        shot_sizes=["Wide_Shot"],
        movement=["Slow_Tracking"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35"],
        film_stock=["Eastman_5247"],
        aspect_ratio="1.37:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[35, 50, 75],
    ),
    
    "solaris": FilmPreset(
        id="solaris",
        name="Solaris",
        year=1972,
        era="1970s",
        mood=["Existential", "Contemplative"],
        color_tone=["Muted", "Cool_Desaturated"],
        lighting_style=["Naturalistic"],
        lighting_sources=["Artificial", "Window"],
        composition=["Minimalist"],
        shot_sizes=["Wide_Shot", "Close_Up"],
        movement=["Slow"],
        # Technical specifications
        camera_type="Film",
        camera_body=["Arriflex_35"],
        film_stock=["Eastman_5247"],
        aspect_ratio="2.35:1",
        lens_manufacturer=["Zeiss"],
        lens_family=["Zeiss_Standard_Speed"],
        primary_focal_lengths=[35, 50],
    ),
}


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_preset(preset_id: str) -> FilmPreset | None:
    """Get a film preset by ID."""
    return LIVE_ACTION_PRESETS.get(preset_id)


def get_all_presets() -> dict[str, FilmPreset]:
    """Get all film presets."""
    return LIVE_ACTION_PRESETS


def get_presets_by_era(era: str) -> dict[str, FilmPreset]:
    """Get all presets from a specific era."""
    return {k: v for k, v in LIVE_ACTION_PRESETS.items() if v.era == era}


def get_presets_by_mood(mood: str) -> dict[str, FilmPreset]:
    """Get all presets containing a specific mood."""
    return {k: v for k, v in LIVE_ACTION_PRESETS.items() if mood in v.mood}
