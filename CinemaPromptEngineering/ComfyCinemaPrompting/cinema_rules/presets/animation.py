"""Animation Style Presets.

Contains animation style presets covering:
- Anime (Studio Ghibli, Akira, Ghost in the Shell, etc.)
- Manga (Shonen, Seinen, Shojo, etc.)
- 3D Animation (Pixar, Arcane, Spider-Verse, etc.)
- Illustration (Concept Art, Editorial, etc.)
"""

from pydantic import BaseModel, Field


class AnimationPreset(BaseModel):
    """An animation style preset that auto-populates configuration fields."""
    
    id: str = Field(description="Unique preset identifier")
    name: str = Field(description="Display name")
    domain: str = Field(description="Style domain (Anime, Manga, ThreeD, Illustration)")
    medium: str = Field(description="Animation medium (2D, 3D, Hybrid, StopMotion)")
    
    # Rendering
    line_treatment: str = Field(default="Clean", description="Line art style")
    color_application: str = Field(default="Cel", description="Color/shading approach")
    lighting_model: str = Field(default="Naturalistic_Simulated", description="Lighting style")
    surface_detail: str = Field(default="Smooth", description="Surface texture approach")
    
    # Motion
    motion_style: str = Field(default="Full", description="Animation fluidity")
    virtual_camera: str = Field(default="Digital_Pan", description="Camera behavior")
    
    # Visual characteristics
    mood: list[str] = Field(default_factory=list, description="Primary moods")
    color_tone: list[str] = Field(default_factory=list, description="Color characteristics")
    composition: list[str] = Field(default_factory=list, description="Composition techniques")
    
    # Reference works
    reference_works: list[str] = Field(default_factory=list, description="Notable works in this style")
    
    # Constraints
    disallowed_cameras: list[str] = Field(default_factory=list, description="Camera types incompatible")
    disallowed_motion: list[str] = Field(default_factory=list, description="Motion styles incompatible")


# =============================================================================
# ANIME PRESETS
# =============================================================================

