"""Live-Action Cinema schemas - cameras, lenses, lighting, movement."""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

from cinema_rules.schemas.common import VisualGrammar


# =============================================================================
# CAMERA SYSTEM
# =============================================================================

class CameraType(str, Enum):
    """Camera type - Digital or Film."""
    DIGITAL = "Digital"
    FILM = "Film"


class CameraManufacturer(str, Enum):
    """Camera manufacturers."""
    # Digital Manufacturers
    ARRI = "ARRI"
    RED = "RED"
    SONY = "Sony"
    CANON = "Canon"
    BLACKMAGIC = "Blackmagic"
    PANASONIC = "Panasonic"
    NIKON = "Nikon"
    DJI = "DJI"
    # Film Manufacturers
    ARRI_FILM = "ARRI_Film"
    PANAVISION = "Panavision"
    MITCHELL = "Mitchell"
    IMAX_CORP = "IMAX"
    ECLAIR = "Eclair"
    VINTAGE = "Vintage"


class SensorSize(str, Enum):
    """Sensor/film format sizes."""
    SUPER35 = "Super35"
    FULL_FRAME = "FullFrame"
    LARGE_FORMAT = "LargeFormat"
    SIXTY_FIVE_MM = "65mm"
    MICRO_FOUR_THIRDS = "MicroFourThirds"
    # Film formats
    FILM_35MM = "Film_35mm"
    FILM_65MM = "Film_65mm"
    FILM_70MM = "Film_70mm"
    IMAX_15_70 = "IMAX_15_70"
    IMAX_GT = "IMAX_GT"


class WeightClass(str, Enum):
    """Camera weight classification for movement constraints."""
    ULTRA_LIGHT = "UltraLight"  # < 2.0 kg
    LIGHT = "Light"             # 2.0 - 3.0 kg
    MEDIUM = "Medium"           # 3.0 - 4.0 kg
    HEAVY = "Heavy"             # > 4.0 kg


