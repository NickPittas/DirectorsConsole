"""Cinematography Style Information for Film Presets.

Contains detailed technical and artistic cinematography data for each film preset,
sourced from professional cinematography references and research.
"""

from pydantic import BaseModel, Field
from typing import Optional


class CinematographyStyle(BaseModel):
    """Detailed cinematography information for a film preset."""
    
    preset_id: str = Field(description="Links to FilmPreset.id")
    
    # Crew
    cinematographer: str = Field(description="Director of Photography")
    
    # Technical
    camera: str = Field(description="Camera system used")
    film_stock: str = Field(description="Film stock or digital format")
    aspect_ratio: str = Field(description="Aspect ratio (e.g., 2.35:1)")
    
    # Artistic
    lighting_signature: str = Field(description="Signature lighting technique description")
    color_palette: str = Field(description="Color palette and grading approach")
    notable_techniques: str = Field(description="Key visual techniques")
    lens_info: str = Field(description="Lens choices and focal lengths")
    movement_style: str = Field(description="Camera movement approach")
    
    # Legacy
    legacy: Optional[str] = Field(default=None, description="Influence on cinema")


# =============================================================================
# CINEMATOGRAPHY STYLES DATABASE
# =============================================================================

CINEMATOGRAPHY_STYLES: dict[str, CinematographyStyle] = {
    
    # =========================================================================
    # CLASSIC HOLLYWOOD & FILM NOIR
    # =========================================================================
    
    "citizen_kane": CinematographyStyle(
        preset_id="citizen_kane",
        cinematographer="Gregg Toland",
        camera="Mitchell BNC",
        film_stock="35mm Kodak Panatomic-X",
        aspect_ratio="1.37:1 (Academy)",
        lighting_signature="Low-key lighting with deep shadows; pioneering deep focus photography",
        color_palette="Black & White; high contrast development",
        notable_techniques="Deep focus compositing, low-angle shots showing ceilings, lengthy takes",
        lens_info="Wide-angle 25mm, 35mm for deep focus; 50mm, 75mm for close-ups",
        movement_style="Static shots combined with crane movements; smooth transitions",
        legacy="Revolutionized deep focus cinematography; influenced noir and modern filmmaking"
    ),
    
    "casablanca": CinematographyStyle(
        preset_id="casablanca",
        cinematographer="Arthur Edeson, ASC",
        camera="Mitchell BNC",
        film_stock="35mm Eastman Double-X",
        aspect_ratio="1.37:1",
        lighting_signature="Low-key film noir lighting; practical lights within scenes; motivated sources",
        color_palette="Black & White; rich blacks with soft mid-tones",
        notable_techniques="Shadow-and-light contrast, motivated practical lighting, chiaroscuro",
        lens_info="Standard 35mm-50mm range; longer lenses for close-ups",
        movement_style="Predominantly static; occasional tracking shots; smooth pans",
        legacy="Established Hollywood romantic noir visual template"
    ),
    
    "double_indemnity": CinematographyStyle(
        preset_id="double_indemnity",
        cinematographer="John F. Seitz, ASC",
        camera="Mitchell BNC",
        film_stock="35mm Eastman Double-X",
        aspect_ratio="1.37:1",
        lighting_signature="Chiaroscuro lighting; high-contrast noir with hard shadows; minimal fill",
        color_palette="Black & White; deep blacks, bright highlights; expressionist influence",
        notable_techniques="Shadow play, venetian blind lighting effects, expressionist shadows",
        lens_info="35mm-75mm range; low-angle compositions",
        movement_style="Static compositions; controlled camera movements",
        legacy="Codified film noir visual grammar; influenced noir aesthetics globally"
    ),
    
    "the_maltese_falcon": CinematographyStyle(
        preset_id="the_maltese_falcon",
        cinematographer="Arthur Edeson, ASC",
        camera="Mitchell BNC",
        film_stock="35mm Eastman Double-X",
        aspect_ratio="1.37:1",
        lighting_signature="Low-key noir lighting; deep shadows, high contrast; motivated practicals",
        color_palette="Black & White; rich tonal range with dramatic shadows",
        notable_techniques="Shadow modulation, dramatic key lighting, noir chiaroscuro",
        lens_info="35mm-50mm standard range",
        movement_style="Static camera; dramatic lighting-driven compositions",
        legacy="Helped define film noir visual style; template for detective cinema"
    ),
    
    "sunset_boulevard": CinematographyStyle(
        preset_id="sunset_boulevard",
        cinematographer="John F. Seitz, ASC",
        camera="Mitchell BNC",
        film_stock="35mm Eastman Double-X",
        aspect_ratio="1.37:1",
        lighting_signature="Expressionist lighting; heavy shadows, dramatic contrast; 'light sandwich' technique",
        color_palette="Black & White; deep blacks, theatrical lighting style",
        notable_techniques="Deep focus interiors, dramatic backlighting, shadow modulation",
        lens_info="Wide-angle for deep focus; 35mm-50mm for standard shots",
        movement_style="Static compositions; occasional crane movements for dramatic effect",
        legacy="Masterclass in noir lighting; influenced visual storytelling in drama"
    ),
    
    # =========================================================================
    # 1950s INTERNATIONAL CLASSICS
    # =========================================================================
    
    "rashomon": CinematographyStyle(
        preset_id="rashomon",
        cinematographer="Kazuo Miyagawa",
        camera="35mm Standard",
        film_stock="35mm Japanese Fuji/Eastman",
        aspect_ratio="1.37:1",
        lighting_signature="Naturalistic yet stylized; early morning/evening soft natural light",
        color_palette="Black & White; soft, naturalistic tones with subtle shadow gradation",
        notable_techniques="POV shots, unique camera angles, reflection shots using mirrors",
        lens_info="35mm-50mm standard; wide-angle for establishing shots",
        movement_style="Static compositions with deliberate movement; tracking for emphasis",
        legacy="Influenced global cinema; introduced subjective cinematography to Western audiences"
    ),
    
    "seven_samurai": CinematographyStyle(
        preset_id="seven_samurai",
        cinematographer="Asakazu Nakai",
        camera="Mitchell Cameras",
        film_stock="35mm Japanese Fuji",
        aspect_ratio="1.37:1",
        lighting_signature="Natural daylight; 'light sandwich' technique for deep focus",
        color_palette="Black & White; naturalistic with strong contrast",
        notable_techniques="Deep focus compositions; multiple camera coverage for action sequences",
        lens_info="Wide-angle 25mm-35mm for deep focus; 50mm-75mm for close-ups",
        movement_style="Dynamic action coverage; static dramatic moments; telephoto compression",
        legacy="Set standard for epic action cinematography"
    ),
    
    "vertigo": CinematographyStyle(
        preset_id="vertigo",
        cinematographer="Robert Burks, ASC",
        camera="Technicolor Mitchell",
        film_stock="35mm Technicolor",
        aspect_ratio="2.35:1 (CinemaScope)",
        lighting_signature="High-key for daytime; low-key for interiors; dramatic color shifts",
        color_palette="Technicolor; rich, saturated colors; green-teal in dream sequences",
        notable_techniques="The 'Vertigo Effect' (dolly zoom); 360-degree turns; color symbolism",
        lens_info="18mm-100mm range including anamorphic lenses",
        movement_style="Smooth dolly movements; the famous dolly zoom; static for tension",
        legacy="The vertigo effect named after this film; revolutionized camera movement"
    ),
    
    "the_seventh_seal": CinematographyStyle(
        preset_id="the_seventh_seal",
        cinematographer="Sven Nykvist",
        camera="35mm Standard",
        film_stock="35mm Eastman/Ilford",
        aspect_ratio="1.37:1",
        lighting_signature="Naturalistic lighting; available light exploitation; soft diffused outdoor",
        color_palette="Black & White; soft, natural tonality; minimalist approach",
        notable_techniques="Long takes; natural light philosophy; minimalist composition",
        lens_info="35mm-50mm standard; wide-angle for environmental shots",
        movement_style="Predominantly static; minimal camera movement for contemplative pacing",
        legacy="Established naturalism in black & white; influenced art cinema globally"
    ),
    
    # =========================================================================
    # 1960s NEW WAVES
    # =========================================================================
    
    "2001_a_space_odyssey": CinematographyStyle(
        preset_id="2001_a_space_odyssey",
        cinematographer="Geoffrey Unsworth / John Alcott",
        camera="Super Panavision 70 (65mm)",
        film_stock="65mm Eastmancolor",
        aspect_ratio="2.20:1 (65mm)",
        lighting_signature="Natural light for space; controlled studio lighting; minimalist approach",
        color_palette="Eastmancolor; cool, naturalistic palette; stark contrast earth/space",
        notable_techniques="Slit-scan photography (Stargate); front projection; effects innovations",
        lens_info="Panavision Ultra Panatar 35mm, 50mm, 75mm anamorphic",
        movement_style="Static space sequences; slow, deliberate movements; tracking shots",
        legacy="Revolutionized special effects; pioneered large-format cinematography"
    ),
    
    "breathless": CinematographyStyle(
        preset_id="breathless",
        cinematographer="Raoul Coutard",
        camera="Éclair Cameflex",
        film_stock="35mm Ilford HPS",
        aspect_ratio="1.37:1",
        lighting_signature="Available light; naturalistic; minimal artificial augmentation",
        color_palette="Black & White; grainy, documentary feel; high contrast",
        notable_techniques="Jump cuts; handheld camera; guerrilla filmmaking; location shooting",
        lens_info="18mm-50mm range; wide-angle for mobility",
        movement_style="Handheld throughout; documentary style; energetic movement",
        legacy="Defined French New Wave aesthetic; revolutionized editing"
    ),
    
    "jules_et_jim": CinematographyStyle(
        preset_id="jules_et_jim",
        cinematographer="Raoul Coutard",
        camera="Éclair Cameflex",
        film_stock="35mm Franscope",
        aspect_ratio="2.35:1",
        lighting_signature="Natural light; soft, romantic; period-appropriate",
        color_palette="Black & White; soft, romantic tones; nostalgic quality",
        notable_techniques="Freeze frames; iris shots; newsreel footage integration",
        lens_info="Standard to telephoto range; anamorphic widescreen",
        movement_style="Dynamic tracking shots; freeze frames; playful movement",
        legacy="Expanded New Wave visual vocabulary; influenced romantic cinema"
    ),
    
    "persona": CinematographyStyle(
        preset_id="persona",
        cinematographer="Sven Nykvist",
        camera="35mm Standard",
        film_stock="35mm Eastman",
        aspect_ratio="1.37:1",
        lighting_signature="High contrast; stark, minimalist; psychological use of shadow",
        color_palette="Black & White; high contrast; stark whites and deep blacks",
        notable_techniques="Extreme close-ups; face merging compositions; surreal imagery",
        lens_info="Standard to telephoto for intense close-ups",
        movement_style="Static, contemplative; minimal movement amplifies tension",
        legacy="Masterclass in psychological cinematography; influenced art cinema"
    ),
    
    "la_dolce_vita": CinematographyStyle(
        preset_id="la_dolce_vita",
        cinematographer="Otello Martelli",
        camera="35mm Standard",
        film_stock="35mm Eastman",
        aspect_ratio="2.35:1 (Totalscope)",
        lighting_signature="Expressive nighttime lighting; practical lights; baroque quality",
        color_palette="Black & White; rich, luxurious tones; high contrast",
        notable_techniques="Widescreen compositions; elaborate set pieces; night exteriors",
        lens_info="Anamorphic widescreen lenses; varied focal lengths",
        movement_style="Fluid camera movements; elaborate tracking shots; crane work",
        legacy="Defined Italian cinematic glamour; influenced fashion photography"
    ),
    
    # =========================================================================
    # 1970s AMERICAN NEW WAVE
    # =========================================================================
    
    "the_godfather": CinematographyStyle(
        preset_id="the_godfather",
        cinematographer="Gordon Willis, ASC",
        camera="Panavision Panaflex Silent Reflex (PSR)",
        film_stock="35mm Eastmancolor 5254",
        aspect_ratio="2.35:1",
        lighting_signature="Low-key lighting; underexposed film; twilight shooting; chiaroscuro",
        color_palette="Desaturated, muted colors; brown-orange sepia tones; shadow-dominant",
        notable_techniques="Twilight zone photography; available light; dramatic shadow modulation",
        lens_info="Panavision Super Speed 40mm, 50mm, 75mm",
        movement_style="Static compositions; minimal movement; slow, deliberate pans",
        legacy="'Prince of Darkness' aesthetic; defined visual style for crime drama"
    ),
    
    "taxi_driver": CinematographyStyle(
        preset_id="taxi_driver",
        cinematographer="Michael Chapman",
        camera="Arriflex 35BL",
        film_stock="35mm Eastmancolor 5254",
        aspect_ratio="1.85:1",
        lighting_signature="Naturalistic nighttime lighting; practical city lights; available light",
        color_palette="Desaturated, gritty; warm yellows and cool blues; documentary feel",
        notable_techniques="Steadicam movement; night photography innovations; guerrilla coverage",
        lens_info="18mm, 25mm, 35mm, 50mm; wide-angle for NYC atmosphere",
        movement_style="Steadicam for immersive following shots; static confrontational shots",
        legacy="Revolutionized urban cinematography; influenced gritty realism"
    ),
    
    "apocalypse_now": CinematographyStyle(
        preset_id="apocalypse_now",
        cinematographer="Vittorio Storaro, ASC, AIC",
        camera="Panavision Panaflex / Arriflex 35BL",
        film_stock="35mm Eastmancolor 5385 (high-speed)",
        aspect_ratio="2.35:1",
        lighting_signature="Low-key jungle lighting; practical flares; helicopter light; expressionist",
        color_palette="Warm, saturated reds/oranges (napalm); cool blues (river); yellow haze",
        notable_techniques="Helicopter-based lighting; practical fire effects; mixed temperatures",
        lens_info="Wide-angle 18mm-25mm for jungle; 35mm-50mm for character work",
        movement_style="Steadicam following shots; helicopter aerials; static confrontations",
        legacy="Masterclass in color and light; influenced war and psychedelic cinema"
    ),
    
    "chinatown": CinematographyStyle(
        preset_id="chinatown",
        cinematographer="John A. Alonzo, ASC",
        camera="Panavision Panaflex",
        film_stock="35mm Eastman 100T 5254",
        aspect_ratio="2.35:1",
        lighting_signature="Naturalistic daylight; available light approach; minimal augmentation",
        color_palette="Warm, golden-hour palette; Technicolor richness; subtle desaturation",
        notable_techniques="Available light photography; practical water reflections; period accuracy",
        lens_info="Panavision anamorphic 40mm, 50mm, 75mm",
        movement_style="Static compositions; minimal movement; classic Hollywood style",
        legacy="Merged noir aesthetics with 70s realism; influential water imagery"
    ),
    
    "barry_lyndon": CinematographyStyle(
        preset_id="barry_lyndon",
        cinematographer="John Alcott, BSC",
        camera="Mitchell BNC / Arriflex 35BL",
        film_stock="35mm Eastmancolor",
        aspect_ratio="1.66:1",
        lighting_signature="Natural candlelight; NASA f/0.7 lenses; no artificial light for interiors",
        color_palette="Painterly; Old Master aesthetic; soft, natural colors",
        notable_techniques="Candlelit scenes with Zeiss f/0.7 lenses; reverse zoom reveals",
        lens_info="Zeiss f/0.7 50mm (NASA lens); standard Zeiss for exteriors",
        movement_style="Slow reverse zooms; static tableaux; painterly compositions",
        legacy="Pioneered available-light cinematography; influenced period dramas"
    ),
    
    "a_clockwork_orange": CinematographyStyle(
        preset_id="a_clockwork_orange",
        cinematographer="John Alcott, BSC",
        camera="Arriflex 35BL",
        film_stock="35mm Eastmancolor",
        aspect_ratio="1.66:1",
        lighting_signature="Stylized; wide-angle distortion; practical lighting; futuristic aesthetic",
        color_palette="Saturated, garish colors; high contrast; pop art influence",
        notable_techniques="Wide-angle distortion; Steadicam precursor handheld; slow motion",
        lens_info="Wide-angle 18mm, 24mm; extreme distortion for effect",
        movement_style="Dynamic handheld; Steadicam-like smoothness; aggressive movement",
        legacy="Defined dystopian visual style; influenced music videos and advertising"
    ),
    
    "alien": CinematographyStyle(
        preset_id="alien",
        cinematographer="Derek Vanlint",
        camera="Panavision Panaflex",
        film_stock="35mm Eastmancolor 5247",
        aspect_ratio="2.35:1",
        lighting_signature="Low-key; atmospheric haze; practical ship lighting; claustrophobic",
        color_palette="Cold blues and greens; industrial gray; limited warm tones",
        notable_techniques="Smoke/haze for atmosphere; practical lighting; confined space shots",
        lens_info="Panavision anamorphic; wide for ship interiors",
        movement_style="Slow, deliberate; prowling camera; static for tension",
        legacy="Defined sci-fi horror aesthetic; influenced industrial design in cinema"
    ),
    
    "stalker": CinematographyStyle(
        preset_id="stalker",
        cinematographer="Alexander Knyazhinsky",
        camera="35mm Standard",
        film_stock="35mm Kodak/Svema",
        aspect_ratio="1.37:1",
        lighting_signature="Sepia/monochrome for reality; color for Zone; natural light",
        color_palette="Sepia tones for outside; lush greens/color for Zone; symbolic use",
        notable_techniques="Long takes up to 7 minutes; natural phenomena; water imagery",
        lens_info="Standard lenses; minimal distortion",
        movement_style="Long, slow tracking shots; contemplative pacing; water dolly",
        legacy="Influenced philosophical/art cinema; pioneered color symbolism"
    ),
    
    # =========================================================================
    # 1980s STYLIZATION
    # =========================================================================
    
    "blade_runner": CinematographyStyle(
        preset_id="blade_runner",
        cinematographer="Jordan Cronenweth, ASC",
        camera="Panavision Panaflex Platinum",
        film_stock="35mm Eastmancolor 5248/5293",
        aspect_ratio="2.39:1",
        lighting_signature="High contrast noir; extensive practical neon; hard shadows; smoke shafts",
        color_palette="Desaturated with neon accents; orange/teal; cool blue shadows, warm highlights",
        notable_techniques="Forced perspective; miniatures; rear-projection; smoke for light shafts",
        lens_info="Panavision Super Speed 18mm, 25mm, 35mm, 50mm; anamorphic",
        movement_style="Static noir compositions; slow deliberate movements; minimal motion",
        legacy="Defined cyberpunk aesthetic; revolutionized color grading and neon-lit cinema"
    ),
    
    "blue_velvet": CinematographyStyle(
        preset_id="blue_velvet",
        cinematographer="Frederick Elmes",
        camera="Arriflex 35BL",
        film_stock="35mm Eastmancolor",
        aspect_ratio="2.35:1",
        lighting_signature="Expressionist; heavy use of colored gels; surreal contrast",
        color_palette="Deep blues, rich reds; saturated suburban colors vs dark underworld",
        notable_techniques="Macro close-ups (ear, insects); surreal transitions; velvet textures",
        lens_info="Macro lenses for extreme close-ups; standard anamorphic",
        movement_style="Slow, dreamlike movement; voyeuristic static shots",
        legacy="Defined Lynchian surrealist aesthetic"
    ),
    
    "brazil": CinematographyStyle(
        preset_id="brazil",
        cinematographer="Roger Pratt, BSC",
        camera="Panavision Panaflex",
        film_stock="35mm Eastmancolor",
        aspect_ratio="1.85:1",
        lighting_signature="Industrial fluorescent; office-harsh lighting; dream sequence fantasy",
        color_palette="Drab grays and browns for reality; golden for dreams",
        notable_techniques="Wide-angle distortion; retro-futuristic design; miniatures",
        lens_info="Wide-angle for distortion; fish-eye for dream sequences",
        movement_style="Dynamic for action; static bureaucratic compositions",
        legacy="Defined retrofuturist visual style; influenced dystopian design"
    ),
    
    "come_and_see": CinematographyStyle(
        preset_id="come_and_see",
        cinematographer="Aleksei Rodionov",
        camera="35mm Standard / Steadicam",
        film_stock="35mm Svema",
        aspect_ratio="1.37:1",
        lighting_signature="Naturalistic; available light; harsh sunlight; smoke-diffused",
        color_palette="Desaturated earth tones; increasing gray as film progresses",
        notable_techniques="Steadicam following protagonist; hypnotic close-ups; live ammunition",
        lens_info="Wide-angle for immersion; standard for faces",
        movement_style="Steadicam following; relentless forward movement; subjective POV",
        legacy="Influenced immersive war cinema; documentary-fiction hybrid"
    ),
    
    # =========================================================================
    # 1990s GENRE REINVENTION
    # =========================================================================
    
    "pulp_fiction": CinematographyStyle(
        preset_id="pulp_fiction",
        cinematographer="Andrzej Sekuła",
        camera="Arriflex 35-III / Panavision Panaflex",
        film_stock="Kodak Eastman EXR 50D 5245",
        aspect_ratio="2.35:1 (anamorphic)",
        lighting_signature="Low, wide angles; effective Steadicam; stylized dramatic lighting",
        color_palette="Aged Technicolor aesthetic; creamy highlights; burnt-out rockabilly look",
        notable_techniques="Pop Art quality; richly hued, pin-sharp images; wide-angle close-ups",
        lens_info="Panavision C-Series and E-Series anamorphic",
        movement_style="Steadicam for fluid transitions; calculated movements reinforcing rhythm",
        legacy="Revitalized indie cinematography; influenced dialogue-driven films"
    ),
    
    "the_shawshank_redemption": CinematographyStyle(
        preset_id="the_shawshank_redemption",
        cinematographer="Roger Deakins, ASC, BSC",
        camera="Arriflex 35 BL4S / Moviecam Compact",
        film_stock="Kodak Eastman EXR 100T 5248, 200T 5293",
        aspect_ratio="1.85:1",
        lighting_signature="Heightened naturalism; soft directional light; cool gray palette evolving to warmth",
        color_palette="Cool grays and blues for prison; warmer tones emerging with hope and freedom",
        notable_techniques="Light/dark progression symbolizing emotional journey; naturalistic environments",
        lens_info="Zeiss Standard Speed and Super Speed lenses",
        movement_style="Classical, restrained; purposeful moves supporting narrative arc",
        legacy="Established Deakins as master of naturalistic prison photography"
    ),
    
    "schindlers_list": CinematographyStyle(
        preset_id="schindlers_list",
        cinematographer="Janusz Kamiński, ASC",
        camera="Arriflex 35-III / Arriflex 535",
        film_stock="Kodak Eastman Double-X 5222 B&W",
        aspect_ratio="1.85:1",
        lighting_signature="High-contrast low-key; naturalistic; silhouettes and rim lighting; documentary feel",
        color_palette="Black and white; red dress as sole color element",
        notable_techniques="40% handheld for chaos; black-and-white negative; selective color",
        lens_info="Zeiss Standard/Super Speed; 29mm for realistic close-ups",
        movement_style="Handheld for terror; tripod/dolly for isolation scenes; raw documentary",
        legacy="Redefined historical drama cinematography; influenced documentary style"
    ),
    
    "la_haine": CinematographyStyle(
        preset_id="la_haine",
        cinematographer="Pierre Aïm",
        camera="Arriflex 35BL",
        film_stock="35mm Kodak B&W",
        aspect_ratio="1.85:1",
        lighting_signature="Available light; harsh fluorescent; urban night lighting",
        color_palette="High contrast black and white; gritty urban aesthetic",
        notable_techniques="Long tracking shots; mirror shots; real locations",
        lens_info="Standard to wide-angle for urban environments",
        movement_style="Long Steadicam takes; dynamic tracking; guerrilla style",
        legacy="Defined French banlieue cinema aesthetic"
    ),
    
    "heat": CinematographyStyle(
        preset_id="heat",
        cinematographer="Dante Spinotti, ASC, AIC",
        camera="Panavision Panaflex",
        film_stock="35mm Eastmancolor",
        aspect_ratio="2.35:1",
        lighting_signature="Cool urban nightscapes; practical city lights; realistic interiors",
        color_palette="Cool blues and grays; Los Angeles nighttime aesthetic; minimal warmth",
        notable_techniques="Widescreen architecture; long-lens compression; realistic gunfight coverage",
        lens_info="Panavision Primo anamorphic; telephoto for compression",
        movement_style="Controlled Steadicam; static for tension; dynamic for heist",
        legacy="Set standard for modern crime film photography; influenced heist genre"
    ),
    
    "the_matrix": CinematographyStyle(
        preset_id="the_matrix",
        cinematographer="Bill Pope, ASC",
        camera="Panavision Panaflex Platinum / Pan-Arri 435",
        film_stock="Kodak Vision 500T 5279 (interiors), 200T 5274 (exteriors)",
        aspect_ratio="2.35:1 (Super 35)",
        lighting_signature="Sickly green tint for Matrix (decaying digital); cool blue for reality",
        color_palette="Green hues for Matrix; blue/cold for Zion; metaphorical color coding",
        notable_techniques="Bullet time effects (300fps); extensive Pyrex practical lights; 360° moves",
        lens_info="Panavision Primo Prime spherical lenses",
        movement_style="Dynamic action choreography; frozen-time techniques; fluid combat",
        legacy="Bullet time became industry standard; influenced action cinematography"
    ),
    
    "eyes_wide_shut": CinematographyStyle(
        preset_id="eyes_wide_shut",
        cinematographer="Larry Smith",
        camera="Arriflex 535B",
        film_stock="35mm Eastmancolor",
        aspect_ratio="1.85:1",
        lighting_signature="Christmas lights as practicals; warm tungsten; dreamlike soft glow",
        color_palette="Warm amber and gold; Christmas reds and greens; sensual warmth",
        notable_techniques="Practical Christmas light bokeh; long Steadicam takes; soft filtration",
        lens_info="Zeiss Super Speed; wide apertures for soft focus",
        movement_style="Slow, hypnotic Steadicam; following protagonist through spaces",
        legacy="Pioneered practical light cinematography; influenced dreamlike aesthetics"
    ),
    
    # =========================================================================
    # 2000s-2010s MODERN MASTERS
    # =========================================================================
    
    "in_the_mood_for_love": CinematographyStyle(
        preset_id="in_the_mood_for_love",
        cinematographer="Christopher Doyle / Mark Lee Ping-Bin",
        camera="Arriflex 35 BL4 / Arriflex 535",
        film_stock="Kodak Vision 500T 5279, 800T 5289",
        aspect_ratio="1.66:1",
        lighting_signature="Undiffused hard light creating shadows; low-key symbolizing emptiness",
        color_palette="Bold, saturated colors; film noir influences; restrained elegance",
        notable_techniques="Jazz-like spontaneity; tight framing; reflections; confined spaces",
        lens_info="Zeiss Super Speed; minimal filtration",
        movement_style="Minimalistic; mostly static with slow pans; handheld for emotional peaks",
        legacy="Defined modern Asian romantic visual language"
    ),
    
    "mulholland_drive": CinematographyStyle(
        preset_id="mulholland_drive",
        cinematographer="Peter Deming, ASC",
        camera="Panavision Panaflex Platinum",
        film_stock="35mm film",
        aspect_ratio="1.85:1",
        lighting_signature="Hard light and high contrast; artificial emphasis; neo-noir with dreamy soft quality",
        color_palette="Dual nature: dreamy soft Hollywood look combined with dark neo-noir",
        notable_techniques="Kodachrome-based LUT for 50s scenes; lens softening on rear element",
        lens_info="Panavision Primo Primes (spherical)",
        movement_style="Deliberate, mysterious; adapting to emotional direction",
        legacy="Defined modern surrealist neo-noir aesthetic"
    ),
    
    "children_of_men": CinematographyStyle(
        preset_id="children_of_men",
        cinematographer="Emmanuel Lubezki, ASC, AMC",
        camera="Arricam LT / Arriflex 235",
        film_stock="Kodak Vision2 Expression 500T 5229",
        aspect_ratio="1.85:1",
        lighting_signature="Naturalistic available light; minimal traditional film lighting; soft diffused interiors",
        color_palette="Muted, desaturated; bleak hopeless world; rare warm tones for hope",
        notable_techniques="Almost entirely handheld; long unbroken takes up to 8 minutes; car rig",
        lens_info="Zeiss Master Prime (sharpness, minimal distortion)",
        movement_style="Reporter-like objectivity; dynamic tracking; embracing 'accidents'",
        legacy="Pioneered long-take immersive cinematography; influenced action direction"
    ),
    
    "no_country_for_old_men": CinematographyStyle(
        preset_id="no_country_for_old_men",
        cinematographer="Roger Deakins, ASC, BSC",
        camera="Arricam LT / Arriflex 535B",
        film_stock="Kodak Vision2 100T 5212, 200T 5217, 500T 5218",
        aspect_ratio="2.39:1 (Super 35)",
        lighting_signature="Naturalistic lighting; shadows and contrast for tension; practical lamps",
        color_palette="Earthy, dusty tones; noir-influenced; deep shadows; minimalist",
        notable_techniques="'Matter of fact' visual approach; extensive location scouting",
        lens_info="Cooke S4, Zeiss Master Prime, Arri Macro lenses",
        movement_style="Static shots building tension; deliberate tracking for motel sequences",
        legacy="Masterclass in understated cinematography; influenced Coen visual style"
    ),
    
    "the_dark_knight": CinematographyStyle(
        preset_id="the_dark_knight",
        cinematographer="Wally Pfister, ASC",
        camera="IMAX MSM 9802 (65mm) / 35mm anamorphic",
        film_stock="IMAX 65mm / 35mm film",
        aspect_ratio="2.40:1 (35mm) / 1.43:1 (IMAX)",
        lighting_signature="Grounded, realistic urban; natural lighting with textures; sodium lights",
        color_palette="Dark, gritty urban; orange sodium vapor vs cool night skies",
        notable_techniques="First major film with ~28 minutes native IMAX; 8K scan; no DI",
        lens_info="Hasselblad for IMAX (50mm, 80mm preferred); Panavision anamorphic for 35mm",
        movement_style="Dynamic IMAX action; giant-format/standard integration",
        legacy="Pioneered IMAX for narrative filmmaking; influenced superhero cinematography"
    ),
    
    "enter_the_void": CinematographyStyle(
        preset_id="enter_the_void",
        cinematographer="Benoît Debie, SBC",
        camera="Custom rigs / Arriflex",
        film_stock="35mm / Digital hybrid",
        aspect_ratio="2.35:1",
        lighting_signature="Neon-drenched Tokyo nightlife; DMT-inspired color; practical neon",
        color_palette="Saturated neons; psychedelic color shifts; Tokyo nightscape",
        notable_techniques="First-person POV; floating camera; blink cuts; DMT trip sequences",
        lens_info="Wide-angle for immersion; custom snorkel lens for POV",
        movement_style="Floating, incorporeal camera movement; continuous POV",
        legacy="Pioneered first-person cinematography; influenced psychedelic visual style"
    ),
    
    "the_tree_of_life": CinematographyStyle(
        preset_id="the_tree_of_life",
        cinematographer="Emmanuel Lubezki, ASC, AMC",
        camera="Arricam LT/ST / Arriflex 235/435 / IMAX / Panavision 65 HR",
        film_stock="Kodak Vision2 200T 5217, 500T 5218 (35mm), 65mm",
        aspect_ratio="1.85:1",
        lighting_signature="95% natural light; available light philosophy; sun, wind, rain; backlight",
        color_palette="Naturalistic, organic tones; 'honest' color range; cosmic imagery",
        notable_techniques="'Dogma' constraints: no artificial light, deep focus, crosslight only",
        lens_info="Zeiss Master Prime, Ultra Prime, Panavision System 65",
        movement_style="Handheld for intimate moments; Steadicam with Z-axis; documentary observation",
        legacy="Masterclass in natural light; influenced spiritual/memory cinema"
    ),
    
    "her": CinematographyStyle(
        preset_id="her",
        cinematographer="Hoyte Van Hoytema, ASC, FSF, NSC",
        camera="ARRI Alexa Studio / Alexa XT",
        film_stock="Digital (Codex/ARRIRAW)",
        aspect_ratio="1.85:1",
        lighting_signature="Minimal lighting; small LEDs for ambience; eliminated typical sci-fi cool tones",
        color_palette="Warmer tones: reds, yellows, greens (avoiding blue); pastel; romantic, dreamy",
        notable_techniques="Eliminated blue palette to avoid sci-fi clichés; vintage lens flares",
        lens_info="Cooke Speed Panchro, Canon K35, Zeiss Super Speed, vintage Canon zooms",
        movement_style="Intimate, close framing; following emotional beats; breaking 180-degree rule",
        legacy="Redefined sci-fi visual language; influenced warm futurism aesthetic"
    ),
    
    "the_grand_budapest_hotel": CinematographyStyle(
        preset_id="the_grand_budapest_hotel",
        cinematographer="Robert D. Yeoman, ASC",
        camera="Arricam Studio (ST)",
        film_stock="Kodak Vision3 200T 5213",
        aspect_ratio="1.37:1 (1930s) / 2.40:1 (1960s) / 1.85:1 (1980s)",
        lighting_signature="Lubitsch-inspired for 1930s; period-authentic per format",
        color_palette="Rich, vibrant Wes Anderson palette; heavily refined in DI; pastels",
        notable_techniques="Three aspect ratios for time periods; extensive color testing; miniatures",
        lens_info="Cooke S4, Varotal, Angenieux Optimo, Technovision/Cooke anamorphic zooms",
        movement_style="Precision one-point perspective; centered framing; frequent whip pans",
        legacy="Perfected Wes Anderson visual language; influenced symmetrical composition"
    ),
    
    "mad_max_fury_road": CinematographyStyle(
        preset_id="mad_max_fury_road",
        cinematographer="John Seale, ASC, ACS",
        camera="ARRI Alexa Plus / Alexa M",
        film_stock="Digital (ARRIRAW)",
        aspect_ratio="2.39:1",
        lighting_signature="Scorched, saturated look (avoiding post-apocalyptic grays); day-for-night",
        color_palette="Saturated desert tones; high contrast; intentionally degraded footage",
        notable_techniques="Day-for-night by overexposing 2 stops; extensive crash cams",
        lens_info="Predominantly zooms; custom 15mm/16mm primes for War Rig interiors",
        movement_style="'Edge' crane for 360° action; 6-10 cameras simultaneously; center-framed",
        legacy="Reinvented action cinematography; influenced practical effects movement"
    ),
    
    "moonlight": CinematographyStyle(
        preset_id="moonlight",
        cinematographer="James Laxton",
        camera="ARRI Alexa XT",
        film_stock="Digital (ProRes 444)",
        aspect_ratio="2.39:1 (anamorphic)",
        lighting_signature="RGB LED lamps for color control; LiteGear Lite Mats; warm skin tones",
        color_palette="Three acts emulate stocks: Fuji (warm Act 1), Agfa (cyan Act 2), Kodak (rich Act 3)",
        notable_techniques="Film stock emulation per chapter; one-camera production; close eyeline",
        lens_info="Hawk V-Lite anamorphic, Kowa anamorphic, Angénieux anamorphic zooms",
        movement_style="Intimate, close to actors; 98% operated by Laxton; widescreen emotional amp",
        legacy="Pioneered digital film stock emulation; influenced intimate drama photography"
    ),
    
    "roma": CinematographyStyle(
        preset_id="roma",
        cinematographer="Alfonso Cuarón",
        camera="ARRI Alexa 65",
        film_stock="Digital (ARRI Prime 65)",
        aspect_ratio="2.39:1",
        lighting_signature="Naturalistic window light; wide-angle lighting challenges; Zone System approach",
        color_palette="Pristine digital black-and-white; high dynamic range; soft naturalism",
        notable_techniques="B&W acquired digitally; 6.5K for 4K finish; multiple exposures for deep focus",
        lens_info="ARRI Prime 65 (24, 28, 35, 50, 80, 100, 150mm); preference for wider",
        movement_style="X-axis (parallel) composition; fluid long takes; slow, inconspicuous pans",
        legacy="Elevated digital black-and-white; influenced personal memoir cinema"
    ),
    
    "the_lighthouse": CinematographyStyle(
        preset_id="the_lighthouse",
        cinematographer="Jarin Blaschke, ASC",
        camera="Panavision Millennium XL2",
        film_stock="Kodak Eastman Double-X 5222 B&W (pulled to 160 ASA)",
        aspect_ratio="1.19:1 (near-square, inspired by Fritz Lang)",
        lighting_signature="High output (15-20x typical); bright halogen close to actors; elemental",
        color_palette="Orthochromatic-inspired B&W; custom Schneider filters; dark skin, bright skies",
        notable_techniques="Custom orthochromatic filter for 1920s emulation; vintage 1930s Baltar lenses",
        lens_info="Bausch & Lomb Baltar (1930s vintage), one 1905 lens for distortion",
        movement_style="Confined, vertical compositions; restricted space; claustrophobic",
        legacy="Revived orthochromatic aesthetic; influenced period horror photography"
    ),
    
    "parasite": CinematographyStyle(
        preset_id="parasite",
        cinematographer="Hong Kyung-pyo",
        camera="ARRI Alexa 65",
        film_stock="Digital (ARRI Raw, Prime DNA lenses)",
        aspect_ratio="2.39:1",
        lighting_signature="Sophisticated indirect for rich house; greenish fluorescent for semi-basement",
        color_palette="Strong teal/orange; warm tungsten for wealthy; cold green for poverty",
        notable_techniques="ARRI SkyPanel extensively; 97% on-set lighting; class contrast through light",
        lens_info="ARRI Prime DNA; large format for wide shots without distortion",
        movement_style="Wide, encompassing compositions; fluid movement connecting spaces",
        legacy="Masterclass in class-based visual storytelling; influenced social drama"
    ),
    
    # =========================================================================
    # REMAINING FILMS - ADDITIONAL DATA
    # =========================================================================
    
    "harakiri": CinematographyStyle(
        preset_id="harakiri",
        cinematographer="Yoshio Miyajima",
        camera="35mm Standard",
        film_stock="35mm Tohoscope",
        aspect_ratio="2.35:1",
        lighting_signature="Naturalistic; stark contrast; traditional Japanese aesthetics",
        color_palette="Black & White; high contrast; minimalist",
        notable_techniques="Static compositions; tableaux staging; formal framing",
        lens_info="Anamorphic widescreen lenses",
        movement_style="Deliberate, controlled; static for tension; slow reveals",
        legacy="Influenced samurai cinema aesthetics"
    ),
    
    "battle_of_algiers": CinematographyStyle(
        preset_id="battle_of_algiers",
        cinematographer="Marcello Gatti",
        camera="Arriflex 35",
        film_stock="35mm Ferrania P30",
        aspect_ratio="1.37:1",
        lighting_signature="Documentary-style; available light; newsreel aesthetic",
        color_palette="Black & White; grainy, newsreel quality",
        notable_techniques="Handheld documentary style; non-actors; location shooting",
        lens_info="Standard documentary lenses; mobility-focused",
        movement_style="Handheld; frenetic for action; observational",
        legacy="Defined political documentary-fiction hybrid; influenced war cinema"
    ),
    
    "the_french_connection": CinematographyStyle(
        preset_id="the_french_connection",
        cinematographer="Owen Roizman, ASC",
        camera="Arriflex 35BL",
        film_stock="35mm Eastmancolor",
        aspect_ratio="1.85:1",
        lighting_signature="Available light; gritty urban; naturalistic New York",
        color_palette="Desaturated; cold, wintry New York; documentary feel",
        notable_techniques="Groundbreaking car chase; documentary style; real locations",
        lens_info="Zoom lenses for flexibility; standard range",
        movement_style="Handheld; guerrilla style; chase sequence innovation",
        legacy="Revolutionized car chase cinematography; defined 70s grit"
    ),
    
    "one_flew_over_cuckoos_nest": CinematographyStyle(
        preset_id="one_flew_over_cuckoos_nest",
        cinematographer="Haskell Wexler, ASC / Bill Butler, ASC",
        camera="Panavision Panaflex",
        film_stock="35mm Eastmancolor",
        aspect_ratio="1.85:1",
        lighting_signature="Institutional fluorescent; naturalistic; available light",
        color_palette="Muted institutional colors; clinical, oppressive",
        notable_techniques="Real mental hospital location; natural performances; long takes",
        lens_info="Standard range; naturalistic approach",
        movement_style="Observational; following actors; documentary influence",
        legacy="Influenced institutional drama photography"
    ),
    
    "star_wars_anh": CinematographyStyle(
        preset_id="star_wars_anh",
        cinematographer="Gilbert Taylor, BSC",
        camera="Panavision Panaflex",
        film_stock="35mm Eastmancolor",
        aspect_ratio="2.35:1",
        lighting_signature="High-key for heroes; expressionist for villains; practical lighting",
        color_palette="Saturated primary colors; good vs evil contrast; golden desert",
        notable_techniques="Practical effects; motion control; optical compositing",
        lens_info="Panavision anamorphic; varied focal lengths",
        movement_style="Dynamic action; dolly and crane; space opera scale",
        legacy="Defined modern blockbuster visual language"
    ),
    
    "oldboy": CinematographyStyle(
        preset_id="oldboy",
        cinematographer="Chung Chung-hoon",
        camera="35mm Standard",
        film_stock="35mm Fuji/Kodak",
        aspect_ratio="2.35:1",
        lighting_signature="Stylized; neon-lit corridors; expressionist contrast",
        color_palette="Green-tinted; sickly fluorescent; high contrast",
        notable_techniques="Single-take corridor fight; virtuoso long takes; visual puzzles",
        lens_info="Anamorphic widescreen; varied for effect",
        movement_style="Side-scrolling for corridor fight; dynamic and static contrast",
        legacy="Influenced Korean revenge cinema aesthetic"
    ),
    
    "requiem_for_a_dream": CinematographyStyle(
        preset_id="requiem_for_a_dream",
        cinematographer="Matthew Libatique, ASC",
        camera="Arriflex 435 / Super 16mm",
        film_stock="35mm / Super 16mm Kodak",
        aspect_ratio="1.85:1",
        lighting_signature="Harsh; overexposed for highs; dark for lows; clinical for hospital",
        color_palette="Saturated for euphoria; desaturated for despair; seasonal progression",
        notable_techniques="Snorricam body-mount; split screen; time-lapse; rapid montage",
        lens_info="Wide-angle for distortion; macro for details",
        movement_style="Frantic; body-mounted; hypnotic repetition",
        legacy="Pioneered music video techniques in narrative cinema"
    ),
    
    "amelie": CinematographyStyle(
        preset_id="amelie",
        cinematographer="Bruno Delbonnel, AFC, ASC",
        camera="Arriflex 535B",
        film_stock="35mm Agfa/Kodak",
        aspect_ratio="1.85:1",
        lighting_signature="Warm, golden practicals; soft fill; fairy-tale glow",
        color_palette="Warm greens and reds; golden Parisian light; storybook saturation",
        notable_techniques="Extensive digital color grading; fantasy sequences; photo-album style",
        lens_info="Standard range with soft filtration",
        movement_style="Playful; whimsical dolly; static tableaux",
        legacy="Defined modern fairy-tale aesthetic; influenced romantic comedy"
    ),
    
    "there_will_be_blood": CinematographyStyle(
        preset_id="there_will_be_blood",
        cinematographer="Robert Elswit, ASC",
        camera="Panavision XL / Arricam LT",
        film_stock="Kodak Vision2 200T, 500T",
        aspect_ratio="2.35:1",
        lighting_signature="Naturalistic oil field; practical fire; period-accurate",
        color_palette="Earthy browns and blacks; oil and fire; American West palette",
        notable_techniques="Extensive location shooting; practical oil derrick fire",
        lens_info="Panavision Primo anamorphic",
        movement_style="Grand, sweeping; epic scope; intimate confrontations",
        legacy="Masterclass in American epic cinematography"
    ),
    
    "drive": CinematographyStyle(
        preset_id="drive",
        cinematographer="Newton Thomas Sigel, ASC",
        camera="ARRI Alexa",
        film_stock="Digital",
        aspect_ratio="2.35:1",
        lighting_signature="Neon-drenched LA nights; cool blue and hot pink; noir influence",
        color_palette="Neon pinks and blues; LA noir; romantic and violent contrast",
        notable_techniques="Car-mounted rigs; slow-motion violence; music video influence",
        lens_info="Panavision anamorphic; vintage glass",
        movement_style="Smooth, hypnotic; static tension; explosive violence",
        legacy="Defined neon noir revival aesthetic"
    ),
    
    "under_the_skin": CinematographyStyle(
        preset_id="under_the_skin",
        cinematographer="Daniel Landin",
        camera="ARRI Alexa",
        film_stock="Digital",
        aspect_ratio="1.85:1",
        lighting_signature="Available light; hidden cameras; naturalistic Scotland",
        color_palette="Muted, overcast; alien perspective on humanity",
        notable_techniques="Hidden cameras; non-actors; abstract sequences",
        lens_info="Concealed lenses; standard for hidden work",
        movement_style="Observational; voyeuristic; hidden camera documentary",
        legacy="Pioneered hidden camera narrative techniques"
    ),
    
    "metropolis": CinematographyStyle(
        preset_id="metropolis",
        cinematographer="Karl Freund / Günther Rittau",
        camera="Custom UFA cameras",
        film_stock="35mm orthochromatic",
        aspect_ratio="1.33:1",
        lighting_signature="German Expressionist; dramatic shadows; architectural lighting",
        color_palette="Black & White; high contrast expressionist",
        notable_techniques="Schüfftan process; massive sets; pioneering visual effects",
        lens_info="Period German lenses; innovative techniques",
        movement_style="Crane and tracking; epic scale movement",
        legacy="Defined sci-fi visual language; influenced all future dystopian cinema"
    ),
    
    "un_chien_andalou": CinematographyStyle(
        preset_id="un_chien_andalou",
        cinematographer="Albert Duverger",
        camera="35mm Standard",
        film_stock="35mm orthochromatic",
        aspect_ratio="1.33:1",
        lighting_signature="Surrealist; dreamlike; theatrical lighting",
        color_palette="Black & White; surrealist contrast",
        notable_techniques="Surrealist montage; shock imagery; dream logic",
        lens_info="Standard period lenses",
        movement_style="Static surrealist tableaux; disorienting cuts",
        legacy="Founded surrealist cinema; influenced avant-garde"
    ),
    
    "bicycle_thieves": CinematographyStyle(
        preset_id="bicycle_thieves",
        cinematographer="Carlo Montuori",
        camera="35mm Standard",
        film_stock="35mm Ferrania",
        aspect_ratio="1.37:1",
        lighting_signature="Naturalistic; available light; Italian neorealist aesthetic",
        color_palette="Black & White; documentary realism",
        notable_techniques="Location shooting; non-professional actors; real streets",
        lens_info="Standard documentary range",
        movement_style="Following subjects; documentary observation",
        legacy="Defined Italian Neorealism; influenced world cinema"
    ),
    
    "solaris": CinematographyStyle(
        preset_id="solaris",
        cinematographer="Vadim Yusov",
        camera="35mm Standard",
        film_stock="35mm Sovcolor",
        aspect_ratio="2.35:1",
        lighting_signature="Naturalistic earth; ethereal space station; memory-tinted",
        color_palette="Earth tones for planet; cool blues for station; sepia for memories",
        notable_techniques="Long takes; water imagery; dream sequences",
        lens_info="Anamorphic widescreen; standard Soviet glass",
        movement_style="Slow, contemplative; long duration shots",
        legacy="Influenced philosophical sci-fi cinematography"
    ),
    
    "the_mirror": CinematographyStyle(
        preset_id="the_mirror",
        cinematographer="Georgy Rerberg",
        camera="35mm Standard",
        film_stock="35mm Sovcolor / B&W",
        aspect_ratio="1.37:1",
        lighting_signature="Poetic naturalism; available light; elemental (wind, rain, fire)",
        color_palette="Color for present; sepia for memory; B&W for documentary",
        notable_techniques="Long takes; natural phenomena; non-linear editing",
        lens_info="Standard Soviet lenses",
        movement_style="Slow, flowing; elemental movement; poetic observation",
        legacy="Masterclass in memory and time cinematography"
    ),
}


def get_cinematography_style(preset_id: str) -> CinematographyStyle | None:
    """Get cinematography style information for a preset."""
    return CINEMATOGRAPHY_STYLES.get(preset_id)


def get_all_cinematography_styles() -> dict[str, CinematographyStyle]:
    """Get all cinematography styles."""
    return CINEMATOGRAPHY_STYLES