ANIME_PRESETS: dict[str, AnimationPreset] = {
    
    "studio_ghibli": AnimationPreset(
        id="studio_ghibli",
        name="Studio Ghibli",
        domain="Anime",
        medium="2D",
        line_treatment="Variable",
        color_application="Soft",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Painterly",
        motion_style="Full",
        virtual_camera="Parallax",
        mood=["Whimsical", "Nostalgic", "Serene"],
        color_tone=["Warm_Saturated", "Natural"],
        composition=["Depth_Layering", "Negative_Space"],
        reference_works=["Spirited Away", "My Neighbor Totoro", "Princess Mononoke", "Howl's Moving Castle"],
    ),
    
    "akira": AnimationPreset(
        id="akira",
        name="Akira",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Dramatic",
        surface_detail="Textured",
        motion_style="Full",
        virtual_camera="Digital_Pan",
        mood=["Apocalyptic", "Chaotic", "Intense"],
        color_tone=["Neon", "Cool_Saturated"],
        composition=["Dynamic", "Centered"],
        reference_works=["Akira"],
    ),
    
    "ghost_in_the_shell": AnimationPreset(
        id="ghost_in_the_shell",
        name="Ghost in the Shell",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Stylized_Rim",
        surface_detail="Smooth",
        motion_style="Full",
        virtual_camera="Digital_Pan",
        mood=["Philosophical", "Noir", "Contemplative"],
        color_tone=["Cool_Desaturated", "Neon"],
        composition=["Architectural", "Negative_Space"],
        reference_works=["Ghost in the Shell", "Ghost in the Shell 2: Innocence"],
    ),
    
    "evangelion": AnimationPreset(
        id="evangelion",
        name="Neon Genesis Evangelion",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Dramatic",
        surface_detail="Flat",
        motion_style="Limited",
        virtual_camera="Digital_Pan",
        mood=["Anxious", "Existential", "Surreal"],
        color_tone=["Cool_Desaturated", "High_Contrast"],
        composition=["Centered", "Geometric"],
        reference_works=["Neon Genesis Evangelion", "End of Evangelion"],
    ),
    
    "makoto_shinkai": AnimationPreset(
        id="makoto_shinkai",
        name="Makoto Shinkai",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Soft",
        lighting_model="Glow",
        surface_detail="Painterly",
        motion_style="Full",
        virtual_camera="Parallax",
        mood=["Melancholic", "Romantic", "Nostalgic"],
        color_tone=["Warm_Saturated", "Vibrant"],
        composition=["Depth_Layering", "Negative_Space"],
        reference_works=["Your Name", "Weathering With You", "5 Centimeters Per Second"],
    ),
    
    "kyoto_animation": AnimationPreset(
        id="kyoto_animation",
        name="Kyoto Animation",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Soft",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Smooth",
        motion_style="Full",
        virtual_camera="Digital_Pan",
        mood=["Tender", "Whimsical", "Nostalgic"],
        color_tone=["Warm_Saturated", "Pastel"],
        composition=["Rule_of_Thirds", "Centered"],
        reference_works=["Violet Evergarden", "A Silent Voice", "K-On!", "Clannad"],
    ),
    
    "mappa": AnimationPreset(
        id="mappa",
        name="MAPPA",
        domain="Anime",
        medium="Hybrid",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Dramatic",
        surface_detail="Smooth",
        motion_style="Full",
        virtual_camera="Free_3D",
        mood=["Intense", "Dark", "Chaotic"],
        color_tone=["Cool_Desaturated", "High_Contrast"],
        composition=["Dynamic", "Centered_Action"],
        reference_works=["Attack on Titan S4", "Jujutsu Kaisen", "Chainsaw Man"],
    ),
    
    "wit_studio": AnimationPreset(
        id="wit_studio",
        name="Wit Studio",
        domain="Anime",
        medium="2D",
        line_treatment="Variable",
        color_application="Cel",
        lighting_model="Dramatic",
        surface_detail="Textured",
        motion_style="Full",
        virtual_camera="Digital_Pan",
        mood=["Epic", "Intense", "Dramatic"],
        color_tone=["Warm_Saturated"],
        composition=["Dynamic", "Action_Lines"],
        reference_works=["Attack on Titan S1-3", "Vinland Saga", "Spy x Family"],
    ),
    
    "ufotable": AnimationPreset(
        id="ufotable",
        name="Ufotable",
        domain="Anime",
        medium="Hybrid",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Glow",
        surface_detail="Smooth",
        motion_style="Full",
        virtual_camera="Free_3D",
        mood=["Epic", "Intense", "Dramatic"],
        color_tone=["Vibrant", "High_Contrast"],
        composition=["Dynamic", "Symmetrical"],
        reference_works=["Demon Slayer", "Fate/Zero", "Fate/Stay Night UBW"],
    ),
    
    "trigger": AnimationPreset(
        id="trigger",
        name="Studio Trigger",
        domain="Anime",
        medium="2D",
        line_treatment="Variable",
        color_application="Flat",
        lighting_model="Graphic",
        surface_detail="Flat",
        motion_style="Exaggerated",
        virtual_camera="Digital_Pan",
        mood=["Energetic", "Rebellious", "Chaotic"],
        color_tone=["Highly_Saturated", "Bold"],
        composition=["Dynamic", "Diagonal"],
        reference_works=["Kill la Kill", "Promare", "Gurren Lagann"],
    ),
    
    "gainax": AnimationPreset(
        id="gainax",
        name="Gainax",
        domain="Anime",
        medium="2D",
        line_treatment="Variable",
        color_application="Cel",
        lighting_model="Dramatic",
        surface_detail="Flat",
        motion_style="Exaggerated",
        virtual_camera="Digital_Pan",
        mood=["Rebellious", "Surreal", "Epic"],
        color_tone=["Saturated", "Bold"],
        composition=["Dynamic", "Asymmetrical"],
        reference_works=["FLCL", "Gurren Lagann", "Neon Genesis Evangelion"],
    ),
    
    "satoshi_kon": AnimationPreset(
        id="satoshi_kon",
        name="Satoshi Kon",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Smooth",
        motion_style="Full",
        virtual_camera="Digital_Pan",
        mood=["Surreal", "Psychological", "Dreamlike"],
        color_tone=["Neutral", "Natural"],
        composition=["Frame_Within_Frame", "Asymmetrical"],
        reference_works=["Perfect Blue", "Paprika", "Millennium Actress", "Tokyo Godfathers"],
    ),
    
    "cowboy_bebop": AnimationPreset(
        id="cowboy_bebop",
        name="Cowboy Bebop",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Dramatic",
        surface_detail="Smooth",
        motion_style="Full",
        virtual_camera="Digital_Pan",
        mood=["Noir", "Melancholic", "Cool"],
        color_tone=["Cool_Desaturated", "Warm_Accents"],
        composition=["Cinematic", "Rule_of_Thirds"],
        reference_works=["Cowboy Bebop"],
    ),
    
    "samurai_champloo": AnimationPreset(
        id="samurai_champloo",
        name="Samurai Champloo",
        domain="Anime",
        medium="2D",
        line_treatment="Variable",
        color_application="Cel",
        lighting_model="Dramatic",
        surface_detail="Flat",
        motion_style="Full",
        virtual_camera="Digital_Pan",
        mood=["Cool", "Energetic", "Rebellious"],
        color_tone=["Warm_Desaturated", "Natural"],
        composition=["Dynamic", "Rule_of_Thirds"],
        reference_works=["Samurai Champloo"],
    ),
    
    "mob_psycho_100": AnimationPreset(
        id="mob_psycho_100",
        name="Mob Psycho 100",
        domain="Anime",
        medium="2D",
        line_treatment="Sketchy",
        color_application="Flat",
        lighting_model="Glow",
        surface_detail="Flat",
        motion_style="Exaggerated",
        virtual_camera="Digital_Pan",
        mood=["Energetic", "Surreal", "Playful"],
        color_tone=["Vibrant", "Bold"],
        composition=["Dynamic", "Asymmetrical"],
        reference_works=["Mob Psycho 100"],
    ),
    
    "one_punch_man": AnimationPreset(
        id="one_punch_man",
        name="One Punch Man",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Dramatic",
        surface_detail="Textured",
        motion_style="Full",
        virtual_camera="Digital_Pan",
        mood=["Epic", "Intense", "Satirical"],
        color_tone=["Saturated", "Bold"],
        composition=["Dynamic", "Action_Lines"],
        reference_works=["One Punch Man"],
    ),
    
    "cyberpunk_edgerunners": AnimationPreset(
        id="cyberpunk_edgerunners",
        name="Cyberpunk: Edgerunners",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Glow",
        surface_detail="Smooth",
        motion_style="Full",
        virtual_camera="Digital_Pan",
        mood=["Intense", "Nihilistic", "Frantic"],
        color_tone=["Neon", "Cool_Saturated", "High_Contrast"],
        composition=["Dynamic", "Urban"],
        reference_works=["Cyberpunk: Edgerunners"],
    ),
    
    "violet_evergarden": AnimationPreset(
        id="violet_evergarden",
        name="Violet Evergarden",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Soft",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Painterly",
        motion_style="Full",
        virtual_camera="Parallax",
        mood=["Melancholic", "Tender", "Nostalgic"],
        color_tone=["Warm_Saturated", "Pastel"],
        composition=["Depth_Layering", "Symmetrical"],
        reference_works=["Violet Evergarden"],
    ),
    
    "attack_on_titan": AnimationPreset(
        id="attack_on_titan",
        name="Attack on Titan",
        domain="Anime",
        medium="Hybrid",
        line_treatment="Variable",
        color_application="Cel",
        lighting_model="Dramatic",
        surface_detail="Textured",
        motion_style="Full",
        virtual_camera="Free_3D",
        mood=["Epic", "Dread", "Intense"],
        color_tone=["Warm_Desaturated", "High_Contrast"],
        composition=["Dynamic", "Scale_Emphasis"],
        reference_works=["Attack on Titan"],
    ),
    
    "death_note": AnimationPreset(
        id="death_note",
        name="Death Note",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Dramatic",
        surface_detail="Smooth",
        motion_style="Limited",
        virtual_camera="Digital_Pan",
        mood=["Suspenseful", "Paranoid", "Psychological"],
        color_tone=["Cool_Desaturated", "High_Contrast"],
        composition=["Dramatic_Angles", "Negative_Space"],
        reference_works=["Death Note"],
    ),
    
    "fullmetal_alchemist": AnimationPreset(
        id="fullmetal_alchemist",
        name="Fullmetal Alchemist: Brotherhood",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Smooth",
        motion_style="Full",
        virtual_camera="Digital_Pan",
        mood=["Epic", "Emotional", "Intense"],
        color_tone=["Warm_Saturated", "Natural"],
        composition=["Dynamic", "Rule_of_Thirds"],
        reference_works=["Fullmetal Alchemist: Brotherhood"],
    ),
    
    "steins_gate": AnimationPreset(
        id="steins_gate",
        name="Steins;Gate",
        domain="Anime",
        medium="2D",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Smooth",
        motion_style="Limited",
        virtual_camera="Digital_Pan",
        mood=["Suspenseful", "Mysterious", "Melancholic"],
        color_tone=["Warm_Desaturated", "Natural"],
        composition=["Intimate", "Rule_of_Thirds"],
        reference_works=["Steins;Gate"],
    ),
}