class CameraBody(str, Enum):
    """Specific camera models."""
    # ARRI Digital
    ALEXA_35 = "Alexa_35"
    ALEXA_MINI = "Alexa_Mini"
    ALEXA_MINI_LF = "Alexa_Mini_LF"
    ALEXA_LF = "Alexa_LF"
    ALEXA_65 = "Alexa_65"
    
    # RED
    V_RAPTOR = "V_Raptor"
    V_RAPTOR_X = "V_Raptor_X"
    V_RAPTOR_XL = "V_Raptor_XL"
    KOMODO_X = "Komodo_X"
    MONSTRO_8K = "Monstro_8K"
    
    # Sony
    VENICE_2 = "Venice_2"
    FX9 = "FX9"
    FX6 = "FX6"
    
    # Canon
    C700_FF = "C700_FF"
    C500_MARK_II = "C500_Mark_II"
    C300_MARK_III = "C300_Mark_III"
    
    # Blackmagic
    URSA_MINI_PRO_12K = "Ursa_Mini_Pro_12K"
    POCKET_6K = "Pocket_6K"
    
    # Panasonic
    VARICAM_LT = "Varicam_LT"
    S1H = "S1H"
    
    # Nikon
    Z9 = "Z9"
    
    # DJI
    INSPIRE_3 = "Inspire_3"
    MAVIC_3_CINE = "Mavic_3_Cine"
    
    # =========================================================================
    # FILM CAMERAS - ARRI Film
    # =========================================================================
    ARRICAM_ST = "Arricam_ST"
    ARRICAM_LT = "Arricam_LT"
    ARRI_535B = "ARRI_535B"
    ARRI_35BL = "ARRI_35BL"
    ARRI_35_III = "ARRI_35_III"
    ARRIFLEX_35 = "Arriflex_35"  # Classic 35mm (1937-)
    ARRIFLEX_35BL = "Arriflex_35BL"  # Blimp (1972-)
    ARRIFLEX_435 = "Arriflex_435"  # Modern 35mm (1995-)
    
    # =========================================================================
    # FILM CAMERAS - Eclair (French New Wave)
    # =========================================================================
    ECLAIR_NPR = "Eclair_NPR"  # Nouvelle Vague standard
    
    # =========================================================================
    # FILM CAMERAS - Panavision
    # =========================================================================
    PANAVISION_MILLENNIUM_XL2 = "Panavision_Millennium_XL2"
    PANAVISION_MILLENNIUM = "Panavision_Millennium"
    PANAVISION_PLATINUM = "Panavision_Platinum"
    PANAVISION_GOLD = "Panavision_Gold"
    PANAVISION_PANASTAR = "Panavision_Panastar"
    PANAVISION_PANAFLEX = "Panavision_Panaflex"
    SUPER_PANAVISION_70 = "Super_Panavision_70"
    ULTRA_PANAVISION_70 = "Ultra_Panavision_70"
    PANAVISION_XL = "Panavision_XL"  # Alias for XL2
    
    # =========================================================================
    # DIGITAL CAMERAS - Early Digital & Aliases
    # =========================================================================
    ALEXA = "Alexa"  # Generic Alexa (maps to Alexa_35)
    ALEXA_XT = "Alexa_XT"  # Alexa XT series
    RED_ONE = "RED_One"  # Original RED
    
    # =========================================================================
    # FILM CAMERAS - Vintage/Historic
    # =========================================================================
    UFA_CUSTOM = "UFA_Custom"  # Metropolis era
    PATHE_STUDIO = "Pathe_Studio"  # Silent era
    
    # =========================================================================
    # FILM CAMERAS - Mitchell
    # =========================================================================
    MITCHELL_BNC = "Mitchell_BNC"
    MITCHELL_BNCR = "Mitchell_BNCR"
    MITCHELL_BFC_65 = "Mitchell_BFC_65"
    
    # =========================================================================
    # FILM CAMERAS - IMAX
    # =========================================================================
    IMAX_MSM_9802 = "IMAX_MSM_9802"
    IMAX_MKIV = "IMAX_MKIV"
    IMAX_GT = "IMAX_GT"


# =============================================================================
# FILM STOCK SYSTEM
# =============================================================================

class FilmStock(str, Enum):
    """Film stock types - only visible when film camera is selected."""
    # 35mm Color Negative - Current (Vision3 series, 2007-present)
    KODAK_VISION3_500T = "Kodak_Vision3_500T_5219"
    KODAK_VISION3_250D = "Kodak_Vision3_250D_5207"
    KODAK_VISION3_200T = "Kodak_Vision3_200T_5213"
    KODAK_VISION3_50D = "Kodak_Vision3_50D_5203"
    
    # 35mm Color Negative - Vision2 series (1998-2007)
    KODAK_VISION2_500T = "Kodak_Vision2_500T_5218"
    KODAK_VISION2_200T = "Kodak_Vision2_200T_5217"
    
    # 35mm Color Negative - Vision series (1996-2002)
    KODAK_VISION_500T = "Kodak_Vision_500T_5279"
    KODAK_VISION_320T = "Kodak_Vision_320T_5277"
    
    # 35mm B&W
    KODAK_DOUBLE_X = "Kodak_Double_X_5222"
    KODAK_TRI_X = "Kodak_Tri_X"
    EASTMAN_DOUBLE_X = "Eastman_Double_X"
    EASTMAN_PLUS_X = "Eastman_Plus_X"  # Classic studio era stock
    
    # Historic Color Stocks (1960s-1990s)
    EASTMAN_5247 = "Eastman_5247"  # EXR 100T (1989)
    EASTMAN_5293 = "Eastman_5293"  # 200T (1983)
    EASTMAN_5294 = "Eastman_5294"  # 400T (1986)
    EASTMAN_5250 = "Eastman_5250"  # EXR 50D (1989)
    EASTMAN_5254 = "Eastman_5254"  # 100T (1974) - Barry Lyndon era
    TECHNICOLOR = "Technicolor"
    KODACHROME = "Kodachrome"
    
    # Fuji Film Stocks (used in Japanese cinema)
    FUJI_ETERNA_500T = "Fuji_Eterna_500T"  # Japanese studio standard
    FUJI_ETERNA_250D = "Fuji_Eterna_250D"
    FUJI_ETERNA_250T = "Fuji_Eterna_250T"
    
    # 65mm/70mm Stocks
    KODAK_65MM_500T = "Kodak_65mm_500T"
    KODAK_65MM_250D = "Kodak_65mm_250D"
    KODAK_65MM_200T = "Kodak_65mm_200T"
    
    # IMAX Stocks
    IMAX_500T = "IMAX_500T"
    IMAX_250D = "IMAX_250D"
    
    # Not applicable (for digital cameras)
    NONE = "None"