# =============================================================================
# MANGA PRESETS
# =============================================================================

MANGA_PRESETS: dict[str, AnimationPreset] = {
    
    "shonen": AnimationPreset(
        id="shonen",
        name="Shonen",
        domain="Manga",
        medium="2D",
        line_treatment="Inked",
        color_application="Monochrome_Ink",
        lighting_model="Graphic",
        surface_detail="Hatched",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Energetic", "Triumphant", "Intense"],
        color_tone=["Monochrome"],
        composition=["Dynamic", "Action_Lines"],
        reference_works=["Dragon Ball", "Naruto", "One Piece", "My Hero Academia"],
        disallowed_cameras=["Free_3D", "Simulated_Handheld"],
    ),
    
    "dark_seinen": AnimationPreset(
        id="dark_seinen",
        name="Dark Seinen",
        domain="Manga",
        medium="2D",
        line_treatment="Inked",
        color_application="Monochrome_Ink",
        lighting_model="Dramatic",
        surface_detail="Hatched",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Menacing", "Oppressive", "Nihilistic"],
        color_tone=["Monochrome", "High_Contrast_BW"],
        composition=["Negative_Space", "Asymmetrical"],
        reference_works=["Berserk", "Vagabond", "Vinland Saga", "Blame!"],
        disallowed_cameras=["Free_3D", "Simulated_Handheld"],
    ),
    
    "shojo": AnimationPreset(
        id="shojo",
        name="Shojo",
        domain="Manga",
        medium="2D",
        line_treatment="Variable",
        color_application="Monochrome_Ink",
        lighting_model="Symbolic",
        surface_detail="Flat",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Romantic", "Tender", "Whimsical"],
        color_tone=["Monochrome"],
        composition=["Centered", "Decorative"],
        reference_works=["Sailor Moon", "Fruits Basket", "Ouran High School Host Club"],
        disallowed_cameras=["Free_3D", "Simulated_Handheld"],
    ),
    
    "josei": AnimationPreset(
        id="josei",
        name="Josei",
        domain="Manga",
        medium="2D",
        line_treatment="Clean",
        color_application="Monochrome_Ink",
        lighting_model="Minimal",
        surface_detail="Flat",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Melancholic", "Intimate", "Contemplative"],
        color_tone=["Monochrome"],
        composition=["Negative_Space", "Centered"],
        reference_works=["Nana", "Paradise Kiss", "Honey and Clover"],
        disallowed_cameras=["Free_3D", "Simulated_Handheld"],
    ),
    
    "horror_manga": AnimationPreset(
        id="horror_manga",
        name="Horror Manga",
        domain="Manga",
        medium="2D",
        line_treatment="Inked",
        color_application="Monochrome_Ink",
        lighting_model="Dramatic",
        surface_detail="Hatched",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Eerie", "Dread", "Claustrophobic"],
        color_tone=["Monochrome", "High_Contrast_BW"],
        composition=["Constrained_Framing", "Negative_Space"],
        reference_works=["Uzumaki", "Tomie", "Parasyte", "The Drifting Classroom"],
        disallowed_cameras=["Free_3D", "Simulated_Handheld"],
    ),
    
    "slice_of_life_manga": AnimationPreset(
        id="slice_of_life_manga",
        name="Slice of Life Manga",
        domain="Manga",
        medium="2D",
        line_treatment="Clean",
        color_application="Monochrome_Ink",
        lighting_model="Minimal",
        surface_detail="Flat",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Serene", "Whimsical", "Nostalgic"],
        color_tone=["Monochrome"],
        composition=["Centered", "Rule_of_Thirds"],
        reference_works=["Yotsuba&!", "Barakamon", "Silver Spoon"],
        disallowed_cameras=["Free_3D", "Simulated_Handheld"],
    ),
}


# =============================================================================
# 3D ANIMATION PRESETS
# =============================================================================

THREE_D_PRESETS: dict[str, AnimationPreset] = {
    
    "pixar": AnimationPreset(
        id="pixar",
        name="Pixar",
        domain="ThreeD",
        medium="3D",
        line_treatment="None",
        color_application="Full",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Smooth",
        motion_style="Full",
        virtual_camera="Free_3D",
        mood=["Whimsical", "Tender", "Nostalgic"],
        color_tone=["Warm_Saturated", "Vibrant"],
        composition=["Rule_of_Thirds", "Depth_Layering"],
        reference_works=["Toy Story", "WALL-E", "Up", "Inside Out", "Coco"],
    ),
    
    "dreamworks": AnimationPreset(
        id="dreamworks",
        name="DreamWorks",
        domain="ThreeD",
        medium="3D",
        line_treatment="None",
        color_application="Full",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Smooth",
        motion_style="Exaggerated",
        virtual_camera="Free_3D",
        mood=["Playful", "Energetic", "Adventurous"],
        color_tone=["Saturated", "Warm"],
        composition=["Dynamic", "Centered"],
        reference_works=["Shrek", "How to Train Your Dragon", "Kung Fu Panda"],
    ),
    
    "disney_3d": AnimationPreset(
        id="disney_3d",
        name="Disney 3D",
        domain="ThreeD",
        medium="3D",
        line_treatment="None",
        color_application="Full",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Smooth",
        motion_style="Full",
        virtual_camera="Free_3D",
        mood=["Whimsical", "Romantic", "Epic"],
        color_tone=["Saturated", "Warm"],
        composition=["Symmetrical", "Depth_Layering"],
        reference_works=["Frozen", "Moana", "Tangled", "Encanto"],
    ),
    
    "arcane": AnimationPreset(
        id="arcane",
        name="Arcane",
        domain="ThreeD",
        medium="Hybrid",
        line_treatment="Variable",
        color_application="Painterly",
        lighting_model="Dramatic",
        surface_detail="Painterly",
        motion_style="Full",
        virtual_camera="Free_3D",
        mood=["Dark", "Epic", "Emotional"],
        color_tone=["Neon", "Cool_Saturated", "Warm_Accents"],
        composition=["Cinematic", "Frame_Within_Frame"],
        reference_works=["Arcane"],
    ),
    
    "spider_verse": AnimationPreset(
        id="spider_verse",
        name="Spider-Verse",
        domain="ThreeD",
        medium="Hybrid",
        line_treatment="Variable",
        color_application="Limited",
        lighting_model="Graphic",
        surface_detail="Textured",
        motion_style="Snappy",
        virtual_camera="Free_3D",
        mood=["Energetic", "Rebellious", "Playful"],
        color_tone=["Vibrant", "Neon", "Bold"],
        composition=["Dynamic", "Comic_Panels"],
        reference_works=["Spider-Man: Into the Spider-Verse", "Across the Spider-Verse"],
    ),
    
    "unreal_cinematic": AnimationPreset(
        id="unreal_cinematic",
        name="Unreal Cinematic",
        domain="ThreeD",
        medium="3D",
        line_treatment="None",
        color_application="Full",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Photoreal",
        motion_style="Full",
        virtual_camera="Free_3D",
        mood=["Epic", "Cinematic", "Realistic"],
        color_tone=["Natural", "Desaturated"],
        composition=["Cinematic", "Rule_of_Thirds"],
        reference_works=["The Mandalorian Virtual Production", "Game Cinematics"],
    ),
    
    "blender_stylized": AnimationPreset(
        id="blender_stylized",
        name="Blender Stylized",
        domain="ThreeD",
        medium="3D",
        line_treatment="Clean",
        color_application="Cel",
        lighting_model="Graphic",
        surface_detail="Flat",
        motion_style="Full",
        virtual_camera="Free_3D",
        mood=["Whimsical", "Stylized"],
        color_tone=["Saturated", "Bold"],
        composition=["Centered", "Symmetrical"],
        reference_works=["Blender Open Movies"],
    ),
    
    "stop_motion": AnimationPreset(
        id="stop_motion",
        name="Stop Motion",
        domain="ThreeD",
        medium="StopMotion",
        line_treatment="None",
        color_application="Full",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Textured",
        motion_style="Limited",
        virtual_camera="Free_3D",
        mood=["Whimsical", "Tactile", "Nostalgic"],
        color_tone=["Warm", "Muted"],
        composition=["Centered", "Depth_Layering"],
        reference_works=["Coraline", "Kubo and the Two Strings", "Isle of Dogs", "Fantastic Mr. Fox"],
    ),
}