# =============================================================================
# ASPECT RATIO SYSTEM
# =============================================================================

class AspectRatio(str, Enum):
    """Aspect ratios - constrained by camera format."""
    # Academy/TV Ratios
    RATIO_1_33 = "1.33:1"  # Academy (4:3)
    RATIO_1_37 = "1.37:1"  # Academy Sound
    RATIO_1_66 = "1.66:1"  # European Widescreen
    RATIO_1_78 = "1.78:1"  # 16:9 HD
    
    # Theatrical Widescreen
    RATIO_1_85 = "1.85:1"  # American Widescreen
    
    # Anamorphic/Wide Ratios
    RATIO_2_20 = "2.20:1"  # 70mm Standard
    RATIO_2_35 = "2.35:1"  # CinemaScope
    RATIO_2_39 = "2.39:1"  # Panavision Scope
    RATIO_2_76 = "2.76:1"  # Ultra Panavision 70 (Ben-Hur)
    
    # IMAX Ratios
    RATIO_1_43 = "1.43:1"  # IMAX 15/70
    RATIO_1_90 = "1.90:1"  # IMAX Laser/Digital


class CameraConfig(BaseModel):
    """Camera selection configuration."""
    camera_type: CameraType = CameraType.DIGITAL
    manufacturer: CameraManufacturer = CameraManufacturer.ARRI
    body: CameraBody = CameraBody.ALEXA_35
    sensor: SensorSize = SensorSize.SUPER35
    weight_class: WeightClass = WeightClass.MEDIUM
    film_stock: FilmStock = FilmStock.NONE
    aspect_ratio: AspectRatio = AspectRatio.RATIO_2_39


# =============================================================================
# LENS SYSTEM
# =============================================================================

class LensManufacturer(str, Enum):
    """Lens manufacturers."""
    ARRI = "ARRI"
    ZEISS = "Zeiss"
    COOKE = "Cooke"
    PANAVISION = "Panavision"
    LEICA = "Leica"
    CANON = "Canon"
    SIGMA = "Sigma"
    ANGENIEUX = "Angenieux"
    SONY = "Sony"
    FUJIFILM = "Fujifilm"
    HAWK = "Hawk"  # Hawk anamorphic lenses
    HASSELBLAD = "Hasselblad"  # Medium format
    TECHNOVISION = "Technovision"  # Italian anamorphic
    # Vintage/Historic studio manufacturers
    BAUSCH_LOMB = "Bausch_Lomb"
    TODD_AO = "Todd_AO"
    KOWA = "Kowa"
    VINTAGE = "Vintage"  # Generic vintage
    WARNER_BROS = "Warner_Bros"  # Classic Hollywood
    PARAMOUNT = "Paramount"  # Classic Hollywood
    PATHE = "Pathe"  # Silent era


class LensFamily(str, Enum):
    """Lens families/series."""
    # ARRI
    ARRI_SIGNATURE_PRIME = "ARRI_Signature_Prime"
    ARRI_MASTER_PRIME = "ARRI_Master_Prime"
    ARRI_ULTRA_PRIME = "ARRI_Ultra_Prime"
    ARRI_PRIME_65 = "ARRI_Prime_65"  # For Alexa 65 (24, 28, 35, 50, 80, 100, 150mm)
    ARRI_PRIME_DNA = "ARRI_Prime_DNA"  # DNA LF lenses with organic character
    
    # Zeiss
    ZEISS_SUPREME_PRIME = "Zeiss_Supreme_Prime"
    ZEISS_MASTER_PRIME = "Zeiss_Master_Prime"
    ZEISS_CP3 = "Zeiss_CP3"
    ZEISS_SUPER_SPEED = "Zeiss_Super_Speed"
    ZEISS_STANDARD_SPEED = "Zeiss_Standard_Speed"  # Classic cine primes
    ZEISS_ULTRA_PRIME = "Zeiss_Ultra_Prime"  # Modern ultra primes
    ZEISS_PLANAR = "Zeiss_Planar"
    
    # Cooke
    COOKE_S7 = "Cooke_S7"
    COOKE_S4 = "Cooke_S4"
    COOKE_ANAMORPHIC = "Cooke_Anamorphic"
    COOKE_PANCHRO = "Cooke_Panchro"
    COOKE_SPEED_PANCHRO = "Cooke_Speed_Panchro"
    
    # Panavision
    PANAVISION_PRIMO = "Panavision_Primo"
    PANAVISION_PRIMO_70 = "Panavision_Primo_70"
    PANAVISION_ANAMORPHIC = "Panavision_Anamorphic"
    PANAVISION_C_SERIES = "Panavision_C_Series"
    PANAVISION_E_SERIES = "Panavision_E_Series"
    PANAVISION_SPHERO = "Panavision_Sphero"
    PANAVISION_ULTRA_SPEED = "Panavision_Ultra_Speed"
    
    # Leica
    LEICA_SUMMILUX = "Leica_Summilux"
    LEICA_SUMMICRON = "Leica_Summicron"
    LEICA_THALIA = "Leica_Thalia"
    
    # Canon
    CANON_SUMIRE = "Canon_Sumire"
    CANON_CN_E = "Canon_CN_E"
    CANON_K35 = "Canon_K35"
    
    # Sony
    SONY_CINEALTA = "Sony_CineAlta"
    
    # Sigma
    SIGMA_CINE = "Sigma_Cine"
    SIGMA_HIGH_SPEED = "Sigma_High_Speed"
    
    # Angenieux
    ANGENIEUX_OPTIMO = "Angenieux_Optimo"
    ANGENIEUX_EZ = "Angenieux_EZ"
    ANGENIEUX_HR = "Angenieux_HR"
    
    # =========================================================================
    # VINTAGE/CLASSIC LENSES
    # =========================================================================
    # Bausch & Lomb
    BAUSCH_LOMB_SUPER_BALTAR = "Bausch_Lomb_Super_Baltar"
    BAUSCH_LOMB_BALTAR = "Bausch_Lomb_Baltar"
    
    # Vintage Zeiss
    ZEISS_PLANAR_F07 = "Zeiss_Planar_f0.7"  # Barry Lyndon
    
    # Todd-AO
    TODD_AO = "Todd_AO"
    
    # Hawk
    HAWK_V_LITE = "Hawk_V_Lite"  # Hawk anamorphic
    HAWK_V_PLUS = "Hawk_V_Plus"
    
    # Hasselblad (Medium/Large Format)
    HASSELBLAD_HC = "Hasselblad_HC"  # H-system lenses (medium format cinema)
    HASSELBLAD_V = "Hasselblad_V"  # V-system (classic Zeiss optics)
    
    # IMAX specific optics
    IMAX_OPTICS = "IMAX_Optics"  # IMAX custom optics
    
    # General Vintage
    VINTAGE_ANAMORPHIC = "Vintage_Anamorphic"
    VINTAGE_SPHERICAL = "Vintage_Spherical"