# =============================================================================
# ILLUSTRATION PRESETS
# =============================================================================

ILLUSTRATION_PRESETS: dict[str, AnimationPreset] = {
    
    "concept_art": AnimationPreset(
        id="concept_art",
        name="Concept Art",
        domain="Illustration",
        medium="2D",
        line_treatment="Sketchy",
        color_application="Painterly",
        lighting_model="Dramatic",
        surface_detail="Painterly",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Epic", "Mysterious", "Atmospheric"],
        color_tone=["Muted", "Natural"],
        composition=["Negative_Space", "Depth_Layering"],
        reference_works=["Syd Mead", "Craig Mullins", "Feng Zhu"],
        disallowed_motion=["Full", "Exaggerated", "Fluid"],
    ),
    
    "editorial": AnimationPreset(
        id="editorial",
        name="Editorial Illustration",
        domain="Illustration",
        medium="2D",
        line_treatment="Variable",
        color_application="Limited",
        lighting_model="Graphic",
        surface_detail="Flat",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Conceptual", "Bold", "Provocative"],
        color_tone=["Bold", "Limited_Palette"],
        composition=["Centered", "Negative_Space"],
        reference_works=["New Yorker covers", "The Atlantic illustrations"],
        disallowed_motion=["Full", "Exaggerated", "Fluid"],
    ),
    
    "book_illustration": AnimationPreset(
        id="book_illustration",
        name="Book Illustration",
        domain="Illustration",
        medium="2D",
        line_treatment="Variable",
        color_application="Soft",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Painterly",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Whimsical", "Nostalgic", "Tender"],
        color_tone=["Warm", "Muted"],
        composition=["Storybook", "Centered"],
        reference_works=["Beatrix Potter", "Maurice Sendak", "Quentin Blake"],
        disallowed_motion=["Full", "Exaggerated", "Fluid"],
    ),
    
    "comic_western": AnimationPreset(
        id="comic_western",
        name="Western Comics",
        domain="Illustration",
        medium="2D",
        line_treatment="Inked",
        color_application="Flat",
        lighting_model="Graphic",
        surface_detail="Flat",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Epic", "Intense", "Dramatic"],
        color_tone=["Saturated", "Bold"],
        composition=["Dynamic", "Action_Lines"],
        reference_works=["Marvel Comics", "DC Comics", "Dark Horse"],
        disallowed_motion=["Full", "Fluid"],
    ),
    
    "graphic_novel": AnimationPreset(
        id="graphic_novel",
        name="Graphic Novel",
        domain="Illustration",
        medium="2D",
        line_treatment="Inked",
        color_application="Limited",
        lighting_model="Dramatic",
        surface_detail="Flat",
        motion_style="None",
        virtual_camera="Motion_Comic",
        mood=["Noir", "Intimate", "Contemplative"],
        color_tone=["Muted", "Limited_Palette"],
        composition=["Cinematic", "Frame_Within_Frame"],
        reference_works=["Watchmen", "Maus", "Persepolis", "Sin City"],
        disallowed_motion=["Full", "Exaggerated"],
    ),
    
    "watercolor": AnimationPreset(
        id="watercolor",
        name="Watercolor",
        domain="Illustration",
        medium="2D",
        line_treatment="Sketchy",
        color_application="Soft",
        lighting_model="Minimal",
        surface_detail="Painterly",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Serene", "Ethereal", "Nostalgic"],
        color_tone=["Muted", "Desaturated"],
        composition=["Negative_Space", "Organic"],
        reference_works=["Traditional watercolor illustration"],
        disallowed_motion=["Full", "Exaggerated", "Fluid"],
    ),
    
    "digital_painting": AnimationPreset(
        id="digital_painting",
        name="Digital Painting",
        domain="Illustration",
        medium="2D",
        line_treatment="None",
        color_application="Painterly",
        lighting_model="Naturalistic_Simulated",
        surface_detail="Painterly",
        motion_style="None",
        virtual_camera="Locked",
        mood=["Epic", "Atmospheric", "Dramatic"],
        color_tone=["Rich", "Natural"],
        composition=["Depth_Layering", "Rule_of_Thirds"],
        reference_works=["ArtStation trending"],
        disallowed_motion=["Full", "Exaggerated", "Fluid"],
    ),
}