class LensMountType(str, Enum):
    """Lens mount types for compatibility."""
    PL = "PL"
    LPL = "LPL"
    XPL = "XPL"
    PANAVISION = "Panavision"
    MITCHELL_BNC = "Mitchell_BNC"
    IMAX = "IMAX"


class LensConfig(BaseModel):
    """Lens selection configuration."""
    manufacturer: LensManufacturer = LensManufacturer.ARRI
    family: LensFamily = LensFamily.ARRI_SIGNATURE_PRIME
    focal_length_mm: int = Field(default=50, ge=8, le=1200)
    is_anamorphic: bool = False
    squeeze_ratio: float | None = Field(default=None, description="Anamorphic squeeze (e.g., 2.0)")


# =============================================================================
# CAMERA MOVEMENT
# =============================================================================

class MovementEquipment(str, Enum):
    """Camera movement equipment."""
    STATIC = "Static"
    HANDHELD = "Handheld"
    SHOULDER_RIG = "Shoulder_Rig"
    STEADICAM = "Steadicam"
    GIMBAL = "Gimbal"
    DOLLY = "Dolly"
    DOLLY_TRACK = "Dolly_Track"
    SLIDER = "Slider"
    CRANE = "Crane"
    JIB = "Jib"
    TECHNOCRANE = "Technocrane"
    MOTION_CONTROL = "Motion_Control"
    DRONE = "Drone"
    CABLE_CAM = "Cable_Cam"
    CAR_MOUNT = "Car_Mount"
    SNORRICAM = "SnorriCam"


class MovementType(str, Enum):
    """Types of camera movement."""
    STATIC = "Static"
    PAN = "Pan"
    TILT = "Tilt"
    PAN_TILT = "Pan_Tilt"
    TRACK_IN = "Track_In"       # aka Push In, Dolly In
    TRACK_OUT = "Track_Out"     # aka Pull Out, Dolly Out
    PUSH_IN = "Push_In"
    PULL_BACK = "Pull_Back"
    TRUCK_LEFT = "Truck_Left"   # Lateral movement
    TRUCK_RIGHT = "Truck_Right"
    CRAB = "Crab"               # Lateral tracking
    ARC = "Arc"
    CRANE_UP = "Crane_Up"
    CRANE_DOWN = "Crane_Down"
    BOOM_UP = "Boom_Up"
    BOOM_DOWN = "Boom_Down"
    DOLLY_ZOOM = "Dolly_Zoom"   # Vertigo effect
    PUSH_PULL = "Push_Pull"     # Same as Dolly_Zoom
    ZOOM_IN = "Zoom_In"         # Optical only
    ZOOM_OUT = "Zoom_Out"
    CRASH_ZOOM = "Crash_Zoom"   # Fast zoom
    ROLL = "Roll"               # Dutch roll
    WHIP_PAN = "Whip_Pan"
    WHIP_TILT = "Whip_Tilt"
    FOLLOW = "Follow"
    LEAD = "Lead"
    ORBIT = "Orbit"             # 360° around subject
    REVEAL = "Reveal"
    FLY_THROUGH = "Fly_Through"


class MovementTiming(str, Enum):
    """Speed/timing of camera movement."""
    STATIC = "Static"
    VERY_SLOW = "Very_Slow"
    SLOW = "Slow"
    MODERATE = "Moderate"
    FAST = "Fast"
    WHIP_FAST = "Whip_Fast"


class MovementConfig(BaseModel):
    """Camera movement configuration."""
    equipment: MovementEquipment = MovementEquipment.STATIC
    movement_type: MovementType = MovementType.STATIC
    timing: MovementTiming = MovementTiming.STATIC


# =============================================================================
# LIGHTING SYSTEM
# =============================================================================

class TimeOfDay(str, Enum):
    """Time of day for lighting context."""
    DAWN = "Dawn"
    MORNING = "Morning"
    MIDDAY = "Midday"
    AFTERNOON = "Afternoon"
    GOLDEN_HOUR = "Golden_Hour"
    BLUE_HOUR = "Blue_Hour"
    DUSK = "Dusk"
    NIGHT = "Night"
    MAGIC_HOUR = "Magic_Hour"  # Just after sunset


class LightingSource(str, Enum):
    """Primary lighting sources."""
    # Natural
    SUN = "Sun"
    MOON = "Moon"
    OVERCAST = "Overcast"
    WINDOW = "Window"
    SKYLIGHT = "Skylight"
    
    # Artificial - Modern
    TUNGSTEN = "Tungsten"
    HMI = "HMI"               # 1972+
    LED = "LED"               # 2002 limited, 2012+ widespread
    KINO_FLO = "Kino_Flo"     # 1987+ (fluorescent)
    NEON = "Neon"             # 1927+
    FLUORESCENT = "Fluorescent"
    ARTIFICIAL = "Artificial"
    
    # Artificial - Historic
    CARBON_ARC = "Carbon_Arc"     # 1895-1960s
    MERCURY_VAPOR = "Mercury_Vapor"  # 1903+
    SODIUM_VAPOR = "Sodium_Vapor"    # 1930s+
    
    # Practical
    PRACTICAL = "Practical"
    PRACTICAL_LIGHTS = "Practical_Lights"
    CANDLE = "Candle"
    CANDLELIGHT = "Candlelight"
    FIRELIGHT = "Firelight"
    TELEVISION = "Television"
    COMPUTER_SCREEN = "Computer_Screen"
    CHRISTMAS_LIGHTS = "Christmas_Lights"
    
    # Mixed
    MIXED = "Mixed"
    AVAILABLE = "Available"  # Whatever's there
    AVAILABLE_LIGHT = "Available_Light"


class LightingStyle(str, Enum):
    """Lighting style/technique."""
    HIGH_KEY = "High_Key"
    LOW_KEY = "Low_Key"
    SOFT = "Soft"
    SOFT_LIGHTING = "Soft_Lighting"
    HARD = "Hard"
    HARD_LIGHTING = "Hard_Lighting"
    NATURALISTIC = "Naturalistic"
    EXPRESSIONISTIC = "Expressionistic"
    CHIAROSCURO = "Chiaroscuro"
    REMBRANDT = "Rembrandt"
    SPLIT = "Split"
    RIM = "Rim"
    SILHOUETTE = "Silhouette"
    MOTIVATED = "Motivated"
    PRACTICAL_MOTIVATED = "Practical_Motivated"
    AVAILABLE_LIGHT = "Available_Light"
    HIGH_CONTRAST = "High_Contrast"
    CONTROLLED = "Controlled"
    FLAT = "Flat"
    DRAMATIC = "Dramatic"


class LightingConfig(BaseModel):
    """Lighting configuration."""
    time_of_day: TimeOfDay = TimeOfDay.AFTERNOON
    source: LightingSource = LightingSource.SUN
    style: LightingStyle = LightingStyle.NATURALISTIC


# =============================================================================
# LIVE-ACTION CONFIG (Complete)
# =============================================================================

class LiveActionConfig(BaseModel):
    """Complete Live-Action cinema configuration."""
    camera: CameraConfig = Field(default_factory=CameraConfig)
    lens: LensConfig = Field(default_factory=LensConfig)
    movement: MovementConfig = Field(default_factory=MovementConfig)
    lighting: LightingConfig = Field(default_factory=LightingConfig)
    visual_grammar: VisualGrammar = Field(default_factory=VisualGrammar)
    
    # Film preset (if selected)
    film_preset: str | None = Field(
        default=None,
        description="Film style preset ID (e.g., 'blade_runner', 'casablanca')"
    )
    
    # Era constraint (affects available technology)
    era: str | None = Field(
        default=None,
        description="Time period for historical accuracy (e.g., '1940s', '1970s', 'modern')"
    )