# =============================================================================
# COMBINED PRESET DICTIONARY
# =============================================================================

ANIMATION_PRESETS: dict[str, AnimationPreset] = {
    **ANIME_PRESETS,
    **MANGA_PRESETS,
    **THREE_D_PRESETS,
    **ILLUSTRATION_PRESETS,
}


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_preset(preset_id: str) -> AnimationPreset | None:
    """Get an animation preset by ID."""
    return ANIMATION_PRESETS.get(preset_id)


def get_all_presets() -> dict[str, AnimationPreset]:
    """Get all animation presets."""
    return ANIMATION_PRESETS


def get_presets_by_domain(domain: str) -> dict[str, AnimationPreset]:
    """Get all presets from a specific domain (Anime, Manga, ThreeD, Illustration)."""
    return {k: v for k, v in ANIMATION_PRESETS.items() if v.domain == domain}


def get_presets_by_medium(medium: str) -> dict[str, AnimationPreset]:
    """Get all presets using a specific medium (2D, 3D, Hybrid, StopMotion)."""
    return {k: v for k, v in ANIMATION_PRESETS.items() if v.medium == medium}


def get_anime_presets() -> dict[str, AnimationPreset]:
    """Get all anime presets."""
    return ANIME_PRESETS


def get_manga_presets() -> dict[str, AnimationPreset]:
    """Get all manga presets."""
    return MANGA_PRESETS


def get_3d_presets() -> dict[str, AnimationPreset]:
    """Get all 3D animation presets."""
    return THREE_D_PRESETS


def get_illustration_presets() -> dict[str, AnimationPreset]:
    """Get all illustration presets."""
    return ILLUSTRATION_PRESETS
