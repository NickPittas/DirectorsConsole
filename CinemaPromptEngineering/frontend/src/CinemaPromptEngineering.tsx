import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useCinemaStore } from '@/store';
import { api } from '@/api/client';
import type { RuleSeverity, FilmPresetSummary, AnimationPresetSummary, CinematographyStyle, OptionsResponse } from '@/types';
import Settings, { getConfiguredProviders, getSelectedLlmSettings, loadTargetModel, saveTargetModel, type ConfiguredProvider } from '@/components/Settings';

// Enum options (static for now - would be fetched from API in production)
const ENUMS = {
  // Live-action - Camera Type
  camera_type: ['Digital', 'Film'],
  
  // Live-action - Camera (Digital)
  camera_manufacturer: ['ARRI', 'RED', 'Sony', 'Canon', 'Blackmagic', 'Panasonic', 'DJI', 'Nikon'],
  camera_manufacturer_film: ['ARRI_Film', 'Eclair', 'Panavision', 'Mitchell', 'IMAX', 'Vintage'],
  camera_body: [
    // ARRI Digital
    'Alexa_35', 'Alexa_Mini', 'Alexa_Mini_LF', 'Alexa_LF', 'Alexa_65',
    // RED
    'V_Raptor', 'V_Raptor_X', 'V_Raptor_XL', 'Komodo_X', 'Monstro_8K',
    // Sony
    'Venice_2', 'FX9', 'FX6',
    // Canon
    'C700_FF', 'C500_Mark_II', 'C300_Mark_III',
    // Blackmagic
    'Ursa_Mini_Pro_12K', 'Pocket_6K',
    // Panasonic
    'Varicam_LT', 'S1H',
    // Nikon
    'Z9',
    // DJI (camera-as-unit drones)
    'Inspire_3', 'Mavic_3_Cine',
  ],
  camera_body_film: [
    // ARRI Film (Modern)
    'Arricam_ST', 'Arricam_LT', 'ARRI_535B', 'ARRI_35BL', 'ARRI_35_III',
    // ARRI Film (Classic)
    'Arriflex_35', 'Arriflex_35BL', 'Arriflex_435',
    // Eclair (French New Wave)
    'Eclair_NPR',
    // Panavision
    'Panavision_Millennium_XL2', 'Panavision_Millennium', 'Panavision_Platinum',
    'Panavision_Gold', 'Panavision_Panastar', 'Panavision_Panaflex',
    'Super_Panavision_70', 'Ultra_Panavision_70', 'Panavision_XL',
    // Mitchell
    'Mitchell_BNC', 'Mitchell_BNCR', 'Mitchell_BFC_65',
    // IMAX
    'IMAX_MSM_9802', 'IMAX_MKIV', 'IMAX_GT',
    // Early Digital (aliases)
    'Alexa', 'Alexa_XT', 'RED_One',
    // Vintage/Historic
    'UFA_Custom', 'Pathe_Studio',
  ],
  
  // Film Stock (only for film cameras)
  film_stock: [
    // 35mm Color Negative - Current (Vision3 series)
    'Kodak_Vision3_500T_5219', 'Kodak_Vision3_250D_5207', 'Kodak_Vision3_200T_5213', 'Kodak_Vision3_50D_5203',
    // 35mm Color Negative - Vision2 series (1998-2007)
    'Kodak_Vision2_500T_5218', 'Kodak_Vision2_200T_5217',
    // 35mm Color Negative - Vision series (1996-2002)
    'Kodak_Vision_500T_5279', 'Kodak_Vision_320T_5277',
    // 35mm B&W
    'Kodak_Double_X_5222', 'Kodak_Tri_X', 'Eastman_Double_X', 'Eastman_Plus_X',
    // Historic (1960s-1990s)
    'Eastman_5247', 'Eastman_5293', 'Eastman_5294', 'Eastman_5250', 'Eastman_5254',
    'Technicolor', 'Kodachrome',
    // Fuji Film Stocks (Japanese cinema)
    'Fuji_Eterna_500T', 'Fuji_Eterna_250D', 'Fuji_Eterna_250T',
  ],
  film_stock_65mm: [
    'Kodak_65mm_500T', 'Kodak_65mm_250D', 'Kodak_65mm_200T',
  ],
  film_stock_imax: [
    'IMAX_500T', 'IMAX_250D',
  ],
  
  // Aspect Ratio
  aspect_ratio: [
    '1.33:1', '1.37:1', '1.66:1', '1.78:1', '1.85:1',
    '2.20:1', '2.35:1', '2.39:1', '2.76:1',
    '1.43:1', '1.90:1',
  ],
  
  // Live-action - Lens
  lens_manufacturer: ['ARRI', 'Zeiss', 'Cooke', 'Panavision', 'Angenieux', 'Leica', 'Canon', 'Sony', 'Sigma', 'Fujifilm', 'Hawk', 'Hasselblad', 'Technovision', 'Bausch_Lomb', 'Todd_AO', 'Kowa', 'Vintage', 'Warner_Bros', 'Paramount', 'Pathe'],
  lens_manufacturer_vintage: ['Bausch_Lomb', 'Todd_AO', 'Kowa', 'Vintage', 'Warner_Bros', 'Paramount', 'Pathe'],
  lens_family: [
    'ARRI_Signature_Prime', 'ARRI_Master_Prime', 'ARRI_Ultra_Prime', 'ARRI_Prime_65', 'ARRI_Prime_DNA',
    'Zeiss_Supreme_Prime', 'Zeiss_Master_Prime', 'Zeiss_CP3', 'Zeiss_Super_Speed', 'Zeiss_Standard_Speed', 'Zeiss_Ultra_Prime', 'Zeiss_Planar_f0.7',
    'Cooke_S7', 'Cooke_S4', 'Cooke_Panchro', 'Cooke_Speed_Panchro',
    'Panavision_Primo', 'Panavision_Primo_70', 'Panavision_C_Series', 'Panavision_E_Series',
    'Panavision_Super_Speed', 'Panavision_Standard', 'Panavision_Ultra_Speed', 'Panavision_Auto_Panatar', 'Ultra_Panavision_Optics',
    'Angenieux_Optimo', 'Leica_Summicron_C', 'Leica_Summilux_C',
    'Canon_Sumire', 'Canon_K35', 'Sony_CineAlta', 'Sigma_Cine',
    // Hawk
    'Hawk_V_Lite', 'Hawk_V_Plus',
    // Hasselblad (Medium/Large Format)
    'Hasselblad_HC', 'Hasselblad_V',
    // IMAX
    'IMAX_Optics',
    // Vintage
    'Bausch_Lomb_Super_Baltar', 'Bausch_Lomb_Baltar', 'Todd_AO', 'Kowa_Anamorphic',
    'Vintage_Spherical', 'Vintage_Anamorphic',
  ],
  focal_length_mm: [14, 18, 21, 24, 28, 32, 35, 40, 50, 65, 75, 85, 100, 135, 150, 200],
  
  // Live-action - Movement
  movement_equipment: [
    'Static', 'Handheld', 'Steadicam', 'Gimbal', 'Dolly', 'Crane', 'Jib', 'Technocrane', 'Drone',
  ],
  movement_type: [
    'Static', 'Pan', 'Tilt', 'Track_In', 'Track_Out', 'Arc', 'Crane_Up', 'Crane_Down', 'Dolly_Zoom',
  ],
  movement_timing: ['Static', 'Very_Slow', 'Slow', 'Moderate', 'Fast', 'Whip_Fast'],
  
  // Live-action - Lighting
  time_of_day: ['Dawn', 'Morning', 'Midday', 'Afternoon', 'Golden_Hour', 'Blue_Hour', 'Dusk', 'Night'],
  lighting_source: ['Sun', 'Moon', 'Tungsten', 'HMI', 'LED', 'Kino_Flo', 'Neon', 'Practical', 'Mixed'],
  lighting_style: ['High_Key', 'Low_Key', 'Soft', 'Hard', 'Naturalistic', 'Expressionistic', 'Chiaroscuro'],
  
  // Animation - Style
  animation_medium: ['2D', '3D', 'Hybrid', 'StopMotion'],
  style_domain: ['Anime', 'Manga', 'ThreeD', 'Illustration'],
  
  // Animation - Rendering
  line_treatment: ['Clean', 'Sketchy', 'Bold', 'Thin', 'Variable', 'None'],
  color_application: ['Cel', 'Gradient', 'Watercolor', 'Flat', 'Textured', 'Monochrome', 'Monochrome_Ink'],
  lighting_model: ['Flat', 'Cel_Shaded', 'Soft_Shaded', 'Naturalistic_Simulated', 'Raytraced'],
  surface_detail: ['Smooth', 'Textured', 'Detailed', 'Photoreal', 'Stylized'],
  
  // Animation - Motion
  motion_style: ['None', 'Limited', 'Full', 'Exaggerated', 'Snappy', 'Fluid'],
  virtual_camera: ['Locked', 'Digital_Pan', 'Digital_Zoom', 'Parallax', 'Free_3D', 'Simulated_Handheld', 'Motion_Comic'],
  
  // Common - Visual Grammar
  shot_size: ['EWS', 'WS', 'MWS', 'MS', 'MCU', 'CU', 'BCU', 'ECU', 'OTS', 'POV'],
  composition: ['Rule_of_Thirds', 'Centered', 'Symmetrical', 'Asymmetrical', 'Negative_Space', 'Leading_Lines'],
  mood: [
    // Light/Positive Moods
    'Cheerful', 'Happy', 'Hopeful', 'Whimsical', 'Adventurous',
    // Romantic Moods
    'Romantic', 'Sensual', 'Passionate', 'Intimate',
    // Melancholic Moods
    'Melancholic', 'Somber', 'Reflective', 'Contemplative', 'Introspective', 'Tender', 'Bittersweet', 'Nostalgic',
    // Surreal Moods
    'Surreal', 'Dreamlike', 'Hallucinatory', 'Transcendent', 'Meditative', 'Philosophical', 'Psychedelic',
    // Dark Moods
    'Gloomy', 'Menacing', 'Oppressive', 'Paranoid', 'Tense', 'Anxious', 'Claustrophobic', 'Brutal', 'Traumatic', 'Unsettling',
    'Ominous', 'Suspenseful', 'Mysterious', 'Haunting', 'Bleak', 'Tragic', 'Lonely',
    // Aggressive Moods
    'Aggressive', 'Angry', 'Rebellious', 'Kinetic', 'Urgent', 'Provocative', 'Unhinged', 'Chaotic', 'Frantic', 'Intense',
    // Noir/Hardboiled Moods
    'Noir', 'Hardboiled', 'Fatalistic', 'Cynical', 'World_Weary',
    // Gothic/Horror Moods
    'Gothic', 'Macabre', 'Grotesque', 'Eldritch', 'Dread',
    // Documentary/Realistic Moods
    'Documentary', 'Realistic', 'Observational', 'Journalistic', 'Verite',
    // Epic/Scale Moods
    'Epic', 'Serene',
  ],
  color_tone: [
    'Warm_Saturated', 'Warm_Desaturated', 'Cool_Saturated', 'Cool_Desaturated',
    'Neutral_Saturated', 'Neutral_Desaturated', 'Monochrome', 'Sepia', 'Teal_Orange',
  ],
  
  // Target models (fallback - API provides this dynamically)
  target_model: [
    // General
    'generic',
    // Image Models
    'midjourney', 'flux.1', 'flux.1_pro', 'flux_kontext', 'flux_krea',
    'dall-e_3', 'gpt-image', 'ideogram_2.0', 'leonardo_ai', 
    'sdxl', 'stable_diffusion_3', 'z-image_turbo', 'qwen_image',
    // Video Models
    'sora', 'sora_2', 'veo_2', 'veo_3', 'runway_gen-3', 'runway_gen-4', 
    'kling_1.6', 'pika_2.0', 'luma_dream_machine', 'ltx_2', 'cogvideox', 
    'hunyuan', 'wan_2.1', 'wan_2.2', 'minimax_video', 'qwen_vl',
  ],
};

// Target model display names (for fallback when API unavailable)
const TARGET_MODEL_NAMES: Record<string, string> = {
  'generic': 'Generic',
  'midjourney': 'Midjourney',
  'flux.1': 'FLUX.1',
  'flux.1_pro': 'FLUX.1 Pro',
  'flux_kontext': 'Flux Kontext',
  'flux_krea': 'Flux Krea',
  'dall-e_3': 'DALL-E 3',
  'gpt-image': 'GPT-Image (4o)',
  'ideogram_2.0': 'Ideogram 2.0',
  'leonardo_ai': 'Leonardo AI',
  'sdxl': 'Stable Diffusion XL',
  'stable_diffusion_3': 'Stable Diffusion 3',
  'z-image_turbo': 'Z-Image Turbo',
  'qwen_image': 'Qwen-Image',
  'sora': 'Sora',
  'sora_2': 'Sora 2',
  'veo_2': 'Veo 2',
  'veo_3': 'Veo 3',
  'runway_gen-3': 'Runway Gen-3',
  'runway_gen-4': 'Runway Gen-4',
  'kling_1.6': 'Kling 1.6',
  'pika_2.0': 'Pika 2.0',
  'luma_dream_machine': 'Luma Dream Machine',
  'ltx_2': 'LTX-2',
  'cogvideox': 'CogVideoX',
  'hunyuan': 'Hunyuan Video',
  'wan_2.1': 'Wan 2.1',
  'wan_2.2': 'Wan 2.2',
  'minimax_video': 'Minimax Video',
  'qwen_vl': 'Qwen VL',
};

// Shot size abbreviation to full name mapping
const SHOT_SIZE_NAMES: Record<string, string> = {
  'EWS': 'Extreme Wide Shot (EWS)',
  'WS': 'Wide Shot (WS)',
  'MWS': 'Medium Wide Shot (MWS)',
  'MS': 'Medium Shot (MS)',
  'MCU': 'Medium Close-Up (MCU)',
  'CU': 'Close-Up (CU)',
  'BCU': 'Big Close-Up (BCU)',
  'ECU': 'Extreme Close-Up (ECU)',
  'OTS': 'Over-The-Shoulder (OTS)',
  'POV': 'Point-of-View (POV)',
};

// Camera body display names (internal value → human-readable)
const CAMERA_BODY_NAMES: Record<string, string> = {
  // ARRI Digital
  'Alexa_35': 'ARRI Alexa 35',
  'Alexa_Mini': 'ARRI Alexa Mini',
  'Alexa_Mini_LF': 'ARRI Alexa Mini LF',
  'Alexa_LF': 'ARRI Alexa LF',
  'Alexa_65': 'ARRI Alexa 65',
  // RED
  'V_Raptor': 'RED V-Raptor',
  'V_Raptor_X': 'RED V-Raptor X',
  'V_Raptor_XL': 'RED V-Raptor XL',
  'Komodo_X': 'RED Komodo-X',
  'Monstro_8K': 'RED Monstro 8K',
  // Sony
  'Venice_2': 'Sony Venice 2',
  'FX9': 'Sony FX9',
  'FX6': 'Sony FX6',
  // Canon
  'C700_FF': 'Canon C700 FF',
  'C500_Mark_II': 'Canon C500 Mark II',
  'C300_Mark_III': 'Canon C300 Mark III',
  // Blackmagic
  'Ursa_Mini_Pro_12K': 'Blackmagic URSA Mini Pro 12K',
  'Pocket_6K': 'Blackmagic Pocket Cinema 6K',
  // Panasonic
  'Varicam_LT': 'Panasonic VariCam LT',
  'S1H': 'Panasonic S1H',
  // Nikon
  'Z9': 'Nikon Z9',
  // DJI
  'Inspire_3': 'DJI Inspire 3',
  'Mavic_3_Cine': 'DJI Mavic 3 Cine',
  // Film - ARRI
  'Arricam_ST': 'ARRI Arricam ST',
  'Arricam_LT': 'ARRI Arricam LT',
  'ARRI_535B': 'ARRI 535B',
  'ARRI_35BL': 'ARRI 35BL',
  'ARRI_35_III': 'ARRI 35 III',
  // Film - Panavision
  'Panavision_Millennium_XL2': 'Panavision Millennium XL2',
  'Panavision_Millennium': 'Panavision Millennium',
  'Panavision_Platinum': 'Panavision Platinum',
  'Panavision_Gold': 'Panavision Gold',
  'Panavision_Panastar': 'Panavision Panastar',
  'Panavision_Panaflex': 'Panavision Panaflex',
  'Super_Panavision_70': 'Super Panavision 70',
  'Ultra_Panavision_70': 'Ultra Panavision 70 (MGM)',
  // Film - Mitchell
  'Mitchell_BNC': 'Mitchell BNC',
  'Mitchell_BNCR': 'Mitchell BNCR',
  'Mitchell_BFC_65': 'Mitchell BFC 65mm',
  // Film - IMAX
  'IMAX_MSM_9802': 'IMAX MSM 9802',
  'IMAX_MKIV': 'IMAX MKIV',
  'IMAX_GT': 'IMAX GT',
};

// Lens family display names (internal value → human-readable)
const LENS_FAMILY_NAMES: Record<string, string> = {
  // ARRI
  'ARRI_Signature_Prime': 'ARRI Signature Prime',
  'ARRI_Master_Prime': 'ARRI/Zeiss Master Prime',
  'ARRI_Ultra_Prime': 'ARRI/Zeiss Ultra Prime',
  'ARRI_Prime_65': 'ARRI Prime 65 (65mm Format)',
  'ARRI_Prime_DNA': 'ARRI Prime DNA LF',
  // Zeiss
  'Zeiss_Supreme_Prime': 'Zeiss Supreme Prime',
  'Zeiss_Master_Prime': 'Zeiss Master Prime',
  'Zeiss_CP3': 'Zeiss CP.3',
  // Cooke
  'Cooke_S7': 'Cooke S7/i Full Frame',
  'Cooke_S4': 'Cooke S4/i',
  'Cooke_Panchro': 'Cooke Panchro/i Classic',
  'Cooke_Speed_Panchro': 'Cooke Speed Panchro (Vintage)',
  // Panavision
  'Panavision_Primo': 'Panavision Primo',
  'Panavision_Primo_70': 'Panavision Primo 70',
  'Panavision_C_Series': 'Panavision C-Series Anamorphic',
  'Panavision_E_Series': 'Panavision E-Series Anamorphic',
  'Panavision_Super_Speed': 'Panavision Super Speed (Z-Series)',
  'Panavision_Standard': 'Panavision Standard (Pre-1970)',
  'Panavision_Ultra_Speed': 'Panavision Ultra Speed',
  'Panavision_Auto_Panatar': 'Panavision Auto Panatar',
  // Other Modern
  'Angenieux_Optimo': 'Angénieux Optimo',
  'Leica_Summicron_C': 'Leica Summicron-C',
  'Leica_Summilux_C': 'Leica Summilux-C',
  'Canon_Sumire': 'Canon Sumire Prime',
  'Sony_CineAlta': 'Sony CineAlta',
  'Sigma_Cine': 'Sigma Cine',
  // Vintage Lenses
  'Bausch_Lomb_Super_Baltar': 'Bausch & Lomb Super Baltar',
  'Bausch_Lomb_Baltar': 'Bausch & Lomb Baltar',
  'Zeiss_Planar_f07': 'Zeiss Planar f/0.7 (Kubrick)',
  'Zeiss_Super_Speed': 'Zeiss Super Speed',
  'Zeiss_Standard_Speed': 'Zeiss Standard Speed (Mk II/III)',
  'Canon_K35': 'Canon K35',
  'Kowa_Anamorphic': 'Kowa Anamorphic (Cinerama)',
  'Todd_AO': 'Todd-AO 70mm Optics',
  'Ultra_Panavision_Optics': 'Ultra Panavision 70 Optics',
  'Vintage_Spherical': 'Vintage Spherical (Generic)',
  'Vintage_Anamorphic': 'Vintage Anamorphic (Generic)',
  // Hawk
  'Hawk_V_Lite': 'Hawk V-Lite Anamorphic',
  'Hawk_V_Plus': 'Hawk V-Plus Anamorphic',
  // Hasselblad (Large Format Cinema)
  'Hasselblad_HC': 'Hasselblad HC (Medium Format)',
  'Hasselblad_V': 'Hasselblad V-System (Carl Zeiss)',
  // IMAX
  'IMAX_Optics': 'IMAX Custom Optics',
};

// =============================================================================
// DROPDOWN FILTERING RULES (CLIENT-SIDE CONSTRAINTS)
// These rules filter dropdown options based on current selections
// =============================================================================

// Camera body weight classifications
const CAMERA_WEIGHTS: Record<string, 'Light' | 'Medium' | 'Heavy'> = {
  // ARRI
  'Alexa_35': 'Medium',      // ~3.6kg
  'Alexa_Mini': 'Light',     // ~2.3kg
  'Alexa_Mini_LF': 'Medium', // ~2.6kg
  'Alexa_LF': 'Medium',      // ~2.9kg
  'Alexa_65': 'Heavy',       // ~6.5kg
  // RED
  'V_Raptor': 'Light',       // ~1.8kg
  'V_Raptor_X': 'Light',     // ~1.9kg
  'V_Raptor_XL': 'Medium',   // ~3.0kg
  'Komodo_X': 'Light',       // ~1.4kg
  'Monstro_8K': 'Medium',    // ~2.5kg
  // Sony
  'Venice_2': 'Heavy',       // ~5.0kg
  'FX9': 'Heavy',            // ~4.7kg (with handle)
  'FX6': 'Light',            // ~2.0kg
  // Canon
  'C700_FF': 'Heavy',        // ~3.5kg body only, ~5kg rigged
  'C500_Mark_II': 'Medium',  // ~1.7kg body
  'C300_Mark_III': 'Medium', // ~1.8kg body
  // Blackmagic
  'Ursa_Mini_Pro_12K': 'Heavy', // ~4.3kg body
  'Pocket_6K': 'Light',      // ~0.9kg body
  // Panasonic
  'Varicam_LT': 'Medium',    // ~2.7kg body
  'S1H': 'Light',            // ~1.2kg body
  // Nikon
  'Z9': 'Light',             // ~1.3kg with battery
  // DJI (drone cameras - always light for flight)
  'Inspire_3': 'Light',      // Drone camera unit
  'Mavic_3_Cine': 'Light',   // Drone camera unit
  // Film Cameras - ARRI
  'Arricam_ST': 'Heavy',     // ~7.0kg body
  'Arricam_LT': 'Medium',    // ~4.5kg body (Lite version)
  'ARRI_535B': 'Heavy',      // ~7.2kg body
  'ARRI_35BL': 'Heavy',      // ~6.8kg body (blimped)
  'ARRI_35_III': 'Medium',   // ~4.0kg body (lightweight)
  // Film Cameras - Panavision  
  'Panavision_Millennium_XL2': 'Heavy',  // ~8.5kg body
  'Panavision_Millennium': 'Heavy',      // ~7.5kg body
  'Panavision_Platinum': 'Heavy',        // ~9.0kg body
  'Panavision_Gold': 'Heavy',            // ~8.0kg body
  'Panavision_Panastar': 'Heavy',        // ~6.5kg body (high-speed)
  'Panavision_Panaflex': 'Heavy',        // ~7.0kg body
  'Super_Panavision_70': 'Heavy',        // ~12kg body (65mm)
  'Ultra_Panavision_70': 'Heavy',        // ~14kg body (65mm anamorphic)
  // Film Cameras - Mitchell
  'Mitchell_BNC': 'Heavy',   // ~11kg body (studio camera)
  'Mitchell_BNCR': 'Heavy',  // ~12kg body
  'Mitchell_BFC_65': 'Heavy', // ~15kg body (65mm)
  // Film Cameras - IMAX
  'IMAX_MSM_9802': 'Heavy',  // ~40kg body
  'IMAX_MKIV': 'Heavy',      // ~30kg body
  'IMAX_GT': 'Heavy',        // ~50kg body (largest IMAX)
};

// =============================================================================
// CAMERA MANUFACTURER → BODY MAPPING
// Which camera bodies belong to which manufacturer
// =============================================================================

const MANUFACTURER_CAMERA_BODIES: Record<string, string[]> = {
  // Digital cameras
  'ARRI': ['Alexa_35', 'Alexa_Mini', 'Alexa_Mini_LF', 'Alexa_LF', 'Alexa_65'],
  'RED': ['V_Raptor', 'V_Raptor_X', 'V_Raptor_XL', 'Komodo_X', 'Monstro_8K'],
  'Sony': ['Venice_2', 'FX9', 'FX6'],
  'Canon': ['C700_FF', 'C500_Mark_II', 'C300_Mark_III'],
  'Blackmagic': ['Ursa_Mini_Pro_12K', 'Pocket_6K'],
  'Panasonic': ['Varicam_LT', 'S1H'],
  'Nikon': ['Z9'],
  'DJI': ['Inspire_3', 'Mavic_3_Cine'],
  // Film cameras
  'ARRI_Film': ['Arricam_ST', 'Arricam_LT', 'ARRI_535B', 'ARRI_35BL', 'ARRI_35_III', 'Arriflex_35', 'Arriflex_35BL', 'Arriflex_435'],
  'Eclair': ['Eclair_NPR'],
  'Panavision': ['Panavision_Millennium_XL2', 'Panavision_Millennium', 'Panavision_Platinum', 'Panavision_Gold', 'Panavision_Panastar', 'Panavision_Panaflex', 'Super_Panavision_70', 'Ultra_Panavision_70', 'Panavision_XL'],
  'Mitchell': ['Mitchell_BNC', 'Mitchell_BNCR', 'Mitchell_BFC_65'],
  'IMAX': ['IMAX_MSM_9802', 'IMAX_MKIV', 'IMAX_GT'],
  // Early Digital & Historic (for presets)
  'Vintage': ['UFA_Custom', 'Pathe_Studio', 'Alexa', 'Alexa_XT', 'RED_One'],
};

// Equipment that cannot support heavy cameras (>4kg)
const HEAVY_RESTRICTED_EQUIPMENT = ['Handheld', 'Gimbal', 'Drone'];

// Movement types allowed by equipment
const EQUIPMENT_MOVEMENT_RESTRICTIONS: Record<string, string[]> = {
  'Static': ['Static'],
  'Handheld': ['Static', 'Pan', 'Tilt'],
  'Steadicam': ['Static', 'Pan', 'Tilt', 'Track_In', 'Track_Out', 'Arc'],
  'Gimbal': ['Static', 'Pan', 'Tilt', 'Track_In', 'Track_Out', 'Arc'],
  'Dolly': ['Static', 'Track_In', 'Track_Out', 'Dolly_Zoom'],
  'Slider': ['Static', 'Track_In', 'Track_Out', 'Dolly_Zoom'],
  'Crane': ['Static', 'Crane_Up', 'Crane_Down', 'Arc'],
  'Jib': ['Static', 'Crane_Up', 'Crane_Down', 'Arc'],
  'Technocrane': ['Static', 'Pan', 'Tilt', 'Track_In', 'Track_Out', 'Crane_Up', 'Crane_Down', 'Arc'],
  'Drone': ['Static', 'Track_In', 'Track_Out', 'Crane_Up', 'Crane_Down', 'Arc'],
};

// Equipment required for specific movement types
const MOVEMENT_EQUIPMENT_REQUIREMENTS: Record<string, string[]> = {
  'Dolly_Zoom': ['Dolly', 'Slider'],  // Dolly zoom (Vertigo) requires dolly or slider
};

// Movement type → Timing restrictions
// Dolly Zoom (Vertigo effect) requires slow timing for the effect to register
const MOVEMENT_TYPE_TIMING_RESTRICTIONS: Record<string, string[]> = {
  'Dolly_Zoom': ['Static', 'Very_Slow', 'Slow', 'Moderate'],  // No Fast or Whip_Fast - effect becomes disorienting/unreadable
};

// Time of day restrictions on lighting source
const TIME_SOURCE_RESTRICTIONS: Record<string, string[]> = {
  'Night': ['Moon', 'Tungsten', 'HMI', 'LED', 'Kino_Flo', 'Neon', 'Practical', 'Mixed'], // No Sun
  'Blue_Hour': ['Moon', 'Tungsten', 'HMI', 'LED', 'Kino_Flo', 'Neon', 'Practical', 'Mixed'], // No Sun
  'Midday': ['Sun', 'HMI', 'LED', 'Kino_Flo', 'Practical', 'Mixed'], // No Moon
};

// Era-based lighting anachronism rules (technology invention dates)
// HMI: 1972, Kino_Flo: 1987, LED (widespread film use): 2002
const ERA_LIGHTING_ANACHRONISMS: Record<string, number> = {
  'HMI': 1972,
  'Kino_Flo': 1987,
  'LED': 2002,
};

// Time of day restrictions on lighting style
const TIME_STYLE_RESTRICTIONS: Record<string, string[]> = {
  'Midday': ['High_Key', 'Soft', 'Hard', 'Naturalistic'], // No Low_Key
};

// Mood → Lighting Style restrictions
// Per COMPREHENSIVE_RULES_DOCUMENT.md Section 8.4 and Color-Mood.md
const MOOD_LIGHTING_RESTRICTIONS: Record<string, { disallowed: string[]; preferred?: string[] }> = {
  'Cheerful': { 
    disallowed: ['Low_Key'], 
    preferred: ['High_Key', 'Soft'] 
  },
  'Hopeful': { 
    disallowed: ['Low_Key'], 
    preferred: ['High_Key', 'Soft', 'Naturalistic'] 
  },
  // Dark moods prefer Low_Key but don't forbid High_Key (artistic choice)
  'Gloomy': { disallowed: [], preferred: ['Low_Key', 'Hard'] },
  'Menacing': { disallowed: [], preferred: ['Low_Key', 'Hard', 'Chiaroscuro'] },
  'Noir': { disallowed: [], preferred: ['Low_Key', 'Chiaroscuro', 'Hard'] },
  'Paranoid': { disallowed: [], preferred: ['Low_Key', 'Hard'] },
};

// Animation domain restrictions
const ANIMATION_DOMAIN_RESTRICTIONS: Record<string, {
  disallowed_colors?: string[];
  disallowed_cameras?: string[];
  disallowed_motion?: string[];
  disallowed_lighting?: string[];  // NEW: Lighting model restrictions
  required_lighting?: string[];    // NEW: Required lighting models
}> = {
  'Manga': {
    disallowed_colors: ['Cel', 'Gradient', 'Watercolor', 'Flat', 'Textured'], // Must be Monochrome
    disallowed_cameras: ['Digital_Pan', 'Digital_Zoom', 'Parallax', 'Free_3D', 'Simulated_Handheld'], // Must be Locked
    disallowed_motion: ['Limited', 'Full', 'Exaggerated', 'Snappy', 'Fluid'], // Must be None
    required_lighting: ['Flat'],  // Manga requires Graphic/Flat lighting only
  },
  'Illustration': {
    disallowed_motion: ['Limited', 'Full', 'Exaggerated', 'Snappy', 'Fluid'], // Must be None (static)
    disallowed_cameras: ['Digital_Pan', 'Digital_Zoom', 'Parallax', 'Free_3D', 'Simulated_Handheld'], // Must be Locked
  },
  'Anime': {
    disallowed_cameras: ['Simulated_Handheld'],  // NEW: Anime cannot use excessive camera shake
    disallowed_lighting: ['Raytraced'],  // Anime doesn't use photoreal lighting
  },
  'ThreeD': {
    disallowed_lighting: ['Flat'],  // 3D cannot use Flat lighting
  },
};

// 2D medium cannot use 3D camera
const MEDIUM_CAMERA_RESTRICTIONS: Record<string, string[]> = {
  '2D': ['Free_3D'], // 2D cannot use 3D camera
};

// Motion style → Virtual camera restrictions
// When motion is None, camera must be Locked or Motion_Comic (static variants)
const MOTION_CAMERA_RESTRICTIONS: Record<string, string[]> = {
  'None': ['Digital_Pan', 'Digital_Zoom', 'Parallax', 'Free_3D', 'Simulated_Handheld'], // Only Locked/Motion_Comic allowed
};

// =============================================================================
// FOCAL LENGTH ↔ SHOT SIZE COMPATIBILITY HINTS
// Shows warning hints for unusual combinations (not blocking, just advisory)
// =============================================================================

/** Get hint text for focal length + shot size combination */
function getFocalLengthShotSizeHint(focalLength: number, shotSize: string): string | null {
  // Wide angle + close-up = distortion warning
  if (focalLength <= 24 && ['CU', 'BCU', 'ECU'].includes(shotSize)) {
    return `Wide lens (${focalLength}mm) on ${shotSize} causes facial distortion`;
  }
  if (focalLength <= 18 && ['MCU'].includes(shotSize)) {
    return `Very wide lens (${focalLength}mm) on ${shotSize} may cause noticeable distortion`;
  }
  
  // Long lens + wide shot = compression
  if (focalLength >= 135 && ['EWS', 'WS'].includes(shotSize)) {
    return `Long lens (${focalLength}mm) on ${shotSize} creates extreme compression`;
  }
  if (focalLength >= 100 && shotSize === 'EWS') {
    return `Telephoto (${focalLength}mm) on EWS is unusual - extreme distance required`;
  }
  
  // Extreme close-up + focal length recommendations
  if (shotSize === 'ECU' && focalLength < 85) {
    return `ECU typically uses 85-135mm lenses for flattering perspective`;
  }
  
  // Very wide + extreme wide shot recommendation
  if (shotSize === 'EWS' && focalLength > 35) {
    return `EWS typically uses 14-24mm for maximum environmental context`;
  }
  
  return null;
}

// =============================================================================
// CAMERA-LENS MOUNT COMPATIBILITY
// Based on sensor size and mount type physical constraints
// =============================================================================

// Sensor/format coverage for each camera body
type SensorFormat = 'S35' | 'FF' | 'LF' | '65mm' | 'M43' | 'IMAX_15perf';
const CAMERA_SENSOR_FORMAT: Record<string, SensorFormat> = {
  // ARRI Digital - S35
  'Alexa_35': 'S35',
  'Alexa_Mini': 'S35',
  // ARRI Digital - LF
  'Alexa_Mini_LF': 'LF',
  'Alexa_LF': 'LF',
  // ARRI Digital - 65mm
  'Alexa_65': '65mm',
  // RED - FF (VistaVision)
  'V_Raptor': 'FF',
  'V_Raptor_X': 'FF',
  'V_Raptor_XL': 'FF',
  'Komodo_X': 'S35',
  'Monstro_8K': 'FF',
  // Sony
  'Venice_2': 'FF',  // Dual mode FF/S35
  'FX9': 'FF',
  'FX6': 'FF',
  // Canon
  'C700_FF': 'FF',
  'C500_Mark_II': 'FF',
  'C300_Mark_III': 'S35',
  // Blackmagic
  'Ursa_Mini_Pro_12K': 'S35',
  'Pocket_6K': 'S35',
  // Panasonic
  'Varicam_LT': 'S35',
  'S1H': 'FF',
  // Nikon
  'Z9': 'FF',
  // DJI (drone cameras)
  'Inspire_3': 'FF',
  'Mavic_3_Cine': 'M43',  // Micro Four Thirds
  // Film - ARRI (all 35mm 4-perf = S35 equivalent)
  'Arricam_ST': 'S35',
  'Arricam_LT': 'S35',
  'ARRI_535B': 'S35',
  'ARRI_35BL': 'S35',
  'ARRI_35_III': 'S35',
  // Film - Panavision 35mm
  'Panavision_Millennium_XL2': 'S35',
  'Panavision_Millennium': 'S35',
  'Panavision_Platinum': 'S35',
  'Panavision_Gold': 'S35',
  'Panavision_Panastar': 'S35',
  'Panavision_Panaflex': 'S35',
  // Film - Panavision 65mm
  'Super_Panavision_70': '65mm',
  'Ultra_Panavision_70': '65mm',
  // Film - Mitchell
  'Mitchell_BNC': 'S35',
  'Mitchell_BNCR': 'S35',
  'Mitchell_BFC_65': '65mm',
  // Film - IMAX (15-perf 65mm = largest cinema format)
  'IMAX_MSM_9802': 'IMAX_15perf',
  'IMAX_MKIV': 'IMAX_15perf',
  'IMAX_GT': 'IMAX_15perf',
};

// Mount type for each camera body
type MountType = 'PL' | 'LPL' | 'XPL' | 'RF' | 'E' | 'Panavision' | 'EF' | 'L' | 'Z' | 'DL' | 'Fixed' | 'Mitchell_Standard' | 'IMAX_Standard' | 'Panavision_65';
const CAMERA_MOUNT: Record<string, MountType> = {
  // ARRI Digital
  'Alexa_35': 'LPL',
  'Alexa_Mini': 'PL',  // Can adapt to LPL
  'Alexa_Mini_LF': 'LPL',
  'Alexa_LF': 'LPL',
  'Alexa_65': 'XPL',
  // RED
  'V_Raptor': 'RF',
  'V_Raptor_X': 'RF',
  'V_Raptor_XL': 'RF',
  'Komodo_X': 'RF',
  'Monstro_8K': 'PL',
  // Sony
  'Venice_2': 'PL',
  'FX9': 'E',
  'FX6': 'E',
  // Canon
  'C700_FF': 'PL',
  'C500_Mark_II': 'EF',  // Can use PL with adapter
  'C300_Mark_III': 'EF',  // Can use PL with adapter
  // Blackmagic
  'Ursa_Mini_Pro_12K': 'PL',
  'Pocket_6K': 'EF',
  // Panasonic
  'Varicam_LT': 'PL',
  'S1H': 'L',
  // Nikon
  'Z9': 'Z',
  // DJI (drone cameras - specialized mounts)
  'Inspire_3': 'DL',
  'Mavic_3_Cine': 'Fixed',  // Fixed lens, no interchangeable mount
  // Film - ARRI (PL mount introduced 1982, earlier used Arri Standard/Bayonet)
  'Arricam_ST': 'PL',
  'Arricam_LT': 'PL',
  'ARRI_535B': 'PL',
  'ARRI_35BL': 'PL',
  'ARRI_35_III': 'PL',
  // Film - Panavision (proprietary Panavision mount)
  'Panavision_Millennium_XL2': 'Panavision',
  'Panavision_Millennium': 'Panavision',
  'Panavision_Platinum': 'Panavision',
  'Panavision_Gold': 'Panavision',
  'Panavision_Panastar': 'Panavision',
  'Panavision_Panaflex': 'Panavision',
  'Super_Panavision_70': 'Panavision_65',
  'Ultra_Panavision_70': 'Panavision_65',
  // Film - Mitchell (Mitchell Standard mount)
  'Mitchell_BNC': 'Mitchell_Standard',
  'Mitchell_BNCR': 'Mitchell_Standard',
  'Mitchell_BFC_65': 'Mitchell_Standard',
  // Film - IMAX (specialized IMAX mount)
  'IMAX_MSM_9802': 'IMAX_Standard',
  'IMAX_MKIV': 'IMAX_Standard',
  'IMAX_GT': 'IMAX_Standard',
};

// Lens families coverage (what sensor sizes they can cover)
const LENS_COVERAGE: Record<string, SensorFormat[]> = {
  // ARRI - S35 only
  'ARRI_Ultra_Prime': ['S35'],
  'ARRI_Master_Prime': ['S35'],
  // ARRI - LF/FF
  'ARRI_Signature_Prime': ['S35', 'FF', 'LF'],
  // ARRI - 65mm format (Alexa 65)
  'ARRI_Prime_65': ['LF', '65mm'],  // Designed specifically for Alexa 65
  'ARRI_Prime_DNA': ['LF', '65mm'],  // Large format DNA lenses
  // Zeiss - S35
  'Zeiss_Master_Prime': ['S35'],
  'Zeiss_CP3': ['S35', 'FF'],  // Some cover FF
  // Zeiss - FF
  'Zeiss_Supreme_Prime': ['S35', 'FF', 'LF'],
  // Cooke - S35
  'Cooke_S4': ['S35'],
  'Cooke_Panchro': ['S35'],
  'Cooke_Speed_Panchro': ['S35'],  // Vintage
  // Cooke - FF
  'Cooke_S7': ['S35', 'FF', 'LF'],
  // Panavision - S35 (Panavision mount only)
  'Panavision_Primo': ['S35'],
  'Panavision_C_Series': ['S35'],
  'Panavision_E_Series': ['S35'],
  'Panavision_Super_Speed': ['S35'],
  'Panavision_Standard': ['S35'],
  'Panavision_Ultra_Speed': ['S35'],
  'Panavision_Auto_Panatar': ['S35'],
  // Panavision - 65mm (for Alexa 65, Super/Ultra Panavision 70)
  'Panavision_Primo_70': ['S35', 'FF', 'LF', '65mm'],
  'Ultra_Panavision_Optics': ['65mm'],  // Only for 65mm anamorphic
  // Angenieux
  'Angenieux_Optimo': ['S35', 'FF'],
  // Leica
  'Leica_Summicron_C': ['S35', 'FF'],
  'Leica_Summilux_C': ['S35', 'FF'],
  // Canon
  'Canon_Sumire': ['S35', 'FF'],
  'Canon_K35': ['S35'],  // Vintage, S35 coverage
  // Sony
  'Sony_CineAlta': ['S35', 'FF'],
  // Sigma
  'Sigma_Cine': ['S35', 'FF'],
  // Vintage Lenses
  'Bausch_Lomb_Super_Baltar': ['S35'],
  'Bausch_Lomb_Baltar': ['S35'],
  'Zeiss_Planar_f07': ['S35'],  // The Kubrick f/0.7 - modified Zeiss Planar
  'Zeiss_Super_Speed': ['S35'],
  'Zeiss_Standard_Speed': ['S35'],
  'Kowa_Anamorphic': ['S35'],
  // Large Format Specialty
  'Todd_AO': ['65mm', 'IMAX_15perf'],  // Todd-AO 70mm optics
  // Hasselblad (Medium/Large Format - full coverage)
  'Hasselblad_HC': ['FF', 'LF', '65mm'],  // H-system medium format
  'Hasselblad_V': ['FF', 'LF', '65mm', 'IMAX_15perf'],  // V-system large coverage (used on IMAX)
  // IMAX
  'IMAX_Optics': ['IMAX_15perf', '65mm', 'LF'],  // Custom IMAX optics
};

// Lens mount compatibility
const LENS_MOUNT: Record<string, MountType[]> = {
  // PL mount lenses
  'ARRI_Ultra_Prime': ['PL', 'LPL'],
  'ARRI_Master_Prime': ['PL', 'LPL'],
  'ARRI_Signature_Prime': ['LPL', 'PL'],
  'ARRI_Prime_65': ['XPL'],  // Special 65mm mount for Alexa 65
  'ARRI_Prime_DNA': ['LPL'],  // LPL mount for large format
  'Zeiss_Master_Prime': ['PL', 'LPL'],
  'Zeiss_CP3': ['PL', 'LPL', 'EF'],
  'Zeiss_Supreme_Prime': ['PL', 'LPL'],
  'Cooke_S4': ['PL', 'LPL'],
  'Cooke_Panchro': ['PL', 'LPL'],
  'Cooke_S7': ['PL', 'LPL'],
  'Cooke_Speed_Panchro': ['PL'],  // Vintage, original PL mount
  'Angenieux_Optimo': ['PL', 'LPL'],
  'Leica_Summicron_C': ['PL', 'LPL'],
  'Leica_Summilux_C': ['PL', 'LPL'],
  'Canon_Sumire': ['PL', 'EF'],
  'Canon_K35': ['PL'],  // Vintage Canon cine glass
  'Sony_CineAlta': ['PL', 'E'],
  'Sigma_Cine': ['PL', 'EF', 'E'],
  // Panavision mount (exclusive ecosystem)
  'Panavision_Primo': ['Panavision'],
  'Panavision_Primo_70': ['Panavision', 'Panavision_65', 'XPL'],  // Primo 70 can adapt to XPL
  'Panavision_C_Series': ['Panavision'],
  'Panavision_E_Series': ['Panavision'],
  'Panavision_Super_Speed': ['Panavision'],
  'Panavision_Standard': ['Panavision'],
  'Panavision_Ultra_Speed': ['Panavision'],
  'Panavision_Auto_Panatar': ['Panavision'],
  'Ultra_Panavision_Optics': ['Panavision_65'],
  // Vintage Lenses (mostly Mitchell Standard mount, later adapted to PL)
  'Bausch_Lomb_Super_Baltar': ['PL', 'Mitchell_Standard'],
  'Bausch_Lomb_Baltar': ['PL', 'Mitchell_Standard'],
  'Zeiss_Planar_f07': ['PL'],  // Custom mounts by Kubrick/Ed DiGiulio
  'Zeiss_Super_Speed': ['PL'],
  'Zeiss_Standard_Speed': ['PL'],
  'Kowa_Anamorphic': ['PL', 'Mitchell_Standard'],
  // Large format specialty
  'Todd_AO': ['Mitchell_Standard', 'IMAX_Standard'],  // 70mm optics
};

// =============================================================================
// LENS MANUFACTURER → FAMILY MAPPING
// Which lens families belong to which manufacturer
// =============================================================================

const MANUFACTURER_LENS_FAMILIES: Record<string, string[]> = {
  'ARRI': ['ARRI_Signature_Prime', 'ARRI_Master_Prime', 'ARRI_Ultra_Prime', 'ARRI_Prime_65', 'ARRI_Prime_DNA'],
  'Zeiss': ['Zeiss_Supreme_Prime', 'Zeiss_Master_Prime', 'Zeiss_CP3', 'Zeiss_Super_Speed', 'Zeiss_Standard_Speed', 'Zeiss_Ultra_Prime', 'Zeiss_Planar_f0.7'],
  'Cooke': ['Cooke_S7', 'Cooke_S4', 'Cooke_Panchro', 'Cooke_Speed_Panchro'],
  'Panavision': ['Panavision_Primo', 'Panavision_Primo_70', 'Panavision_C_Series', 'Panavision_E_Series', 'Panavision_Super_Speed', 'Panavision_Standard', 'Panavision_Ultra_Speed', 'Panavision_Auto_Panatar', 'Ultra_Panavision_Optics'],
  'Angenieux': ['Angenieux_Optimo'],
  'Leica': ['Leica_Summicron_C', 'Leica_Summilux_C'],
  'Canon': ['Canon_Sumire', 'Canon_K35'],
  'Sony': ['Sony_CineAlta'],
  'Sigma': ['Sigma_Cine'],
  'Fujifilm': [],  // No cine lens families yet
  // Specialty manufacturers
  'Hawk': ['Hawk_V_Lite', 'Hawk_V_Plus'],
  'Technovision': ['Vintage_Anamorphic'],  // Italian anamorphic
  // Vintage lens manufacturers
  'Bausch_Lomb': ['Bausch_Lomb_Super_Baltar', 'Bausch_Lomb_Baltar'],
  'Todd_AO': ['Todd_AO'],
  'Kowa': ['Kowa_Anamorphic'],
  'Vintage': ['Vintage_Spherical', 'Vintage_Anamorphic'],
  // Hasselblad (Large Format Cinema)
  'Hasselblad': ['Hasselblad_HC', 'Hasselblad_V', 'IMAX_Optics'],
  // IMAX Corporation
  'IMAX': ['IMAX_Optics', 'Hasselblad_V'],  // IMAX uses custom optics + Hasselblad
  // Classic Hollywood studios (use Vintage families)
  'Warner_Bros': ['Vintage_Spherical'],
  'Paramount': ['Vintage_Spherical'],
  'Pathe': ['Vintage_Spherical'],
};

// =============================================================================
// LENS FAMILY → AVAILABLE FOCAL LENGTHS
// Each lens family has specific focal lengths manufactured
// Data from COMPREHENSIVE_RULES_DOCUMENT.md Section 2.1
// =============================================================================

const LENS_FOCAL_LENGTHS: Record<string, number[]> = {
  // ARRI
  'ARRI_Signature_Prime': [12, 15, 18, 21, 25, 29, 35, 40, 47, 58, 75, 95, 125, 150],
  'ARRI_Master_Prime': [12, 14, 16, 18, 21, 25, 27, 32, 35, 40, 50, 65, 75, 100, 135],
  'ARRI_Ultra_Prime': [8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 50, 65, 85, 100, 135],
  'ARRI_Prime_65': [24, 28, 35, 50, 80, 100, 150],  // 65mm format lenses for Alexa 65
  'ARRI_Prime_DNA': [18, 21, 25, 32, 35, 50, 65, 80, 100, 135],  // DNA LF with organic character
  // Zeiss
  'Zeiss_Supreme_Prime': [15, 18, 21, 25, 29, 35, 50, 65, 85, 100, 135],
  'Zeiss_Master_Prime': [12, 14, 16, 18, 21, 25, 27, 32, 35, 40, 50, 65, 75, 100, 135],
  'Zeiss_CP3': [15, 18, 21, 25, 28, 35, 50, 85, 100, 135],  // Compact Primes
  // Cooke
  'Cooke_S7': [16, 18, 21, 25, 32, 40, 50, 65, 75, 100, 135],
  'Cooke_S4': [12, 14, 16, 18, 21, 25, 27, 32, 35, 40, 50, 65, 75, 100, 135],
  'Cooke_Panchro': [18, 21, 25, 32, 40, 50, 75, 100],  // Classic set
  // Panavision (unique focal lengths)
  'Panavision_Primo': [14, 17, 21, 27, 35, 40, 50, 75, 100],
  'Panavision_Primo_70': [27, 35, 40, 50, 65, 80, 100, 125, 150, 200],  // 65mm format
  'Panavision_C_Series': [17, 21, 27, 35, 40, 50, 75, 100],  // Compact anamorphic
  // Angenieux (zoom - use range midpoints as representative)
  'Angenieux_Optimo': [15, 24, 28, 35, 40, 50, 70, 100, 135, 200, 290],  // Various zoom ranges
  // Leica
  'Leica_Summicron_C': [15, 18, 21, 25, 29, 35, 40, 50, 75, 100, 135],
  'Leica_Summilux_C': [16, 18, 21, 25, 29, 35, 40, 50, 65, 75, 100],
  // Canon
  'Canon_Sumire': [14, 20, 24, 35, 50, 85, 135],
  // Sony
  'Sony_CineAlta': [20, 24, 35, 50, 85, 100, 135],
  // Sigma
  'Sigma_Cine': [14, 20, 24, 28, 35, 40, 50, 85, 105, 135],
  // Hasselblad (Medium/Large Format)
  'Hasselblad_HC': [24, 28, 35, 50, 80, 100, 120, 150, 210],  // H-system lenses
  'Hasselblad_V': [40, 50, 60, 80, 100, 120, 150, 180, 250],  // V-system Carl Zeiss
  // IMAX
  'IMAX_Optics': [35, 40, 50, 80, 100, 110, 150],  // IMAX custom optics
};

// Special restrictions (overrides general rules)
const CAMERA_LENS_SPECIAL_RULES: Record<string, {
  required_families?: string[];  // Only these families work
  excluded_families?: string[];  // These families don't work
  reason?: string;
}> = {
  // Alexa 65 requires 65mm optics - ARRI Prime 65, Prime DNA, and Panavision Primo 70 all cover 65mm
  'Alexa_65': {
    required_families: ['ARRI_Prime_65', 'ARRI_Prime_DNA', 'Panavision_Primo_70', 'Hasselblad_V'],
    reason: '65mm sensor requires specialized 65mm format lenses',
  },
};

/** Get hint text for lens filtering */
function getLensFilterHint(cameraBody: string): string | null {
  // Panavision cameras have closed ecosystem
  if (cameraBody.includes('Panavision') || cameraBody.startsWith('Super_Panavision') || cameraBody.startsWith('Ultra_Panavision')) {
    return 'Panavision cameras require Panavision lenses (closed ecosystem)';
  }
  
  const specialRule = CAMERA_LENS_SPECIAL_RULES[cameraBody];
  if (specialRule?.reason) {
    return specialRule.reason;
  }
  
  const sensorFormat = CAMERA_SENSOR_FORMAT[cameraBody];
  if (sensorFormat === 'LF') {
    return 'Large Format camera - S35-only lenses excluded';
  }
  if (sensorFormat === '65mm') {
    return '65mm sensor - requires specialized 65mm format lenses';
  }
  
  return null;
}

// =============================================================================
// TOOLTIP/DISABLED REASON HELPER TYPES
// =============================================================================

type OptionWithReason = {
  value: string;
  disabled: boolean;
  reason?: string;
  description?: string;  // Educational tooltip for non-disabled options
};

// =============================================================================
// COMPREHENSIVE OPTION DESCRIPTIONS
// Educational tooltips explaining each option's cinematic purpose
// =============================================================================

const OPTION_DESCRIPTIONS: Record<string, Record<string, string>> = {
  // Camera Manufacturers - brand characteristics (Digital)
  camera_manufacturer: {
    'ARRI': 'German precision. Industry-leading color science, exceptional highlight handling. Alexa is the gold standard.',
    'RED': 'American high-resolution pioneer. Compact bodies, 8K capable. Popular for indie to blockbuster.',
    'Sony': 'Japanese innovation. Dual ISO, excellent low-light. Venice for cinema, FX for broadcast.',
    'Canon': 'Japanese reliability. Cinema EOS line bridges photo/video. Strong autofocus, organic color.',
    'Blackmagic': 'Australian value leader. Affordable cinema cameras with DaVinci color science.',
    'Panasonic': 'Japanese innovation. VariCam for broadcast, S-series for hybrid. Dual native ISO.',
    'Nikon': 'Japanese stills heritage. Z-mount system pushing into cinema with Z9.',
    'DJI': 'Chinese aerial pioneers. Integrated camera/gimbal drones. Aerial cinematography standard.',
    // Film camera manufacturers
    'ARRI_Film': 'German film cameras (1917-present). Arricam series for modern film, 35 III/BL for classics. Industry workhorse.',
    'Panavision': 'Hollywood exclusive. Closed ecosystem (cameras + lenses). Rental-only. Millennium XL2 is modern standard.',
    'Mitchell': 'American classic (1920s-1970s). BNC was the Hollywood standard. Quiet for sync-sound. Now vintage/specialty.',
    'IMAX': 'Canadian large-format pioneer. 65mm/70mm film for immersive exhibition. 15-perf for ultimate resolution.',
  },
  
  // Lens Manufacturers - optical character
  lens_manufacturer: {
    'ARRI': 'German engineering. Clean, modern, technically precise. Signature Prime and Master Prime series.',
    'Zeiss': 'Legendary optics. Clinical sharpness, minimal distortion. Supreme and Master series.',
    'Cooke': 'British warmth. The "Cooke Look"—flattering skin tones, organic feel. S4 and S7 series.',
    'Panavision': 'Hollywood exclusive. Rental-only ecosystem. Primo series, anamorphic heritage.',
    'Angenieux': 'French zoom masters. Cinema-quality zooms that rival primes. Optimo series.',
    'Leica': 'German micro-contrast. Legendary still lens rendering brought to cinema. Summilux/Summicron.',
    'Canon': 'Japanese reliability. Warm, organic Sumire series for digital cinema.',
    'Sony': 'Matched to Venice cameras. CineAlta series optimized for Sony color science.',
    'Sigma': 'Japanese value. Sharp, modern cine lenses at accessible price points.',
    'Fujifilm': 'Japanese broadcast heritage. Fujinon series for cinema and broadcast.',
    // Vintage lens manufacturers
    'Bausch_Lomb': 'American classic. Super Baltar lenses defined Golden Age Hollywood. Warm, glowing highlights.',
    'Todd_AO': 'American large-format pioneer. 70mm optics for epic roadshow presentations.',
    'Kowa': 'Japanese anamorphic. Cinerama-era optics. Distinctive flares, vintage character.',
  },
  
  // Camera Bodies - technical characteristics
  camera_body: {
    'Alexa_35': 'ARRI flagship S35 camera. 4.6K sensor with exceptional highlight handling and organic color science. Industry standard for narrative filmmaking.',
    'Alexa_Mini': 'Compact S35 workhorse. Same sensor as larger ALEXAs but in gimbal-friendly form factor. Versatile for documentary to blockbuster.',
    'Alexa_Mini_LF': 'Large format version of Mini. Shallower depth of field and wider field of view. Popular for cinematic drama.',
    'Alexa_LF': 'ARRI Large Format camera. Same sensor as Mini LF in traditional body. Exceptional image quality.',
    'Alexa_65': 'Ultra-large 65mm format. Requires specialized optics. Used for epic visuals (Dune, Joker). Heavy—no handheld.',
    'V_Raptor': 'RED\'s 8K VistaVision camera. Compact, high resolution. Popular for episodic TV and indie features.',
    'V_Raptor_X': 'RED V-Raptor [X]. Enhanced sensor with improved low-light performance.',
    'V_Raptor_XL': 'Larger V-Raptor with internal ND filters and XLR audio. Studio-friendly configuration.',
    'Komodo_X': 'RED compact body. S35 6K sensor in ultra-small package. Run-and-gun and gimbal favorite.',
    'Monstro_8K': 'RED 8K sensor. Large format with exceptional resolution. High-end production standard.',
    'Venice_2': 'Sony dual ISO marvel. 8.6K full-frame. Exceptional low-light performance. Heavy—studio/dolly use.',
    'FX9': 'Sony full-frame camcorder. Built-in ND, XLR. Documentary and broadcast standard.',
    'FX6': 'Compact full-frame Sony. Run-and-gun form factor with Venice color science.',
    // Film camera bodies
    'Arricam_ST': 'ARRI Studio model. Quiet for sync-sound. Standard size for studio work. Modern film workhorse.',
    'Arricam_LT': 'ARRI Lite model. Lighter for handheld/Steadicam. Same gate as ST, smaller body.',
    'ARRI_535B': 'ARRI 535 evolution. 4-perf with crystal sync. Last generation before digital transition.',
    'ARRI_35BL': 'ARRI Blimped. Ultra-quiet for sync-sound. 1970s-2000s television standard.',
    'ARRI_35_III': 'ARRI lightweight. Popular for documentary, news, handheld narrative. Compact and reliable.',
    'Panavision_Millennium_XL2': 'Modern Panavision standard. Ultra-quiet, anamorphic-ready. Most rented film camera 2000-2015.',
    'Panavision_Millennium': 'Original Millennium. First truly quiet Panavision. Late 1990s flagship.',
    'Panavision_Platinum': 'Panavision 1980s flagship. Used on countless blockbusters. Heavy but reliable.',
    'Panavision_Gold': 'Panavision 1970s standard. The Empire Strikes Back, Blade Runner era.',
    'Panavision_Panastar': 'High-speed Panavision. Built for slow-motion. Action sequences, sports.',
    'Panavision_Panaflex': 'Original Panaflex. First self-blimped Panavision. Revolutionary quiet operation.',
    'Super_Panavision_70': 'Spherical 65mm. Lawrence of Arabia, 2001. Epic scale without anamorphic squeeze.',
    'Ultra_Panavision_70': 'Anamorphic 65mm. Ben-Hur, The Hateful Eight. Widest theatrical ratio (2.76:1).',
    'Mitchell_BNC': 'Mitchell Blimped Newsreel Camera. Hollywood studio standard 1930s-1960s. Whisper-quiet.',
    'Mitchell_BNCR': 'Mitchell Reflex. Added through-the-lens viewing. Easier operator workflow.',
    'Mitchell_BFC_65': 'Mitchell 65mm. Used for Todd-AO, early widescreen epics. Oklahoma!, Around the World.',
    'IMAX_MSM_9802': 'IMAX standard camera. 15-perf 65mm. Used for documentaries, nature films.',
    'IMAX_MKIV': 'IMAX Mark IV. Lighter than 9802. Enabled more dynamic IMAX shooting.',
    'IMAX_GT': 'IMAX Grand Theatre. Largest format camera. IMAX Dome/OMNIMAX presentations.',
  },
  
  // Movement Equipment - physical constraints
  movement_equipment: {
    'Static': 'Tripod-mounted. Rock-solid stability for dialogue, interviews, architectural shots. No operator fatigue.',
    'Handheld': 'Shoulder-mounted or body-braced. Organic energy, documentary feel. Limited by camera weight—heavy cameras cause fatigue.',
    'Steadicam': 'Vest-mounted stabilizer. Smooth floating movement. Classic long takes (Goodfellas hallway). Requires trained operator.',
    'Gimbal': 'Electronic 3-axis stabilizer. Modern alternative to Steadicam. Weight-limited, typically under 3kg.',
    'Dolly': 'Wheeled platform on track. Precise, repeatable moves. Essential for Dolly Zoom (Vertigo effect).',
    'Crane': 'Elevated arm for sweeping vertical moves. Dramatic reveals, establishing shots. Requires setup time.',
    'Jib': 'Smaller crane arm. Crane-style moves in tighter spaces. More portable than full crane.',
    'Technocrane': 'Telescoping crane with remote head. Complex compound moves. High-end commercial/film standard.',
    'Drone': 'Aerial platform. Sweeping establishing shots, impossible angles. Weight-limited, outdoor-preferred.',
  },
  
  // Movement Types - cinematographic intent
  movement_type: {
    'Static': 'No camera movement. Lets blocking and performance drive energy. Theatre-derived staging.',
    'Pan': 'Horizontal rotation on tripod head. Follows action left-right. Reveals space laterally.',
    'Tilt': 'Vertical rotation on tripod head. Reveals height, follows vertical action.',
    'Track_In': 'Camera moves toward subject. Increases intimacy, reveals detail. Push-in intensifies moment.',
    'Track_Out': 'Camera moves away from subject. Reveals context, creates distance. Pull-out diminishes subject.',
    'Arc': 'Camera orbits around subject. Adds dimensionality, shows all sides. Dynamic without cutting.',
    'Crane_Up': 'Camera rises vertically. Triumphant, revelatory. Often ends establishing shots.',
    'Crane_Down': 'Camera descends. Arrival, focus narrowing. Often begins scenes with overview.',
    'Dolly_Zoom': 'Vertigo effect: dolly + opposing zoom. Disorientation, realization. Requires Dolly or Slider equipment.',
  },
  
  // Timing - pacing impact
  movement_timing: {
    'Static': 'No movement—camera holds position. Contemplative, observational.',
    'Very_Slow': 'Extremely deliberate pace. Meditative, hypnotic. Art cinema, contemplative sequences.',
    'Slow': 'Deliberate, meditative pace. Builds atmosphere, prolongs tension. Tarkovsky, slow cinema.',
    'Moderate': 'Natural conversational pace. Unobtrusive, standard coverage.',
    'Fast': 'Energetic, urgent movement. Action sequences, chase scenes. Can be disorienting if excessive.',
    'Whip_Fast': 'Ultra-rapid whip pans/tilts. Comedic timing, sudden reveals. Wes Anderson, Edgar Wright.',
  },
  
  // Time of Day - lighting implications
  time_of_day: {
    'Dawn': 'Pre-sunrise. Cool blue ambient transitioning to warm. Quiet, hopeful, new beginnings.',
    'Morning': 'Low warm sun angle. Long shadows. Fresh energy. Soft backlight opportunities.',
    'Midday': 'Harsh overhead sun. High contrast, strong shadows. Challenging for faces. Use fill or find shade.',
    'Afternoon': 'Sun lowering. Warmer tones beginning. Most flexible natural light window.',
    'Golden_Hour': 'Magic hour near sunset. Warm, soft, directional. Cinematographer\'s favorite. Brief window.',
    'Blue_Hour': 'Post-sunset twilight. Cool ambient with artificial lights gaining prominence. Magical quality.',
    'Dusk': 'Transition to night. Mixed natural/artificial. Nostalgic, end-of-day feeling.',
    'Night': 'After dark. Requires artificial sources. High drama potential. No sun available.',
  },
  
  // Lighting Source - light character
  lighting_source: {
    'Sun': 'Natural daylight. Hard source, warm. Unavailable at night. Golden hour = soft; midday = harsh.',
    'Moon': 'Night ambience. Typically simulated with HMI + diffusion. Cool blue cast. Low level.',
    'Tungsten': 'Classic incandescent. Warm 3200K. Traditional film lighting. Softens with diffusion.',
    'HMI': 'Daylight-balanced arcs. High output, can simulate sun through windows. Available since 1972.',
    'LED': 'Modern solid-state. Variable color temperature, low power. Available widespread since ~2002.',
    'Kino_Flo': 'Fluorescent tubes designed for film. Soft, even. Available since 1987. Portrait favorite.',
    'Neon': 'Practical neon tubes. Colored accent light. Cyberpunk, noir aesthetic.',
    'Practical': 'In-frame light sources—lamps, signs, screens. Motivated light. Adds realism.',
    'Mixed': 'Multiple source types. Complex setups. Color temperature mismatches can be stylistic.',
  },
  
  // Lighting Style - contrast and mood
  lighting_style: {
    'High_Key': 'Bright, even lighting. Minimal shadows. Comedies, sitcoms, commercials. Upbeat mood.',
    'Low_Key': 'High contrast, deep shadows. Noir, thriller. Cannot achieve at midday without blackout.',
    'Soft': 'Diffused sources, gentle gradients. Flattering for faces. Romantic, dreamy.',
    'Hard': 'Direct sources, sharp shadows. Dramatic, edgy. Can be unflattering.',
    'Naturalistic': 'Motivated by scene logic. Windows provide light because windows exist. Subtle intervention.',
    'Expressionistic': 'Stylized beyond realism. Colored gels, unusual angles. Horror, fantasy, music video.',
    'Chiaroscuro': 'Renaissance painting style. Strong directional light, deep black shadows. Caravaggio influence.',
  },
  
  // Shot Sizes - visual storytelling
  shot_size: {
    'EWS': 'Extreme Wide Shot. Vast landscapes, establishing scale. Subject tiny in frame. Best with 14-24mm.',
    'WS': 'Wide Shot. Full environment context. Subject head-to-toe with surroundings.',
    'MWS': 'Medium Wide Shot. Subject with significant environment. Waist-up with room around.',
    'MS': 'Medium Shot. Waist-up framing. Dialogue standard. Balances face and gesture.',
    'MCU': 'Medium Close-Up. Chest-up framing. Emotional emphasis while showing some body language.',
    'CU': 'Close-Up. Face fills frame. Maximum emotional impact. Typically 50-100mm lens.',
    'BCU': 'Big Close-Up. Eyes to chin. Intense, intimate. Reveals micro-expressions.',
    'ECU': 'Extreme Close-Up. Single feature (eye, mouth, hand). Abstract, hyper-detailed. Best with 85-135mm.',
    'OTS': 'Over-The-Shoulder. Conversation framing with foreground shoulder. Establishes spatial relationship.',
    'POV': 'Point-of-View. Through character\'s eyes. Subjective experience. Often handheld.',
  },
  
  // Composition - framing principles
  composition: {
    'Rule_of_Thirds': 'Subject on grid intersections. Dynamic, natural-feeling. Most common technique.',
    'Centered': 'Subject dead center. Formal, confrontational. Wes Anderson, Stanley Kubrick.',
    'Symmetrical': 'Mirror-balanced frame. Order, stability, unease (context-dependent).',
    'Asymmetrical': 'Intentionally unbalanced. Tension, instability. Weight on one side.',
    'Negative_Space': 'Large empty areas. Isolation, loneliness, anticipation. Subject small in frame.',
    'Leading_Lines': 'Environmental lines draw eye to subject. Roads, hallways, architecture.',
  },
  
  // Mood - emotional tone
  mood: {
    // Light/Positive Moods
    'Cheerful': 'Light, happy, optimistic. Requires bright lighting—incompatible with Low-Key.',
    'Happy': 'Joyful, upbeat energy. High-key lighting, warm colors. Feel-good moments.',
    'Hopeful': 'Aspirational, forward-looking. Often warm tones, rising camera moves.',
    'Whimsical': 'Playful, quirky. Unusual angles, bright colors. Wes Anderson territory.',
    'Adventurous': 'Excitement and discovery. Dynamic movement, expansive framing.',
    
    // Romantic Moods
    'Romantic': 'Intimate, warm. Soft lighting, close framing. Golden hues.',
    'Sensual': 'Physical intimacy emphasized. Close framing, shallow focus, warm tones.',
    'Passionate': 'Intense emotional/physical connection. Dynamic, warm, urgent.',
    'Intimate': 'Personal, close. Quiet moments, private spaces.',
    
    // Melancholic/Contemplative Moods
    'Melancholic': 'Sad but beautiful. Muted colors, soft light. Autumnal feel.',
    'Somber': 'Grave, serious tone. Muted palette, measured pacing.',
    'Reflective': 'Looking inward or back. Often static, natural light.',
    'Contemplative': 'Thoughtful, introspective. Slow pacing, quiet moments.',
    'Introspective': 'Internal focus. Close-ups, negative space, silence.',
    'Tender': 'Gentle emotional vulnerability. Soft light, close framing.',
    'Bittersweet': 'Joy tinged with sadness. Warm but muted. Nostalgic undertones.',
    'Nostalgic': 'Warm recollection. Often sepia or warm desaturated. Period feel.',
    'Serene': 'Peaceful, calm. Static or slow movement. Balanced composition.',
    
    // Surreal/Altered States
    'Surreal': 'Dream-like, illogical. Unusual angles, unexpected lighting.',
    'Dreamlike': 'Soft, ethereal. Diffusion, bloom. Often overexposed edges.',
    'Hallucinatory': 'Distorted reality. Warped visuals, unstable framing, vivid colors.',
    'Transcendent': 'Beyond ordinary experience. Ethereal light, expansive space.',
    'Meditative': 'Deeply calm, trance-like. Minimal movement, extended takes.',
    'Philosophical': 'Contemplating existence. Often static, faces in thought.',
    'Psychedelic': 'Altered consciousness. Saturated colors, distortion, disorientation.',
    
    // Dark/Thriller Moods
    'Gloomy': 'Persistent darkness. Low-key required. Minimal color.',
    'Menacing': 'Active threat present. Low angles, shadows encroaching.',
    'Oppressive': 'Suffocating pressure. Tight framing, heavy shadows, claustrophobic.',
    'Paranoid': 'Threatened from all sides. Wide angles, looking around.',
    'Tense': 'Building pressure. Tight framing, restricted movement.',
    'Anxious': 'Uncomfortable uncertainty. Handheld, tight, distorted.',
    'Claustrophobic': 'Trapped, no escape. Tight spaces, close walls, shallow depth.',
    'Brutal': 'Harsh, unforgiving violence. Hard light, stark framing.',
    'Traumatic': 'Psychological damage. Fragmented, unstable, overwhelming.',
    'Unsettling': 'Something wrong but unclear. Slightly off framing, odd timing.',
    'Ominous': 'Impending doom. Low angles, heavy shadows.',
    'Suspenseful': 'Anticipating threat. Slow reveals, sound design crucial.',
    'Mysterious': 'Intriguing unknowns. Shadows, partial reveals. Cool or neutral tones.',
    'Haunting': 'Lingering unease. Cool tones, slow drift.',
    'Bleak': 'Hopeless emptiness. Desaturated, harsh environments.',
    'Tragic': 'Profound loss. Often static, allowing weight to settle.',
    'Lonely': 'Isolation emphasized. Negative space, single subjects.',
    
    // Aggressive/Action Moods
    'Aggressive': 'Confrontational energy. Fast movement, tight angles.',
    'Angry': 'Visible rage. Tight close-ups, red accents, unstable framing.',
    'Rebellious': 'Defiant energy. Dutch angles, punk aesthetic, bold choices.',
    'Kinetic': 'Pure motion energy. Fast cuts, dynamic camera, action-driven.',
    'Urgent': 'Time-critical pressure. Fast pacing, close framing, breathless.',
    'Provocative': 'Deliberately challenging. Bold framing, direct confrontation.',
    'Unhinged': 'Lost control. Erratic movement, unpredictable framing.',
    'Chaotic': 'Disorder and confusion. Handheld, rapid cutting.',
    'Frantic': 'Desperate urgency. Fast, unstable, breathless.',
    'Intense': 'High stakes focus. Close, direct, immediate.',
    
    // Noir/Hardboiled
    'Noir': 'Classic film noir aesthetic. High contrast, shadows, morally ambiguous.',
    'Hardboiled': 'Tough, cynical detective fiction. Urban night, practical lighting.',
    'Fatalistic': 'Inevitable doom accepted. Static, resigned framing.',
    'Cynical': 'Distrustful, world-weary. Cool tones, detached framing.',
    'World_Weary': 'Exhausted by experience. Heavy, slow, desaturated.',
    
    // Gothic/Horror
    'Gothic': 'Dark romanticism. Architecture, shadows, supernatural undertones.',
    'Macabre': 'Death and decay fascination. Shadow, texture, unsettling beauty.',
    'Grotesque': 'Distorted, disturbing forms. Wide angles, harsh light.',
    'Eldritch': 'Cosmic, unknowable horror. Vast scale, alien geometry.',
    'Dread': 'Paralyzing fear of what comes. Static, inevitable approach.',
    
    // Documentary/Realistic
    'Documentary': 'Observational realism. Natural light, handheld, unobtrusive.',
    'Realistic': 'Naturalistic presentation. Motivated lighting, believable blocking.',
    'Observational': 'Fly-on-wall perspective. Distance, patience, non-intervention.',
    'Journalistic': 'News/reportage style. Handheld, available light, urgent.',
    'Verite': 'Cinema verite—truth of the moment. Raw, unpolished, authentic.',
    
    // Epic/Scale
    'Epic': 'Grand scale. Wide shots, sweeping movements, orchestral feel.',
  },
  
  // Color Tone - color grading
  color_tone: {
    'Warm_Saturated': 'Rich, vivid warm colors. Energetic, inviting. Summer, nostalgia.',
    'Warm_Desaturated': 'Muted warm tones. Period films, memory sequences. Sepia influence.',
    'Cool_Saturated': 'Vivid blues and cyans. Sci-fi, night exteriors. Electric feel.',
    'Cool_Desaturated': 'Muted blues. Noir, thriller, depression. Clinical or bleak.',
    'Neutral_Saturated': 'Balanced vivid colors. Commercials, bright films.',
    'Neutral_Desaturated': 'Muted neutral palette. Documentary, realism. Low intervention.',
    'Monochrome': 'Black and white. Classic, graphic, timeless. Bold artistic choice.',
    'Sepia': 'Brown-toned monochrome. Historical, aged, nostalgic.',
    'Teal_Orange': 'Complementary color grade. Blockbuster look. Skin pops against teal shadows.',
  },
  
  // Lens Families - optical character
  lens_family: {
    'ARRI_Signature_Prime': 'Modern LF lenses. Clean with subtle character. Gentle fall-off. Current ARRI flagship.',
    'ARRI_Master_Prime': 'Ultra-sharp S35 lenses. Clinical precision. High contrast. Technical perfection.',
    'ARRI_Ultra_Prime': 'Compact S35 primes. Neutral rendering. Documentary and narrative workhorse.',
    'ARRI_Prime_65': '65mm format lenses for Alexa 65. Cinema-scale optics. XPL mount. Used on Roma, The Revenant.',
    'ARRI_Prime_DNA': 'DNA Large Format lenses. Organic character with modern resolution. Beautiful flares. Used on Parasite.',
    'Zeiss_Supreme_Prime': 'Modern high-speed LF lenses. Smooth bokeh, gentle flares. Clean aesthetic.',
    'Zeiss_Master_Prime': 'S35 reference standard. Maximum sharpness. Minimal distortion.',
    'Zeiss_CP3': 'Compact primes. Good value, solid performance. Indie production favorite.',
    'Cooke_S7': 'Full-frame Cooke Look. Warm skin tones, gentle rolloff. Organic character.',
    'Cooke_S4': 'Classic S35 primes. The definitive Cooke Look. Slight warmth, beautiful faces.',
    'Cooke_Panchro': 'Vintage rehoused classics. Period character. Soft, romantic.',
    'Panavision_Primo': 'Hollywood standard S35. Exclusive ecosystem. Pristine but characterful.',
    'Panavision_Primo_70': '65mm format coverage. For Alexa 65 and large format. Epic scale optics.',
    'Panavision_C_Series': 'Compact anamorphic. Squeezed 2x. Classic anamorphic flares and bokeh.',
    'Angenieux_Optimo': 'Premium zoom lenses. Rare prime-like zoom quality. Versatile focal ranges.',
    'Leica_Summicron_C': 'Cinema rehoused Leicas. Legendary Leica rendering. Subtle micro-contrast.',
    'Leica_Summilux_C': 'Fast Leica cine primes. Faster than Summicron. More bokeh potential.',
    'Canon_Sumire': 'Warm, organic primes. Intended for digital cinema. Pleasing skin tones.',
    'Sony_CineAlta': 'Matched to Venice cameras. Optimized for Sony color science.',
    'Sigma_Cine': 'High-value cine lenses. Sharp, modern. Excellent cost-performance.',
  },
  
  // Animation - Medium
  animation_medium: {
    '2D': 'Traditional flat animation. Hand-drawn or digital. Classic anime, Disney, independent animation.',
    '3D': 'Computer-generated 3D. Full dimensional lighting and camera freedom. Pixar, modern features.',
    'Hybrid': 'Mix of 2D and 3D elements. 3D backgrounds with 2D characters, or vice versa. Spider-Verse style.',
    'StopMotion': 'Physical puppets/models photographed frame-by-frame. Laika, Aardman. Tactile, handcrafted.',
  },
  
  // Animation - Style Domains
  style_domain: {
    'Anime': 'Japanese animation tradition. 2D/hybrid. Expressive, stylized. Limited to full animation range.',
    'Manga': 'Japanese comic style. Static, monochrome only. High contrast ink aesthetic. No motion.',
    'ThreeD': '3D computer animation. Dimensional lighting required. Smooth to exaggerated motion.',
    'Illustration': 'Static artwork. Single frame presentation. No motion, locked frame only.',
  },
  
  // Animation - Line Treatment
  line_treatment: {
    'Clean': 'Smooth, uniform outlines. Professional anime standard. Digital precision.',
    'Sketchy': 'Rough, hand-drawn appearance. Artistic, unpolished charm. Indie aesthetic.',
    'Bold': 'Thick, prominent outlines. High contrast, graphic impact. Cartoon/comic style.',
    'Thin': 'Delicate, fine lines. Detailed, elegant. Illustration quality.',
    'Variable': 'Line weight varies with pressure/form. Dynamic, expressive. Traditional art feel.',
    'None': 'No outlines (lineless). Shapes defined by color only. 3D or painterly styles.',
  },
  
  // Animation - Color Application
  color_application: {
    'Cel': 'Traditional anime cel coloring. Flat colors with hard shadows. Classic look.',
    'Gradient': 'Smooth color transitions. Softer, more dimensional than cel.',
    'Watercolor': 'Painted, textured appearance. Artistic, handcrafted feel.',
    'Flat': 'Solid colors, no shading. Graphic design influence. Bold, simple.',
    'Textured': 'Surface texture in color fills. Adds tactile quality.',
    'Monochrome': 'Single color or grayscale. Stylistic choice for color animation.',
    'Monochrome_Ink': 'Black and white ink style. Required for Manga domain.',
  },
  
  // Animation - Lighting Model
  lighting_model: {
    'Flat': 'No dimensional shading. Graphic, 2D. Cannot use for 3D domain.',
    'Cel_Shaded': 'Hard shadow edges. Anime standard. Stylized dimensionality.',
    'Soft_Shaded': 'Smooth shadow gradients. More realistic while still stylized.',
    'Naturalistic_Simulated': 'Realistic light behavior simulated in 2D. Complex, labor-intensive.',
    'Raytraced': 'Physically accurate 3D lighting. Photorealistic. Not for anime style.',
  },
  
  // Animation - Surface Detail
  surface_detail: {
    'Smooth': 'Clean, untextured surfaces. Classic anime look. Fast to render.',
    'Textured': 'Subtle surface variation. Adds visual interest without overwhelming.',
    'Detailed': 'Rich surface complexity. Fabric weave, skin pores, material specifics.',
    'Photoreal': 'Photorealistic surface rendering. Full material simulation. 3D only.',
    'Stylized': 'Artistic interpretation of surfaces. Hand-painted textures, illustrative.',
  },
  
  // Animation - Motion Style
  motion_style: {
    'None': 'Static image. No animation. Required for Manga and Illustration domains.',
    'Limited': 'Traditional anime efficiency. 8-12 fps on twos/threes. Strategic movement.',
    'Full': 'Full animation. 24 fps on ones. Disney-quality. High budget.',
    'Exaggerated': 'Beyond reality. Squash and stretch. Cartoon physics.',
    'Snappy': 'Quick, punchy timing. Modern digital animation trend.',
    'Fluid': 'Smooth, continuous motion. Graceful, flowing. High frame count.',
  },
  
  // Animation - Virtual Camera
  virtual_camera: {
    'Locked': 'Static frame. No camera movement. Required for Manga/Illustration.',
    'Digital_Pan': 'Horizontal digital movement across artwork. Classic anime technique.',
    'Digital_Zoom': 'Scale change on artwork. Ken Burns effect. Creates depth illusion.',
    'Parallax': 'Layered movement at different speeds. Creates depth in 2D.',
    'Free_3D': 'Full 3D camera movement. Requires 3D medium.',
    'Simulated_Handheld': 'Artificial shake/drift. Adds documentary feel. Not for anime.',
    'Motion_Comic': 'Panel-to-panel reveals. Comic book presentation style.',
  },
};

// =============================================================================
// FIELD DESCRIPTIONS
// Educational tooltips for dropdown field LABELS (not options)
// Explain what each field is for, helping users understand the system
// =============================================================================

const FIELD_DESCRIPTIONS: Record<string, string> = {
  // === LIVE-ACTION FIELDS ===
  
  // Camera Section
  camera_manufacturer: 'Camera brand. ARRI, RED, and Sony dominate professional cinema. Each has unique color science and sensor technology.',
  camera_body: 'The specific camera model. Determines sensor size (S35, Full Frame, 65mm), resolution, weight class, and compatible lens mounts.',
  
  // Lens Section
  lens_manufacturer: 'Lens brand. Each manufacturer has a signature rendering style—Cooke is warm, Zeiss is clinical, ARRI is balanced.',
  lens_family: 'The lens series. Different families have different optical character, coverage (S35 vs Full Frame), and focal length options.',
  focal_length: 'Lens focal length in millimeters. Wide (14-24mm) for environments, Normal (35-50mm) for natural look, Long (85-135mm) for close-ups.',
  anamorphic: 'Anamorphic lenses squeeze a wider field of view onto the sensor, creating the classic widescreen look with oval bokeh and horizontal flares.',
  
  // Movement Section
  movement_equipment: 'Physical support system. Determines what camera movements are possible. Heavy cameras restrict to Tripod/Dolly/Crane.',
  movement_type: 'The specific camera move. Each creates different emotional effects—push-in intensifies, pull-out reveals context.',
  movement_timing: 'Speed of camera movement. Slow builds atmosphere, Fast adds energy. Dolly Zoom requires slower timing for effect.',
  
  // Lighting Section
  time_of_day: 'Scene time setting. Determines available natural light and shadows. Night eliminates Sun as a source option.',
  lighting_source: 'Primary light source in the scene. Filtered by time of day and era—no LED before 2002, no Sun at night.',
  lighting_style: 'Overall lighting approach. High-Key is bright/even (comedy), Low-Key is dark/contrasty (noir). Some moods restrict options.',
  
  // Visual Grammar Section (Live-Action)
  shot_size: 'How much of the subject fills the frame. Wide shots establish environment, close-ups show emotion and detail.',
  composition: 'Frame arrangement principles. Rule of Thirds is most common, Centered is formal/confrontational (Kubrick, Anderson).',
  mood: 'Emotional tone of the shot. Some presets restrict moods—Blade Runner blocks Cheerful, etc. Affects lighting compatibility.',
  color_tone: 'Color grading direction. Warm/Cool temperature and Saturated/Desaturated intensity. Sets the emotional palette.',
  
  // === ANIMATION FIELDS ===
  
  // Style Section
  animation_medium: '2D (traditional/digital flat) or 3D (computer generated). Affects available rendering and camera options.',
  style_domain: 'Animation tradition. Anime (Japanese 2D), Manga (static comics), 3D (Pixar-style), or Illustration (single frame art).',
  
  // Rendering Section
  line_treatment: 'How outlines are rendered. Anime typically uses clean dark lines, 3D may have no lines (lineless) or stylized edges.',
  color_application: 'How color fills shapes. Cel = flat with hard shadows, Gradient = smooth transitions. Manga must be Monochrome_Ink.',
  lighting_model: 'How light/shadow is represented. Flat = no shading, Cel_Shaded = hard shadows, Raytraced = photorealistic (3D only).',
  surface_detail: 'Texture complexity. Minimal for clean anime look, Detailed for complex surfaces. Affects rendering style.',
  
  // Motion Section
  motion_style: 'Animation approach. Limited = efficient 12fps (anime), Full = 24fps fluid (Disney). Manga/Illustration must be None.',
  virtual_camera: 'Camera movement in animation. 2D uses pans/zooms over artwork, 3D has free movement. Static domains require Locked.',
};

// =============================================================================
// FILTERING HELPER FUNCTIONS
// =============================================================================

/** Get camera body options filtered by manufacturer and camera type */
function getCameraBodyOptionsWithReasons(manufacturer: string, cameraType: 'Digital' | 'Film' = 'Digital'): OptionWithReason[] {
  const manufacturerBodies = MANUFACTURER_CAMERA_BODIES[manufacturer] || [];
  
  // Use the correct body list based on camera type
  const bodyList = cameraType === 'Film' ? ENUMS.camera_body_film : ENUMS.camera_body;
  
  return bodyList.map(body => {
    const description = OPTION_DESCRIPTIONS.camera_body?.[body];
    
    // Check if this body belongs to the selected manufacturer
    if (manufacturerBodies.length > 0 && !manufacturerBodies.includes(body)) {
      // Find the actual manufacturer of this body
      const actualManufacturer = Object.entries(MANUFACTURER_CAMERA_BODIES)
        .find(([_, bodies]) => bodies.includes(body))?.[0] || 'another manufacturer';
      return { 
        value: body, 
        disabled: true, 
        reason: `${CAMERA_BODY_NAMES[body] || body.replace(/_/g, ' ')} is made by ${actualManufacturer}, not ${manufacturer}.`,
        description 
      };
    }
    return { value: body, disabled: false, description };
  });
}

/** Get equipment options with disabled reasons for tooltips */
function getEquipmentOptionsWithReasons(cameraBody: string, movementType: string): OptionWithReason[] {
  const weight = CAMERA_WEIGHTS[cameraBody] || 'Medium';
  const requiredEquipment = MOVEMENT_EQUIPMENT_REQUIREMENTS[movementType];
  
  return ENUMS.movement_equipment.map(eq => {
    const description = OPTION_DESCRIPTIONS.movement_equipment?.[eq];
    
    // Check camera weight restriction
    if (weight === 'Heavy' && HEAVY_RESTRICTED_EQUIPMENT.includes(eq)) {
      return { 
        value: eq, 
        disabled: true, 
        reason: `⛔ ${CAMERA_BODY_NAMES[cameraBody] || cameraBody} (~${weight === 'Heavy' ? '>4kg' : '3-4kg'}) exceeds ${eq} weight limit. ${eq} typically supports <${eq === 'Drone' ? '3kg' : '4kg'} payloads.`,
        description 
      };
    }
    // Check movement type requirement
    if (requiredEquipment && !requiredEquipment.includes(eq)) {
      return { 
        value: eq, 
        disabled: true, 
        reason: `⛔ ${movementType} requires ${requiredEquipment.join(' or ')}—physically impossible with ${eq}.`,
        description 
      };
    }
    return { value: eq, disabled: false, description };
  });
}

/** Get movement type options with disabled reasons for tooltips */
function getMovementTypeOptionsWithReasons(equipment: string): OptionWithReason[] {
  const allowed = EQUIPMENT_MOVEMENT_RESTRICTIONS[equipment] || ENUMS.movement_type;
  
  return ENUMS.movement_type.map(mt => {
    const description = OPTION_DESCRIPTIONS.movement_type?.[mt];
    
    if (!allowed.includes(mt)) {
      // Provide specific reason based on equipment limitation
      let reason = `⛔ ${equipment} cannot perform ${mt}—`;
      if (equipment === 'Static') {
        reason += 'static mount has no movement capability.';
      } else if (equipment === 'Handheld') {
        reason += 'handheld is limited to pan/tilt rotations.';
      } else if (equipment === 'Crane' || equipment === 'Jib') {
        reason += 'arm-based equipment cannot track horizontally.';
      } else if (equipment === 'Dolly') {
        reason += 'dolly can only track (forward/back), not lift.';
      } else if (equipment === 'Drone') {
        reason += 'drone movement is primarily aerial translation.';
      } else {
        reason += `physically limited by ${equipment} mechanics.`;
      }
      return { value: mt, disabled: true, reason, description };
    }
    return { value: mt, disabled: false, description };
  });
}

/** Get lighting source options with disabled reasons for tooltips */
function getLightingSourceOptionsWithReasons(
  timeOfDay: string, 
  disallowedSources: string[],
  presetYear?: number,
  presetName?: string
): OptionWithReason[] {
  const timeAllowed = TIME_SOURCE_RESTRICTIONS[timeOfDay];
  const anachronistic = presetYear ? getAnachronisticSourcesForYear(presetYear) : [];
  
  return ENUMS.lighting_source.map(source => {
    const description = OPTION_DESCRIPTIONS.lighting_source?.[source];
    
    // Check time of day restriction
    if (timeAllowed && !timeAllowed.includes(source)) {
      if (source === 'Sun' && (timeOfDay === 'Night' || timeOfDay === 'Blue_Hour')) {
        return { 
          value: source, 
          disabled: true, 
          reason: `⛔ Sun is below horizon at ${timeOfDay.replace(/_/g, ' ')}—physically impossible as primary source.`,
          description 
        };
      }
      if (source === 'Moon' && timeOfDay === 'Midday') {
        return { 
          value: source, 
          disabled: true, 
          reason: `⛔ Moonlight is too faint to compete with midday sun—would be invisible.`,
          description 
        };
      }
      return { value: source, disabled: true, reason: `⛔ ${source} unavailable at ${timeOfDay.replace(/_/g, ' ')}.`, description };
    }
    // Check preset disallowed sources
    if (disallowedSources.includes(source)) {
      return { 
        value: source, 
        disabled: true, 
        reason: `⛔ ${source} conflicts with ${presetName || 'preset'} aesthetic—would break period/style consistency.`,
        description 
      };
    }
    // Check era anachronism
    if (anachronistic.includes(source)) {
      const inventionYear = ERA_LIGHTING_ANACHRONISMS[source];
      return { 
        value: source, 
        disabled: true, 
        reason: `⛔ ${source} technology didn't exist in ${presetYear}—invented ${inventionYear}. Would be historically anachronistic.`,
        description 
      };
    }
    return { value: source, disabled: false, description };
  });
}

/** Get lighting style options with disabled reasons for tooltips */
function getLightingStyleOptionsWithReasons(timeOfDay: string, mood?: string): OptionWithReason[] {
  const timeAllowed = TIME_STYLE_RESTRICTIONS[timeOfDay];
  const moodRestriction = mood ? MOOD_LIGHTING_RESTRICTIONS[mood] : null;
  
  return ENUMS.lighting_style.map(style => {
    const description = OPTION_DESCRIPTIONS.lighting_style?.[style];
    
    // Check time-of-day restrictions first (hard physical constraint)
    if (timeAllowed && !timeAllowed.includes(style)) {
      if (style === 'Low_Key' && timeOfDay === 'Midday') {
        return { 
          value: style, 
          disabled: true, 
          reason: `⛔ Low-Key requires controlled darkness—midday sun floods scene with ambient light. Need blackout or interior.`,
          description 
        };
      }
      return { value: style, disabled: true, reason: `⛔ ${style} not achievable at ${timeOfDay.replace(/_/g, ' ')}.`, description };
    }
    
    // Check mood restrictions (tonal coherence constraint)
    if (mood && moodRestriction?.disallowed.includes(style)) {
      return { 
        value: style, 
        disabled: true, 
        reason: `⛔ ${style.replace(/_/g, ' ')} creates tonal dissonance with "${mood}" mood—shadows and contrast undermine ${mood.toLowerCase()} emotional intent.`,
        description 
      };
    }
    
    return { value: style, disabled: false, description };
  });
}

/** Get timing options with disabled reasons for tooltips (e.g., Dolly Zoom requires slow timing) */
function getTimingOptionsWithReasons(movementType: string): OptionWithReason[] {
  const allowedTimings = MOVEMENT_TYPE_TIMING_RESTRICTIONS[movementType];
  
  return ENUMS.movement_timing.map(timing => {
    const description = OPTION_DESCRIPTIONS.movement_timing?.[timing];
    
    // If this movement type has timing restrictions and this timing isn't allowed
    if (allowedTimings && !allowedTimings.includes(timing)) {
      if (movementType === 'Dolly_Zoom') {
        return { 
          value: timing, 
          disabled: true, 
          reason: `⛔ Dolly Zoom (Vertigo effect) at ${timing.replace(/_/g, ' ')} speed is disorienting—the simultaneous zoom/dolly becomes unreadable. Use Slow or Moderate for the effect to register psychologically.`,
          description 
        };
      }
      return { 
        value: timing, 
        disabled: true, 
        reason: `⛔ ${timing.replace(/_/g, ' ')} is too fast for ${movementType.replace(/_/g, ' ')}.`,
        description 
      };
    }
    return { value: timing, disabled: false, description };
  });
}

/** Get mood options with disabled reasons for tooltips */
function getMoodOptionsWithReasons(disallowedMoods: string[], presetName?: string): OptionWithReason[] {
  return ENUMS.mood.map(mood => {
    const description = OPTION_DESCRIPTIONS.mood?.[mood];
    
    if (disallowedMoods.includes(mood)) {
      return { 
        value: mood, 
        disabled: true, 
        reason: `⛔ "${mood}" conflicts with ${presetName || 'preset'}'s visual language—would create tonal dissonance.`,
        description 
      };
    }
    return { value: mood, disabled: false, description };
  });
}

/** Get animation mood options with recommendations based on preset */
function getAnimationMoodOptionsWithReasons(recommendedMoods: string[], presetName?: string): OptionWithReason[] {
  return ENUMS.mood.map(mood => {
    const description = OPTION_DESCRIPTIONS.mood?.[mood];
    
    // If preset has recommended moods, highlight them and soft-warn on others
    if (recommendedMoods.length > 0) {
      if (recommendedMoods.includes(mood)) {
        return { 
          value: mood, 
          disabled: false, 
          reason: `✓ Recommended for ${presetName || 'this style'}—aligns with the preset's visual identity.`,
          description 
        };
      } else {
        // Not recommended but not blocked - soft warning
        return { 
          value: mood, 
          disabled: false, 
          reason: `ℹ Not typical for ${presetName || 'this style'}. Recommended moods: ${recommendedMoods.join(', ')}.`,
          description 
        };
      }
    }
    return { value: mood, disabled: false, description };
  });
}

/** Get lens family options with disabled reasons for tooltips */
function getLensFamilyOptionsWithReasons(cameraBody: string, lensManufacturer?: string): OptionWithReason[] {
  const sensorFormat = CAMERA_SENSOR_FORMAT[cameraBody];
  const cameraMount = CAMERA_MOUNT[cameraBody];
  const specialRule = CAMERA_LENS_SPECIAL_RULES[cameraBody];
  const manufacturerFamilies = lensManufacturer ? MANUFACTURER_LENS_FAMILIES[lensManufacturer] : null;
  
  return ENUMS.lens_family.map(family => {
    const description = OPTION_DESCRIPTIONS.lens_family?.[family];
    
    // Check manufacturer filter first (if a manufacturer is selected)
    if (manufacturerFamilies && !manufacturerFamilies.includes(family)) {
      // Get the actual manufacturer of this family
      const actualManufacturer = Object.entries(MANUFACTURER_LENS_FAMILIES)
        .find(([_, families]) => families.includes(family))?.[0];
      return { 
        value: family, 
        disabled: true, 
        reason: `⛔ ${LENS_FAMILY_NAMES[family] || family.replace(/_/g, ' ')} is made by ${actualManufacturer}, not ${lensManufacturer}. Change manufacturer filter to use these lenses.`,
        description 
      };
    }
    
    // Check special rules (e.g., Alexa 65 requires Primo 70)
    if (specialRule?.required_families && !specialRule.required_families.includes(family)) {
      return { 
        value: family, 
        disabled: true, 
        reason: `⛔ ${CAMERA_BODY_NAMES[cameraBody] || cameraBody}'s ${sensorFormat} sensor (65mm) requires specialized large-format optics. Only ${specialRule.required_families.map(f => LENS_FAMILY_NAMES[f] || f).join(', ')} covers this format.`,
        description 
      };
    }
    
    // Check sensor coverage
    const coverage = LENS_COVERAGE[family];
    if (coverage) {
      if (sensorFormat === '65mm' && !coverage.includes('65mm')) {
        return { 
          value: family, 
          disabled: true, 
          reason: `⛔ ${LENS_FAMILY_NAMES[family] || family.replace(/_/g, ' ')} cannot cover 65mm sensor—would vignette severely. Designed for ${coverage.join('/')}.`,
          description 
        };
      }
      if (sensorFormat === 'LF' && !coverage.includes('LF') && !coverage.includes('FF')) {
        return { 
          value: family, 
          disabled: true, 
          reason: `⛔ ${LENS_FAMILY_NAMES[family] || family.replace(/_/g, ' ')} is S35-only—would show dark corners (vignette) on Large Format sensor.`,
          description 
        };
      }
    }
    
    // Check mount compatibility
    const lensMounts = LENS_MOUNT[family];
    if (lensMounts && cameraMount) {
      // Check if mount is compatible
      const isCompatible = 
        lensMounts.includes(cameraMount) ||
        (cameraMount === 'LPL' && lensMounts.includes('PL')) ||
        (cameraMount === 'RF' && lensMounts.includes('PL')) ||
        (cameraMount === 'E' && (lensMounts.includes('PL') || lensMounts.includes('E')));
      
      if (!isCompatible) {
        return { 
          value: family, 
          disabled: true, 
          reason: `⛔ ${LENS_FAMILY_NAMES[family] || family.replace(/_/g, ' ')} uses ${lensMounts.join('/')} mount—incompatible with ${CAMERA_BODY_NAMES[cameraBody] || cameraBody}'s ${cameraMount} mount without adapter.`,
          description 
        };
      }
    }
    
    return { value: family, disabled: false, description };
  });
}

/** Get focal length options with disabled reasons for tooltips */
function getFocalLengthOptionsWithReasons(lensFamily: string): OptionWithReason[] {
  const availableFocals = LENS_FOCAL_LENGTHS[lensFamily];
  
  return ENUMS.focal_length_mm.map(focal => {
    // Generate description based on focal length characteristics
    let description = '';
    if (focal <= 18) {
      description = `Ultra-wide ${focal}mm. Dramatic perspective, environment emphasis. Distorts faces up close.`;
    } else if (focal <= 28) {
      description = `Wide ${focal}mm. Environmental context with subject. Some perspective distortion.`;
    } else if (focal <= 40) {
      description = `Normal ${focal}mm. Close to human vision. Versatile, neutral perspective.`;
    } else if (focal <= 65) {
      description = `Standard ${focal}mm. Classic portrait range begins. Flattering for faces.`;
    } else if (focal <= 100) {
      description = `Portrait ${focal}mm. Compressed perspective, beautiful bokeh. Intimate close-ups.`;
    } else {
      description = `Telephoto ${focal}mm. Strong compression, shallow depth. Surveillance, sports, intimate detail.`;
    }
    
    if (availableFocals && !availableFocals.includes(focal)) {
      // Find closest available focal length for helpful message
      const closest = availableFocals.reduce((prev, curr) => 
        Math.abs(curr - focal) < Math.abs(prev - focal) ? curr : prev
      );
      return { 
        value: String(focal), 
        disabled: true, 
        reason: `⛔ ${LENS_FAMILY_NAMES[lensFamily] || lensFamily.replace(/_/g, ' ')} isn't manufactured in ${focal}mm. Nearest available: ${closest}mm. Lens sets have specific focal lengths.`,
        description
      };
    }
    return { value: String(focal), disabled: false, description };
  });
}

/** 
 * Get film stock options based on camera body format
 * - Standard 35mm cameras → 35mm stocks
 * - 65mm cameras (Super Panavision, IMAX, etc.) → 65mm stocks
 * - IMAX cameras → IMAX-specific stocks
 */
function getFilmStockOptions(cameraBody: string): string[] {
  // IMAX cameras use IMAX-specific stocks
  if (cameraBody.startsWith('IMAX_')) {
    return ENUMS.film_stock_imax;
  }
  // 65mm cameras (Super Panavision 70, Ultra Panavision, Mitchell BFC 65)
  if (
    cameraBody === 'Super_Panavision_70' || 
    cameraBody === 'Ultra_Panavision_70' ||
    cameraBody === 'Mitchell_BFC_65'
  ) {
    return ENUMS.film_stock_65mm;
  }
  // Default: standard 35mm stocks
  return ENUMS.film_stock;
}

/**
 * Get aspect ratio options based on camera body
 * - Standard cameras → common ratios (1.33, 1.66, 1.78, 1.85, 2.39)
 * - IMAX cameras → IMAX-specific ratios
 * - Anamorphic-native cameras → include 2.76:1
 */
function getAspectRatioOptions(cameraBody: string): string[] {
  // IMAX cameras have specific aspect ratios
  if (cameraBody.startsWith('IMAX_')) {
    return ['1.43:1', '1.90:1', '2.20:1'];
  }
  // Ultra Panavision 70 is famous for 2.76:1 (Ben-Hur, Hateful Eight)
  if (cameraBody === 'Ultra_Panavision_70') {
    return ['2.76:1', '2.39:1', '2.20:1'];
  }
  // Super Panavision 70 typically used for 2.20:1 or 2.35:1
  if (cameraBody === 'Super_Panavision_70') {
    return ['2.20:1', '2.35:1', '2.39:1'];
  }
  // Standard ratios for most cameras
  return ENUMS.aspect_ratio;
}

// =============================================================================
// ANIMATION TOOLTIP HELPERS
// =============================================================================

/** Get color application options with disabled reasons for tooltips */
function getColorApplicationOptionsWithReasons(domain: string): OptionWithReason[] {
  const restrictions = ANIMATION_DOMAIN_RESTRICTIONS[domain];
  
  return ENUMS.color_application.map(color => {
    const description = OPTION_DESCRIPTIONS.color_application?.[color];
    
    if (restrictions?.disallowed_colors?.includes(color)) {
      if (domain === 'Manga') {
        return { 
          value: color, 
          disabled: true, 
          reason: `⛔ Manga is defined by monochrome ink aesthetic—color would fundamentally change the medium.`,
          description 
        };
      }
      return { value: color, disabled: true, reason: `⛔ ${color} not available for ${domain}.`, description };
    }
    return { value: color, disabled: false, description };
  });
}

/** Get virtual camera options with disabled reasons for tooltips */
function getVirtualCameraOptionsWithReasons(domain: string, medium: string, motionStyle?: string): OptionWithReason[] {
  const domainRestrictions = ANIMATION_DOMAIN_RESTRICTIONS[domain];
  const mediumRestrictions = MEDIUM_CAMERA_RESTRICTIONS[medium];
  const motionRestrictions = motionStyle ? MOTION_CAMERA_RESTRICTIONS[motionStyle] : null;
  
  return ENUMS.virtual_camera.map(camera => {
    const description = OPTION_DESCRIPTIONS.virtual_camera?.[camera];
    
    // Check domain restrictions
    if (domainRestrictions?.disallowed_cameras?.includes(camera)) {
      if (domain === 'Anime' && camera === 'Simulated_Handheld') {
        return { 
          value: camera, 
          disabled: true, 
          reason: `⛔ Anime tradition relies on deliberate, controlled framing—simulated handheld conflicts with the aesthetic.`,
          description 
        };
      }
      if (domain === 'Manga') {
        return { 
          value: camera, 
          disabled: true, 
          reason: `⛔ Manga is printed static artwork—camera movement doesn't exist in the medium.`,
          description 
        };
      }
      if (domain === 'Illustration') {
        return { 
          value: camera, 
          disabled: true, 
          reason: `⛔ Illustration is a single static image—no temporal dimension for camera movement.`,
          description 
        };
      }
      return { value: camera, disabled: true, reason: `⛔ ${camera} not compatible with ${domain}.`, description };
    }
    // Check medium restrictions
    if (mediumRestrictions?.includes(camera)) {
      return { 
        value: camera, 
        disabled: true, 
        reason: `⛔ ${camera} requires true 3D geometry—${medium} medium lacks the dimensional data for free camera movement.`,
        description 
      };
    }
    // Check motion restrictions
    if (motionRestrictions?.includes(camera)) {
      return { 
        value: camera, 
        disabled: true, 
        reason: `⛔ Motion Style is "None"—camera movement requires animated frames to be perceptible.`,
        description 
      };
    }
    return { value: camera, disabled: false, description };
  });
}

/** Get motion style options with disabled reasons for tooltips */
function getMotionStyleOptionsWithReasons(domain: string): OptionWithReason[] {
  const restrictions = ANIMATION_DOMAIN_RESTRICTIONS[domain];
  
  return ENUMS.motion_style.map(motion => {
    const description = OPTION_DESCRIPTIONS.motion_style?.[motion];
    
    if (restrictions?.disallowed_motion?.includes(motion)) {
      if (domain === 'Manga') {
        return { 
          value: motion, 
          disabled: true, 
          reason: `⛔ Manga is printed static artwork—motion exists only in reader's imagination through visual storytelling.`,
          description 
        };
      }
      if (domain === 'Illustration') {
        return { 
          value: motion, 
          disabled: true, 
          reason: `⛔ Illustration is a single frame—no animation component exists.`,
          description 
        };
      }
      return { value: motion, disabled: true, reason: `⛔ ${domain} is static—no motion animation.`, description };
    }
    return { value: motion, disabled: false, description };
  });
}

/** Get lighting model options with disabled reasons for tooltips */
function getLightingModelOptionsWithReasons(domain: string): OptionWithReason[] {
  const restrictions = ANIMATION_DOMAIN_RESTRICTIONS[domain];
  
  return ENUMS.lighting_model.map(lighting => {
    const description = OPTION_DESCRIPTIONS.lighting_model?.[lighting];
    
    // If required lighting is specified
    if (restrictions?.required_lighting && !restrictions.required_lighting.includes(lighting)) {
      return { 
        value: lighting, 
        disabled: true, 
        reason: `⛔ ${domain} requires ${restrictions.required_lighting.join('/')} lighting—dimensional shading conflicts with the graphic ink aesthetic.`,
        description 
      };
    }
    // If disallowed lighting
    if (restrictions?.disallowed_lighting?.includes(lighting)) {
      if (domain === 'Anime' && lighting === 'Raytraced') {
        return { 
          value: lighting, 
          disabled: true, 
          reason: `⛔ Raytracing produces photorealistic lighting—conflicts with anime's stylized cel-shaded aesthetic.`,
          description 
        };
      }
      if (domain === 'ThreeD' && lighting === 'Flat') {
        return { 
          value: lighting, 
          disabled: true, 
          reason: `⛔ 3D animation requires dimensional lighting—flat lighting defeats the purpose of 3D geometry.`,
          description 
        };
      }
      return { value: lighting, disabled: true, reason: `⛔ ${lighting} not compatible with ${domain}.`, description };
    }
    return { value: lighting, disabled: false, description };
  });
}

/** Get lighting sources that are anachronistic for a given year */
function getAnachronisticSourcesForYear(year: number | undefined): string[] {
  if (!year) return [];
  const anachronistic: string[] = [];
  for (const [source, inventionYear] of Object.entries(ERA_LIGHTING_ANACHRONISMS)) {
    if (year < inventionYear) {
      anachronistic.push(source);
    }
  }
  return anachronistic;
}

// =============================================================================
// PRESET IMAGE MAPPING
// Maps preset IDs to movie frame image filenames
// Pattern: preset_id uses underscores, filename uses hyphens
// =============================================================================

/** Convert preset ID to image filename */
function getPresetImagePath(presetId: string): string | null {
  // Special cases where the mapping isn't a simple underscore-to-hyphen conversion
  // or where no image is available
  const SPECIAL_MAPPINGS: Record<string, string | null> = {
    // Name corrections (preset ID differs from image filename)
    'amelie': 'amlie',
    'an_andalusian_dog': 'andalusian-dog',
    'un_chien_andalou': 'andalusian-dog',
    'battle_of_algiers': 'the-battle-of-algiers',
    'one_flew_over_cuckoos_nest': 'one-flew-over-the-cuckoos-nest',
    'star_wars_anh': 'star-wars-a-new-hope',
    // Presets without images (animation, no matching movie frame)
    'la_la_land': null,
    'the_social_network': null,
    'joker': null,
    'drive': null,
    'solaris': null,
    // 'the_mirror' has an image now
    // Animation presets without images
    'spirited_away': null,
    'princess_mononoke': null,
    'your_name': null,
    'perfect_blue': null,
    'paprika': null,
    'toy_story': null,
    'wall_e': null,
    'spider_verse': null,
    'ratatouille': null,
    'finding_nemo': null,
    'arcane': null,
    'love_death_robots': null,
    'into_the_spider_verse': null,
    'studio_ghibli_generic': null,
  };

  // Check special mappings first
  if (presetId in SPECIAL_MAPPINGS) {
    const mapped = SPECIAL_MAPPINGS[presetId];
    if (mapped === null) return null;
    return `/movie-frames/${mapped}.jpg`;
  }

  // Default conversion: replace underscores with hyphens
  const filename = presetId.replace(/_/g, '-').toLowerCase();
  return `/movie-frames/${filename}.jpg`;
}

/** Format option tooltip - combines description and disabled reason */
function formatOptionTitle(opt: OptionWithReason): string {
  if (opt.disabled && opt.reason) {
    // Disabled: show reason first, then description
    return opt.description 
      ? `${opt.reason}\n\n📖 ${opt.description}`
      : opt.reason;
  }
  // Enabled: show description only
  return opt.description || '';
}

// Fields to fetch dynamic options for
const LIVE_ACTION_FIELDS = [
  'camera.camera_type',
  'camera.manufacturer',
  'camera.body',
  'camera.film_stock',
  'camera.aspect_ratio',
  'lens.manufacturer',
  'lens.family',
  'movement.equipment',
  'movement.movement_type',
  'movement.timing',
  'lighting.time_of_day',
  'lighting.source',
  'lighting.style',
  'visual_grammar.shot_size',
  'visual_grammar.composition',
  'visual_grammar.mood',
  'visual_grammar.color_tone',
];

const ANIMATION_FIELDS = [
  'medium',
  'style_domain',
  'rendering.line_treatment',
  'rendering.color_application',
  'rendering.lighting_model',
  'rendering.surface_detail',
  'motion.motion_style',
  'motion.virtual_camera',
  'visual_grammar.shot_size',
  'visual_grammar.composition',
  'visual_grammar.mood',
  'visual_grammar.color_tone',
];

function App() {
  const {
    projectType,
    setProjectType,
    liveActionConfig,
    animationConfig,
    setLiveActionConfig,
    setAnimationConfig,
    updateLiveAction,
    updateAnimation,
    validationResult,
    setValidationResult,
    generatedPrompt,
    negativePrompt,
    setGeneratedPrompt,
    targetModel,
    setTargetModel,
    // Preset state
    selectedLiveActionPreset,
    selectedAnimationPreset,
    liveActionPresetList,
    animationPresetList,
    setLiveActionPresetList,
    setAnimationPresetList,
    applyLiveActionPresetConfig,
    applyAnimationPresetConfig,
    clearPreset,
    // CPE to Storyboard prompt sharing
    setCpePromptForStoryboard,
  } = useCinemaStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [isApplyingPreset, setIsApplyingPreset] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [cinematographyStyle, setCinematographyStyle] = useState<CinematographyStyle | null>(null);
  const [isLoadingCinematography, setIsLoadingCinematography] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Dynamic Options Fetching
  const [debouncedConfig, setDebouncedConfig] = useState<{
    type: 'live_action' | 'animation';
    config: any;
  }>({ type: 'live_action', config: liveActionConfig });

  // Update debounced config
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedConfig({
        type: projectType,
        config: projectType === 'live_action' ? liveActionConfig : animationConfig,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [projectType, liveActionConfig, animationConfig]);

  // Fetch options for all fields based on debounced config
  const optionQueries = useQueries({
    queries: (projectType === 'live_action' ? LIVE_ACTION_FIELDS : ANIMATION_FIELDS).map((field) => ({
      queryKey: ['options', debouncedConfig.type, field, debouncedConfig.config],
      queryFn: () => api.getOptions(debouncedConfig.type, field, debouncedConfig.config),
      staleTime: 60000,
      retry: false,
    })),
  });

  // Map of field_path -> OptionsResponse
  const remoteOptions = useMemo(() => {
    const map: Record<string, OptionsResponse> = {};
    optionQueries.forEach((query) => {
      if (query.data) {
        map[query.data.field_path] = query.data;
      }
    });
    return map;
  }, [optionQueries]);

  // Helper to merge local options with remote options
  const getEffectiveOptions = useCallback((
    fieldPath: string, 
    localOptions: OptionWithReason[]
  ): OptionWithReason[] => {
    const remote = remoteOptions[fieldPath];
    if (!remote) return localOptions;

    // Create a map of local options for easy lookup
    const localMap = new Map(localOptions.map(o => [o.value, o]));
    
    // Combine local and remote values to ensure we don't lose options
    // (though backend should be exhaustive)
    const allValues = new Set([
      ...localOptions.map(o => o.value),
      ...remote.options, 
      ...remote.disabled_options
    ]);
    
    // Map values to OptionWithReason
    // We prefer the order from local options if available, then append new ones
    const sortedValues = Array.from(allValues).sort((a, b) => {
      const indexA = localOptions.findIndex(o => o.value === a);
      const indexB = localOptions.findIndex(o => o.value === b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return 0;
    });

    return sortedValues.map(value => {
      const local = localMap.get(value);
      const isRemoteDisabled = remote.disabled_options.includes(value);
      const isRemoteValid = remote.options.includes(value);
      
      // Determine disabled status
      // If remote has opinion, use it. Otherwise fall back to local.
      // Note: If value is NOT in remote.options AND NOT in remote.disabled_options, 
      // it might be an option backend doesn't know about? 
      // Or we should treat it as disabled?
      // For now, if remote data exists, we rely on it.
      
      let disabled = local?.disabled ?? false;
      let reason = local?.reason;

      if (isRemoteDisabled) {
        disabled = true;
        reason = remote.disabled_reasons[value] || reason;
      } else if (isRemoteValid) {
        disabled = false;
        reason = undefined;
      }

      return {
        value,
        disabled,
        reason,
        description: local?.description,
      };
    });
  }, [remoteOptions]);

  // LLM Enhancement state
  const [userPrompt, setUserPrompt] = useState('');
  const suppressUserPromptSync = useRef(false);
  // Load LLM settings from localStorage (persisted in Settings)
  const [selectedLlmProvider, setSelectedLlmProvider] = useState<string>(() => {
    const saved = getSelectedLlmSettings();
    return saved?.provider || '';
  });
  const [selectedLlmModel, setSelectedLlmModel] = useState<string>(() => {
    const saved = getSelectedLlmSettings();
    return saved?.model || '';
  });
  const [configuredProviders, setConfiguredProviders] = useState<ConfiguredProvider[]>([]);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string>('');
  
  // Target AI models (fetched from API)
  const [availableTargetModels, setAvailableTargetModels] = useState<Array<{id: string, name: string, category: string}>>([]);
  const [isLoadingTargetModels, setIsLoadingTargetModels] = useState(false);
  
  // Preset panel state (right-docked collapsible panel) - with localStorage persistence
  const [isPresetPanelOpen, setIsPresetPanelOpen] = useState(() => {
    const saved = localStorage.getItem('cpe-ui-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.isPresetPanelOpen ?? true;
      } catch { /* ignore parse errors */ }
    }
    // Fallback to old key for backwards compatibility
    const oldSaved = localStorage.getItem('presetPanelOpen');
    return oldSaved !== null ? oldSaved === 'true' : true;
  });
  const [presetPanelWidth, setPresetPanelWidth] = useState(() => {
    const saved = localStorage.getItem('cpe-ui-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.presetPanelWidth ?? 360;
      } catch { /* ignore parse errors */ }
    }
    // Fallback to old key for backwards compatibility
    const oldSaved = localStorage.getItem('presetPanelWidth');
    return oldSaved ? parseInt(oldSaved, 10) : 360;
  });
  const [presetPanelTab, setPresetPanelTab] = useState<'browser' | 'info'>(() => {
    const saved = localStorage.getItem('cpe-ui-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.presetPanelTab ?? 'browser';
      } catch { /* ignore parse errors */ }
    }
    return 'browser';
  });
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  
  // Ref to track if this is the first render (skip initial validation)
  const isFirstRender = useRef(true);
  // Ref for debounce timer
  const validationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real-time validation on config change (debounced)
  useEffect(() => {
    // Skip first render to avoid validating defaults
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Clear existing timer
    if (validationTimer.current) {
      clearTimeout(validationTimer.current);
    }

    // Debounce validation calls (300ms)
    validationTimer.current = setTimeout(async () => {
      setIsValidating(true);
      try {
        const result = projectType === 'live_action'
          ? await api.validateLiveAction(liveActionConfig)
          : await api.validateAnimation(animationConfig);
        setValidationResult(result);
      } catch (error) {
        console.error('Validation error:', error);
      } finally {
        setIsValidating(false);
      }
    }, 300);

    // Cleanup on unmount
    return () => {
      if (validationTimer.current) {
        clearTimeout(validationTimer.current);
      }
    };
  }, [projectType, liveActionConfig, animationConfig, setValidationResult]);

  // Sync from ComfyUI on iframe init
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'INIT_CONFIG') return;
      const payload = event.data.payload;
      if (!payload?.config) return;

      suppressPromptReset.current = true;
      if (payload.projectType === 'live_action') {
        setProjectType('live_action');
        setLiveActionConfig(payload.config);
      } else if (payload.projectType === 'animation') {
        setProjectType('animation');
        setAnimationConfig(payload.config);
      }

      // Extract userPrompt from either top-level or nested config.user_prompt
      const incomingUserPrompt = payload.userPrompt ?? payload.config?.user_prompt ?? '';
      if (incomingUserPrompt !== undefined) {
        suppressUserPromptSync.current = true;
        setUserPrompt(incomingUserPrompt);
      }
      if (payload.prompt !== undefined) {
        setGeneratedPrompt(payload.prompt || '', null);
      }
      if (payload.enhancedPrompt !== undefined) {
        setEnhancedPrompt(payload.enhancedPrompt || '');
      }
    };

    window.addEventListener('message', handler);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'READY' }, '*');
    }
    return () => window.removeEventListener('message', handler);
  }, [setProjectType, setLiveActionConfig, setAnimationConfig, setGeneratedPrompt]);

  // Never auto-clear prompts; keep node and web in sync
  const suppressPromptReset = useRef(false);



  // Load configured LLM providers and LLM settings on mount and when settings close
  useEffect(() => {
    const providers = getConfiguredProviders();
    setConfiguredProviders(providers);
    
    // Reload LLM settings from localStorage (set in Settings panel)
    const savedLlmSettings = getSelectedLlmSettings();
    if (savedLlmSettings) {
      setSelectedLlmProvider(savedLlmSettings.provider);
      setSelectedLlmModel(savedLlmSettings.model);
    } else if (providers.length > 0 && !selectedLlmProvider) {
      // Fallback: auto-select first provider if nothing saved
      setSelectedLlmProvider(providers[0].providerId);
      if (providers[0].models.length > 0) {
        setSelectedLlmModel(providers[0].models[0]);
      }
    }
  }, [isSettingsOpen]); // Reload when settings panel closes

  // Fetch target AI models on mount and initialize from localStorage
  useEffect(() => {
    // First, load saved targetModel from localStorage
    const savedTargetModel = loadTargetModel();
    if (savedTargetModel) {
      setTargetModel(savedTargetModel);
    }
    
    // Then fetch available models from API
    setIsLoadingTargetModels(true);
    api.getTargetModels()
      .then(models => {
        setAvailableTargetModels(models);
        // Validate saved model is still available, otherwise use first available
        const currentModel = savedTargetModel || targetModel;
        if (models.length > 0 && !models.find(m => m.id === currentModel)) {
          setTargetModel(models[0].id);
        }
      })
      .catch(err => {
        console.error('Failed to fetch target models:', err);
        // Keep using static ENUMS as fallback - already populated in dropdown
      })
      .finally(() => {
        setIsLoadingTargetModels(false);
      });
  }, []);

  // Save preset panel state to localStorage (consolidated key)
  useEffect(() => {
    const state = {
      isPresetPanelOpen,
      presetPanelWidth,
      presetPanelTab,
    };
    localStorage.setItem('cpe-ui-state', JSON.stringify(state));
    // Also keep old keys for backwards compatibility during transition
    localStorage.setItem('presetPanelOpen', String(isPresetPanelOpen));
    localStorage.setItem('presetPanelWidth', String(presetPanelWidth));
  }, [isPresetPanelOpen, presetPanelWidth, presetPanelTab]);

  // Persist targetModel to localStorage when it changes
  useEffect(() => {
    saveTargetModel(targetModel);
  }, [targetModel]);

  // Handle panel resize
  const handlePanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingPanel(true);
  }, []);

  useEffect(() => {
    if (!isResizingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.max(280, Math.min(600, newWidth));
      setPresetPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizingPanel(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanel]);

  // Load presets on mount and when project type changes
  useEffect(() => {
    const loadPresets = async () => {
      setIsLoadingPresets(true);
      try {
        if (projectType === 'live_action') {
          const response = await api.getLiveActionPresets();
          setLiveActionPresetList(response.presets);
        } else {
          const response = await api.getAnimationPresets();
          setAnimationPresetList(response.presets);
        }
      } catch (error) {
        console.error('Failed to load presets:', error);
      } finally {
        setIsLoadingPresets(false);
      }
    };
    loadPresets();
  }, [projectType, setLiveActionPresetList, setAnimationPresetList]);

  // Apply preset handler
  const handleApplyPreset = useCallback(async (presetId: string) => {
    setIsApplyingPreset(true);
    setCinematographyStyle(null); // Clear previous style
    try {
      if (projectType === 'live_action') {
        const result = await api.applyLiveActionPreset(presetId);
        applyLiveActionPresetConfig(result.config, result.preset);
        setValidationResult(result.validation);
        
        // Fetch cinematography style (non-blocking)
        setIsLoadingCinematography(true);
        api.getCinematographyStyle(presetId)
          .then(style => setCinematographyStyle(style))
          .catch(() => setCinematographyStyle(null)) // Style not available for all presets
          .finally(() => setIsLoadingCinematography(false));
      } else {
        const result = await api.applyAnimationPreset(presetId);
        applyAnimationPresetConfig(result.config, result.preset);
        setValidationResult(result.validation);
      }
    } catch (error) {
      console.error('Failed to apply preset:', error);
    } finally {
      setIsApplyingPreset(false);
    }
  }, [projectType, applyLiveActionPresetConfig, applyAnimationPresetConfig, setValidationResult]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const result = projectType === 'live_action'
        ? await api.generateLiveActionPrompt(liveActionConfig, targetModel)
        : await api.generateAnimationPrompt(animationConfig, targetModel);
      
      setGeneratedPrompt(result.prompt, result.negative_prompt);
      setValidationResult(result.validation);


    } catch (error) {
      console.error('Failed to generate prompt:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [projectType, liveActionConfig, animationConfig, targetModel, setGeneratedPrompt, setValidationResult]);

  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(generatedPrompt);
  }, [generatedPrompt]);

  // Handle LLM prompt enhancement
  const handleEnhancePrompt = useCallback(async () => {
    if (!userPrompt.trim()) {
      setEnhanceError('Please enter a prompt idea to enhance');
      return;
    }
    
    if (!selectedLlmProvider || !selectedLlmModel) {
      setEnhanceError('Please select an LLM provider and model. Configure providers in Settings.');
      return;
    }
    
    const provider = configuredProviders.find(p => p.providerId === selectedLlmProvider);
    if (!provider) {
      setEnhanceError('Selected provider not found. Please configure in Settings.');
      return;
    }
    
    setIsEnhancing(true);
    setEnhanceError(null);
    
    try {
      const result = await api.enhancePrompt({
        userPrompt: userPrompt.trim(),
        llmProvider: selectedLlmProvider,
        llmModel: selectedLlmModel,
        targetModel,
        projectType,
        config: projectType === 'live_action' ? liveActionConfig : animationConfig,
        credentials: {
          apiKey: provider.credentials.apiKey,
          endpoint: provider.credentials.endpoint,
          oauthToken: provider.credentials.oauthToken,
        },
      });
      
      if (result.success) {
        // Set the enhanced prompt separately from the simple generated prompt
        setEnhancedPrompt(result.enhanced_prompt);

      } else {
        setEnhanceError(result.error || 'Enhancement failed');
      }
    } catch (error) {
      console.error('Failed to enhance prompt:', error);
      setEnhanceError(error instanceof Error ? error.message : 'Enhancement failed');
    } finally {
      setIsEnhancing(false);
    }
  }, [userPrompt, selectedLlmProvider, selectedLlmModel, configuredProviders, targetModel, projectType, liveActionConfig, animationConfig]);

  const getSeverityClass = (severity: RuleSeverity) => {
    switch (severity) {
      case 'hard': return 'hard';
      case 'warning': return 'warning';
      case 'info': return 'info';
      default: return '';
    }
  };

  return (
    <div 
      className={`app app-with-panel ${!isPresetPanelOpen ? 'panel-collapsed' : ''}`}
      style={{ '--preset-panel-width': `${presetPanelWidth}px` } as React.CSSProperties}
    >
      <header className="header cpe-toolbar">
        <textarea
          className="toolbar-prompt"
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          placeholder="Describe your scene..."
          rows={1}
        />
        <select 
          className="toolbar-model"
          value={targetModel} 
          onChange={(e) => setTargetModel(e.target.value)}
          disabled={isLoadingTargetModels}
        >
          {availableTargetModels.length > 0 ? (
            <>
              {/* Group by category */}
              {['General', 'Image', 'Video'].map(category => {
                const modelsInCategory = availableTargetModels.filter(m => m.category === category);
                if (modelsInCategory.length === 0) return null;
                return (
                  <optgroup key={category} label={`── ${category} Models ──`}>
                    {modelsInCategory.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </>
          ) : (
            // Fallback to static ENUMS if API not loaded yet (with proper display names)
            <>
              <optgroup label="── General Models ──">
                {ENUMS.target_model.filter(v => v === 'generic').map((v) => (
                  <option key={v} value={v}>{TARGET_MODEL_NAMES[v] || v}</option>
                ))}
              </optgroup>
              <optgroup label="── Image Models ──">
                {ENUMS.target_model.filter(v => 
                  ['midjourney', 'flux.1', 'flux.1_pro', 'flux_kontext', 'flux_krea',
                   'dall-e_3', 'gpt-image', 'ideogram_2.0', 'leonardo_ai', 
                   'sdxl', 'stable_diffusion_3', 'z-image_turbo', 'qwen_image'].includes(v)
                ).map((v) => (
                  <option key={v} value={v}>{TARGET_MODEL_NAMES[v] || v}</option>
                ))}
              </optgroup>
              <optgroup label="── Video Models ──">
                {ENUMS.target_model.filter(v => 
                  ['sora', 'sora_2', 'veo_2', 'veo_3', 'runway_gen-3', 'runway_gen-4', 
                   'kling_1.6', 'pika_2.0', 'luma_dream_machine', 'ltx_2', 'cogvideox', 
                   'hunyuan', 'wan_2.1', 'wan_2.2', 'minimax_video', 'qwen_vl'].includes(v)
                ).map((v) => (
                  <option key={v} value={v}>{TARGET_MODEL_NAMES[v] || v}</option>
                ))}
              </optgroup>
            </>
          )}
        </select>
        <button className="toolbar-btn primary" onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? 'Generating...' : 'Generate'}
        </button>
        <button className="toolbar-btn" onClick={handleEnhancePrompt} disabled={isEnhancing || !userPrompt.trim()}>
          {isEnhancing ? 'Enhancing...' : 'Enhance with AI'}
        </button>
        <button className="toolbar-settings" onClick={() => setIsSettingsOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      {/* Settings Modal */}
      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* Prompt Generation Panel */}
      <div className="output-panel">
        {/* Section Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Prompt Generation
            <span 
              title="This panel generates AI prompts from your cinematography settings. Use 'Generate' for a simple prompt based on settings, or 'Enhance with AI' to have an LLM create a more detailed, professional prompt."
              style={{ 
                cursor: 'help', 
                fontSize: '0.75rem', 
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-light)',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >?</span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isValidating && (
              <span className="status-badge validating">validating...</span>
            )}
            {validationResult && !isValidating && (
              <span className={`status-badge ${validationResult.status}`}>
                {validationResult.status}
              </span>
            )}
          </div>
        </div>

        {/* Validation Messages - at top of panel */}
        {validationResult && validationResult.messages.length > 0 && (
          <div className="validation-messages" style={{ marginBottom: '0.75rem' }}>
            {validationResult.messages.map((msg, idx) => (
              <div key={idx} className={`validation-message ${getSeverityClass(msg.severity)}`}>
                <strong>{msg.rule_id}:</strong> {msg.message}
              </div>
            ))}
          </div>
        )}

        {/* Output areas side by side with copy buttons */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '1rem', 
          marginBottom: '1rem',
        }}>
          {/* Left: Simple Prompt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label 
              style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}
              title="Basic prompt generated from your cinematography settings."
            >
              Simple Prompt <span style={{ cursor: 'help' }}>(?)</span>
            </label>
            <textarea
              readOnly
              value={generatedPrompt || 'Click "Generate" to create a prompt from your settings...'}
              style={{
                width: '100%',
                minHeight: '150px',
                padding: '0.75rem',
                fontSize: '0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-medium)',
                color: generatedPrompt ? 'var(--text-primary)' : 'var(--text-muted)',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                flex: 1,
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button 
                className="secondary" 
                onClick={handleCopyPrompt} 
                disabled={!generatedPrompt}
                title="Copy simple prompt to clipboard"
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  borderRadius: '5px',
                  border: '1px solid var(--border-medium)',
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  cursor: generatedPrompt ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s ease',
                }}
              >
                Copy Simple Prompt
              </button>
              <button 
                className="secondary" 
                onClick={() => setCpePromptForStoryboard(generatedPrompt)}
                disabled={!generatedPrompt}
                title="Send this prompt to the Storyboard panel"
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  borderRadius: '5px',
                  border: '1px solid var(--accent-primary)',
                  backgroundColor: 'var(--accent-primary)',
                  color: 'white',
                  cursor: generatedPrompt ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s ease',
                  opacity: generatedPrompt ? 1 : 0.5,
                }}
              >
                📋 Send to Storyboard
              </button>
            </div>
          </div>

          {/* Right: AI-Enhanced Prompt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label 
              style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}
              title="Your prompt enhanced by AI with professional cinematography language."
            >
              AI-Enhanced Prompt <span style={{ cursor: 'help' }}>(?)</span>
            </label>
            <textarea
              readOnly
              value={enhancedPrompt || 'Click "Enhance with AI" to generate an enhanced prompt...'}
              style={{
                width: '100%',
                minHeight: '150px',
                padding: '0.75rem',
                fontSize: '0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-medium)',
                color: enhancedPrompt ? 'var(--text-primary)' : 'var(--text-muted)',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                flex: 1,
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button 
                className="secondary" 
                onClick={() => navigator.clipboard.writeText(enhancedPrompt)}
                disabled={!enhancedPrompt}
                title="Copy enhanced prompt to clipboard"
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  borderRadius: '5px',
                  border: '1px solid var(--border-medium)',
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  cursor: enhancedPrompt ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s ease',
                }}
              >
                Copy Enhanced Prompt
              </button>
              <button 
                className="secondary" 
                onClick={() => setCpePromptForStoryboard(enhancedPrompt)}
                disabled={!enhancedPrompt}
                title="Send this prompt to the Storyboard panel"
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  borderRadius: '5px',
                  border: '1px solid var(--accent-primary)',
                  backgroundColor: 'var(--accent-primary)',
                  color: 'white',
                  cursor: enhancedPrompt ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s ease',
                  opacity: enhancedPrompt ? 1 : 0.5,
                }}
              >
                📋 Send to Storyboard
              </button>
            </div>
          </div>
        </div>

        {/* Negative Prompt - always visible */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
            Negative Prompt
          </label>
          <textarea
            readOnly
            value={negativePrompt || 'Generated negative prompt will appear here...'}
            style={{
              width: '100%',
              minHeight: '50px',
              padding: '0.75rem',
              fontSize: '0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-medium)',
              color: negativePrompt ? 'var(--text-primary)' : 'var(--text-muted)',
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Enhancement Error */}
        {enhanceError && (
          <p style={{ 
            fontSize: '0.8rem', 
            color: 'var(--error)', 
            marginBottom: '0.75rem',
            padding: '0.5rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '4px',
          }}>
            {enhanceError}
          </p>
        )}

        {/* No providers configured message */}
        {configuredProviders.length === 0 && (
          <p style={{ 
            fontSize: '0.8rem', 
            color: 'var(--text-muted)', 
            marginBottom: '0.75rem',
            textAlign: 'center',
            padding: '0.5rem',
            backgroundColor: 'var(--bg-medium)',
            borderRadius: '4px',
          }}>
            Click the gear icon to configure an AI provider for prompt enhancement
          </p>
        )}
      </div>

      {/* Mode Toggle */}
      <div className="mode-toggle">
        <button
          className={projectType === 'live_action' ? 'active' : ''}
          onClick={() => setProjectType('live_action')}
        >
          Live-Action Cinema
        </button>
        <button
          className={projectType === 'animation' ? 'active' : ''}
          onClick={() => setProjectType('animation')}
        >
          Animation
        </button>
      </div>

      {/* Right-Docked Preset Panel */}
      <div 
        className={`preset-panel ${isPresetPanelOpen ? 'open' : 'collapsed'} ${isResizingPanel ? 'resizing' : ''}`}
        style={{ width: isPresetPanelOpen ? presetPanelWidth : 40 }}
      >
        {/* Resize Handle */}
        <div 
          className="panel-resize-handle" 
          onMouseDown={handlePanelResizeStart}
        />
        
        {/* Collapse Toggle Button */}
        <button 
          className="panel-collapse-toggle"
          onClick={() => setIsPresetPanelOpen(!isPresetPanelOpen)}
          title={isPresetPanelOpen ? 'Collapse panel' : 'Expand panel'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 4L6 8L10 12" />
          </svg>
        </button>
        
        {/* Panel Header */}
        <div className="panel-header">
          <h2>{projectType === 'live_action' ? 'Film Presets' : 'Animation Presets'}</h2>
          {(selectedLiveActionPreset || selectedAnimationPreset) && (
            <button className="clear-preset-btn" onClick={clearPreset}>
              Clear
            </button>
          )}
        </div>
        
        {/* Tabs */}
        <div className="panel-tabs">
          <button 
            className={presetPanelTab === 'browser' ? 'active' : ''}
            onClick={() => setPresetPanelTab('browser')}
          >
            Browser
          </button>
          <button 
            className={presetPanelTab === 'info' ? 'active' : ''}
            onClick={() => setPresetPanelTab('info')}
          >
            Info
          </button>
        </div>
        
        {/* Tab Content */}
        <div className="panel-tab-content">
          {presetPanelTab === 'browser' && (
            <>
              {/* Preset Search/Filter */}
              <div className="preset-search">
                <input
                  type="text"
                  placeholder={`Search ${projectType === 'live_action' ? 'film' : 'animation'} presets...`}
                  value={presetSearchQuery}
                  onChange={(e) => setPresetSearchQuery(e.target.value)}
                />
              </div>

              {/* Preset List */}
              <div className="preset-list">
                {isLoadingPresets ? (
                  <div className="loading">Loading presets...</div>
                ) : projectType === 'live_action' ? (
                  liveActionPresetList
                    .filter((p: FilmPresetSummary) => 
                      !presetSearchQuery || 
                      p.name.toLowerCase().includes(presetSearchQuery.toLowerCase()) ||
                      p.era.toLowerCase().includes(presetSearchQuery.toLowerCase())
                    )
                    .map((preset: FilmPresetSummary) => (
                      <button
                        key={preset.id}
                        className={`preset-item ${selectedLiveActionPreset?.id === preset.id ? 'selected' : ''}`}
                        onClick={() => handleApplyPreset(preset.id)}
                        disabled={isApplyingPreset}
                      >
                        {getPresetImagePath(preset.id) && (
                          <div className="preset-item-thumbnail">
                            <img 
                              src={getPresetImagePath(preset.id)!}
                              alt=""
                              onError={(e) => {
                                (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div className="preset-item-info">
                          <span className="preset-item-name">{preset.name}</span>
                          <span className="preset-item-meta">{preset.year} &bull; {preset.era}</span>
                        </div>
                      </button>
                    ))
                ) : (
                  animationPresetList
                    .filter((p: AnimationPresetSummary) =>
                      !presetSearchQuery ||
                      p.name.toLowerCase().includes(presetSearchQuery.toLowerCase()) ||
                      p.domain.toLowerCase().includes(presetSearchQuery.toLowerCase())
                    )
                    .map((preset: AnimationPresetSummary) => (
                      <button
                        key={preset.id}
                        className={`preset-item ${selectedAnimationPreset?.id === preset.id ? 'selected' : ''}`}
                        onClick={() => handleApplyPreset(preset.id)}
                        disabled={isApplyingPreset}
                      >
                        {getPresetImagePath(preset.id) && (
                          <div className="preset-item-thumbnail">
                            <img 
                              src={getPresetImagePath(preset.id)!}
                              alt=""
                              onError={(e) => {
                                (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div className="preset-item-info">
                          <span className="preset-item-name">{preset.name}</span>
                          <span className="preset-item-meta">{preset.domain} &bull; {preset.medium}</span>
                        </div>
                      </button>
                    ))
                )}
              </div>
            </>
          )}
          
          {presetPanelTab === 'info' && (
            <>
              {/* Active Preset Info */}
              {projectType === 'live_action' && selectedLiveActionPreset ? (
                <div className="active-preset">
                  <div className="active-preset-content">
                    <div className="preset-info">
                      <div className="preset-name">{selectedLiveActionPreset.name}</div>
                      <div className="preset-meta">
                        {selectedLiveActionPreset.year} &bull; {selectedLiveActionPreset.era}
                      </div>
                      {selectedLiveActionPreset.disallowed_moods.length > 0 && (
                        <div className="preset-constraints">
                          <span className="constraint-label">Disallowed moods:</span>
                          <span className="constraint-values">
                            {selectedLiveActionPreset.disallowed_moods.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                    {getPresetImagePath(selectedLiveActionPreset.id) && (
                      <div className="preset-image-preview">
                        <img 
                          src={getPresetImagePath(selectedLiveActionPreset.id)!}
                          alt={`${selectedLiveActionPreset.name} frame`}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Cinematography Style Details */}
                  {isLoadingCinematography && (
                    <div className="cinematography-loading">Loading cinematography details...</div>
                  )}
                  {cinematographyStyle && (
                    <div className="cinematography-details">
                      <div className="cinematography-header">
                        <span className="cinematography-label">Cinematographer</span>
                        <span className="cinematography-value cinematographer-name">{cinematographyStyle.cinematographer}</span>
                      </div>
                      <div className="cinematography-grid">
                        <div className="cinematography-item">
                          <span className="item-label">Camera</span>
                          <span className="item-value">{cinematographyStyle.camera}</span>
                        </div>
                        <div className="cinematography-item">
                          <span className="item-label">Film Stock</span>
                          <span className="item-value">{cinematographyStyle.film_stock}</span>
                        </div>
                        <div className="cinematography-item">
                          <span className="item-label">Aspect Ratio</span>
                          <span className="item-value">{cinematographyStyle.aspect_ratio}</span>
                        </div>
                        <div className="cinematography-item">
                          <span className="item-label">Lenses</span>
                          <span className="item-value">{cinematographyStyle.lens_info}</span>
                        </div>
                      </div>
                      <div className="cinematography-section">
                        <span className="section-label">Lighting Signature</span>
                        <span className="section-value">{cinematographyStyle.lighting_signature}</span>
                      </div>
                      <div className="cinematography-section">
                        <span className="section-label">Color Palette</span>
                        <span className="section-value">{cinematographyStyle.color_palette}</span>
                      </div>
                      <div className="cinematography-section">
                        <span className="section-label">Notable Techniques</span>
                        <span className="section-value">{cinematographyStyle.notable_techniques}</span>
                      </div>
                      <div className="cinematography-section">
                        <span className="section-label">Movement Style</span>
                        <span className="section-value">{cinematographyStyle.movement_style}</span>
                      </div>
                      {cinematographyStyle.legacy && (
                        <div className="cinematography-section cinematography-legacy">
                          <span className="section-label">Legacy & Influence</span>
                          <span className="section-value">{cinematographyStyle.legacy}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : projectType === 'animation' && selectedAnimationPreset ? (
                <div className="active-preset">
                  <div className="active-preset-content">
                    <div className="preset-info">
                      <div className="preset-name">{selectedAnimationPreset.name}</div>
                      <div className="preset-meta">
                        {selectedAnimationPreset.domain} &bull; {selectedAnimationPreset.medium}
                      </div>
                      {selectedAnimationPreset.line_treatment && (
                        <div className="preset-detail">
                          <span className="detail-label">Line Treatment:</span>
                          <span className="detail-value">{selectedAnimationPreset.line_treatment.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {selectedAnimationPreset.color_application && (
                        <div className="preset-detail">
                          <span className="detail-label">Color:</span>
                          <span className="detail-value">{selectedAnimationPreset.color_application.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {selectedAnimationPreset.lighting_model && (
                        <div className="preset-detail">
                          <span className="detail-label">Lighting:</span>
                          <span className="detail-value">{selectedAnimationPreset.lighting_model.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {selectedAnimationPreset.motion_style && (
                        <div className="preset-detail">
                          <span className="detail-label">Motion:</span>
                          <span className="detail-value">{selectedAnimationPreset.motion_style.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {selectedAnimationPreset.reference_works && selectedAnimationPreset.reference_works.length > 0 && (
                        <div className="preset-detail">
                          <span className="detail-label">Reference:</span>
                          <span className="detail-value">{selectedAnimationPreset.reference_works.slice(0, 2).join(', ')}</span>
                        </div>
                      )}
                      {selectedAnimationPreset.disallowed_motion.length > 0 && (
                        <div className="preset-constraints">
                          <span className="constraint-label">Disallowed motion:</span>
                          <span className="constraint-values">
                            {selectedAnimationPreset.disallowed_motion.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                    {getPresetImagePath(selectedAnimationPreset.id) && (
                      <div className="preset-image-preview">
                        <img 
                          src={getPresetImagePath(selectedAnimationPreset.id)!}
                          alt={`${selectedAnimationPreset.name} frame`}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  color: 'var(--text-muted)', 
                  padding: '2rem',
                  fontSize: '0.85rem',
                }}>
                  Select a preset from the Browser tab to view details
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="config-panel">
        {projectType === 'live_action' ? (
          <>
            {/* Camera Section */}
            <div className="section">
              <h2>Camera</h2>
              {/* Camera Type (Digital vs Film) */}
              <div className="field">
                <label title="Choose between digital cinema cameras or traditional film cameras">Camera Type</label>
                <select
                  value={liveActionConfig.camera.camera_type || 'Digital'}
                  onChange={(e) => {
                    const newType = e.target.value as 'Digital' | 'Film';
                    const newManufacturers = newType === 'Digital' 
                      ? ENUMS.camera_manufacturer 
                      : ENUMS.camera_manufacturer_film;
                    const newManufacturer = newManufacturers[0];
                    const validBodies = MANUFACTURER_CAMERA_BODIES[newManufacturer] || [];
                    updateLiveAction('camera', { 
                      camera_type: newType, 
                      manufacturer: newManufacturer,
                      body: validBodies[0] || '',
                      film_stock: newType === 'Film' ? 'Kodak_Vision3_500T_5219' : 'None',

                    });
                  }}
                >
                  {getEffectiveOptions(
                    'camera.camera_type',
                    ENUMS.camera_type.map(v => ({ value: v, disabled: false }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value} title={formatOptionTitle(opt)} disabled={opt.disabled}>{opt.value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.camera_manufacturer}>Manufacturer</label>
                <select
                  value={liveActionConfig.camera.manufacturer}
                  onChange={(e) => {
                    const newManufacturer = e.target.value;
                    const validBodies = MANUFACTURER_CAMERA_BODIES[newManufacturer] || [];
                    // ALWAYS cascade to first valid body when manufacturer changes
                    // This ensures no mismatched manufacturer/body combinations
                    if (validBodies.length > 0) {
                      updateLiveAction('camera', { manufacturer: newManufacturer, body: validBodies[0] });
                    } else {
                      updateLiveAction('camera', { manufacturer: newManufacturer });
                    }
                  }}
                >
                  {getEffectiveOptions(
                    'camera.manufacturer',
                    (liveActionConfig.camera.camera_type === 'Film' 
                      ? ENUMS.camera_manufacturer_film 
                      : ENUMS.camera_manufacturer
                    ).map(v => ({ value: v, disabled: false, description: OPTION_DESCRIPTIONS.camera_manufacturer?.[v] }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value} title={formatOptionTitle(opt)} disabled={opt.disabled}>{opt.value.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.camera_body}>Body</label>
                <select
                  value={liveActionConfig.camera.body}
                  onChange={(e) => updateLiveAction('camera', { body: e.target.value })}
                >
                  {getEffectiveOptions(
                    'camera.body',
                    getCameraBodyOptionsWithReasons(
                      liveActionConfig.camera.manufacturer,
                      liveActionConfig.camera.camera_type || 'Digital'
                    )
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {CAMERA_BODY_NAMES[opt.value] || opt.value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              {/* Film Stock (only visible for film cameras) */}
              {liveActionConfig.camera.camera_type === 'Film' && (
                <div className="field">
                  <label title="Film stock determines the visual character - color rendition, grain, and latitude">Film Stock</label>
                  <select
                    value={liveActionConfig.camera.film_stock || ''}
                    onChange={(e) => updateLiveAction('camera', { film_stock: e.target.value })}
                  >
                    <option value="">Select Film Stock...</option>
                  {getEffectiveOptions(
                    'camera.film_stock',
                    getFilmStockOptions(liveActionConfig.camera.body).map(s => ({ value: s, disabled: false }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value} title={formatOptionTitle(opt)} disabled={opt.disabled}>
                      {opt.value.replace(/_/g, ' ')}
                    </option>
                  ))}
                  </select>
                </div>
              )}
              {/* Aspect Ratio */}
              <div className="field">
                <label title="Aspect ratio determines the frame shape - wider ratios are more cinematic">Aspect Ratio</label>
                <select
                  value={liveActionConfig.camera.aspect_ratio || '1.85:1'}
                  onChange={(e) => updateLiveAction('camera', { aspect_ratio: e.target.value })}
                >
                  {getEffectiveOptions(
                    'camera.aspect_ratio',
                    getAspectRatioOptions(liveActionConfig.camera.body).map(r => ({ value: r, disabled: false }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value} title={formatOptionTitle(opt)} disabled={opt.disabled}>
                      {opt.value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Lens Section */}
            <div className="section">
              <h2>Lens</h2>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.lens_manufacturer}>Manufacturer</label>
                <select
                  value={liveActionConfig.lens.manufacturer}
                  onChange={(e) => {
                    const newManufacturer = e.target.value;
                    const validFamilies = MANUFACTURER_LENS_FAMILIES[newManufacturer] || [];
                    // ALWAYS cascade to first valid family when manufacturer changes
                    // This ensures no mismatched manufacturer/lens combinations
                    if (validFamilies.length > 0) {
                      updateLiveAction('lens', { manufacturer: newManufacturer, family: validFamilies[0] });
                    } else {
                      updateLiveAction('lens', { manufacturer: newManufacturer });
                    }
                  }}
                >
                  {getEffectiveOptions(
                    'lens.manufacturer',
                    ENUMS.lens_manufacturer.map(v => ({ value: v, disabled: false, description: OPTION_DESCRIPTIONS.lens_manufacturer?.[v] }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value} title={formatOptionTitle(opt)} disabled={opt.disabled}>{opt.value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.lens_family}>
                  Lens Family
                  {getLensFilterHint(liveActionConfig.camera.body) && (
                    <span className="field-hint">({getLensFilterHint(liveActionConfig.camera.body)})</span>
                  )}
                </label>
                <select
                  value={liveActionConfig.lens.family}
                  onChange={(e) => updateLiveAction('lens', { family: e.target.value })}
                >
                  {getEffectiveOptions(
                    'lens.family',
                    getLensFamilyOptionsWithReasons(
                      liveActionConfig.camera.body,
                      liveActionConfig.lens.manufacturer
                    )
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {LENS_FAMILY_NAMES[opt.value] || opt.value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.focal_length}>
                  Focal Length (mm)
                  {liveActionConfig.lens.family && (
                    <span className="field-hint">(available for {LENS_FAMILY_NAMES[liveActionConfig.lens.family] || liveActionConfig.lens.family.replace(/_/g, ' ')})</span>
                  )}
                </label>
                <select
                  value={liveActionConfig.lens.focal_length_mm}
                  onChange={(e) => updateLiveAction('lens', { focal_length_mm: parseInt(e.target.value, 10) })}
                >
                  {getEffectiveOptions(
                    'lens.focal_length_mm',
                    getFocalLengthOptionsWithReasons(liveActionConfig.lens.family)
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {opt.value}mm
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.anamorphic}>
                  <input
                    type="checkbox"
                    checked={liveActionConfig.lens.is_anamorphic}
                    onChange={(e) => {
                      const isAnamorphic = e.target.checked;
                      if (isAnamorphic) {
                        // Define which manufacturers have anamorphic lenses
                        const anamorphicManufacturers: Record<string, string> = {
                          'Panavision': 'Panavision_C_Series',
                          'Kowa': 'Kowa_Anamorphic',
                          'Vintage': 'Vintage_Anamorphic',
                        };
                        
                        // Check if current manufacturer has anamorphic
                        const currentManufacturer = liveActionConfig.lens.manufacturer;
                        if (anamorphicManufacturers[currentManufacturer]) {
                          // Current manufacturer has anamorphic - just set the family
                          updateLiveAction('lens', { 
                            is_anamorphic: true,
                            family: anamorphicManufacturers[currentManufacturer]
                          });
                        } else {
                          // Need to switch to a manufacturer with anamorphic
                          // Default to Panavision (industry standard for anamorphic)
                          updateLiveAction('lens', { 
                            is_anamorphic: true,
                            manufacturer: 'Panavision',
                            family: 'Panavision_C_Series'
                          });
                        }
                      } else {
                        // Turning off anamorphic - keep current manufacturer, switch to spherical lens
                        const currentManufacturer = liveActionConfig.lens.manufacturer;
                        const manufacturerFamilies = MANUFACTURER_LENS_FAMILIES[currentManufacturer] || [];
                        // Find first non-anamorphic lens family
                        const sphericalFamily = manufacturerFamilies.find(f => 
                          !f.toLowerCase().includes('anamorphic')
                        ) || manufacturerFamilies[0] || 'ARRI_Signature_Prime';
                        updateLiveAction('lens', { 
                          is_anamorphic: false,
                          family: sphericalFamily
                        });
                      }
                    }}
                  />
                  {' '}Anamorphic
                </label>
              </div>
            </div>

            {/* Movement Section */}
            <div className="section">
              <h2>Movement</h2>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.movement_equipment}>
                  Equipment 
                  {CAMERA_WEIGHTS[liveActionConfig.camera.body] === 'Heavy' && <span className="field-hint">(limited by camera weight)</span>}
                  {liveActionConfig.movement.movement_type === 'Dolly_Zoom' && <span className="field-hint">(Dolly Zoom requires Dolly/Slider)</span>}
                </label>
                <select
                  value={liveActionConfig.movement.equipment}
                  onChange={(e) => {
                    const newEquipment = e.target.value;
                    const allowedMovements = EQUIPMENT_MOVEMENT_RESTRICTIONS[newEquipment] || ENUMS.movement_type;
                    
                    // Static equipment = force all movement settings to Static
                    if (newEquipment === 'Static') {
                      updateLiveAction('movement', { 
                        equipment: 'Static', 
                        movement_type: 'Static', 
                        timing: 'Static' 
                      });
                      return;
                    }
                    
                    // If current movement type isn't allowed by new equipment, reset to first valid type
                    const currentMovementValid = allowedMovements.includes(liveActionConfig.movement.movement_type);
                    if (!currentMovementValid) {
                      updateLiveAction('movement', { equipment: newEquipment, movement_type: allowedMovements[0] || 'Static' });
                    } else {
                      updateLiveAction('movement', { equipment: newEquipment });
                    }
                  }}
                >
                  {getEffectiveOptions(
                    'movement.equipment',
                    getEquipmentOptionsWithReasons(
                      liveActionConfig.camera.body,
                      liveActionConfig.movement.movement_type
                    )
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {opt.value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.movement_type}>Movement Type <span className="field-hint">(filtered by equipment)</span></label>
                <select
                  value={liveActionConfig.movement.movement_type}
                  onChange={(e) => {
                    const newMovementType = e.target.value;
                    const allowedTimings = MOVEMENT_TYPE_TIMING_RESTRICTIONS[newMovementType];
                    // If new movement type restricts timing and current timing isn't allowed, reset to Moderate
                    if (allowedTimings && !allowedTimings.includes(liveActionConfig.movement.timing)) {
                      updateLiveAction('movement', { 
                        movement_type: newMovementType, 
                        timing: 'Moderate' // Safe default for Dolly Zoom
                      });
                    } else {
                      updateLiveAction('movement', { movement_type: newMovementType });
                    }
                  }}
                >
                  {getEffectiveOptions(
                    'movement.movement_type',
                    getMovementTypeOptionsWithReasons(liveActionConfig.movement.equipment)
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {opt.value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.movement_timing}>
                  Timing
                  {liveActionConfig.movement.movement_type === 'Dolly_Zoom' && <span className="field-hint">(Dolly Zoom requires slower timing)</span>}
                </label>
                <select
                  value={liveActionConfig.movement.timing}
                  onChange={(e) => updateLiveAction('movement', { timing: e.target.value })}
                >
                  {getEffectiveOptions(
                    'movement.timing',
                    getTimingOptionsWithReasons(liveActionConfig.movement.movement_type)
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {opt.value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Lighting Section */}
            <div className="section">
              <h2>Lighting</h2>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.time_of_day}>Time of Day</label>
                <select
                  value={liveActionConfig.lighting.time_of_day}
                  onChange={(e) => {
                    const newTimeOfDay = e.target.value;
                    const allowedSources = TIME_SOURCE_RESTRICTIONS[newTimeOfDay];
                    const currentSource = liveActionConfig.lighting.source;
                    const allowedStyles = TIME_STYLE_RESTRICTIONS[newTimeOfDay];
                    const currentStyle = liveActionConfig.lighting.style;
                    
                    // Build update object
                    const updates: Record<string, string> = { time_of_day: newTimeOfDay };
                    
                    // If time has source restrictions and current source isn't valid, cascade
                    if (allowedSources && !allowedSources.includes(currentSource)) {
                      updates.source = allowedSources[0]; // First valid source
                    }
                    
                    // If time has style restrictions and current style isn't valid, cascade
                    if (allowedStyles && !allowedStyles.includes(currentStyle)) {
                      updates.style = allowedStyles[0]; // First valid style
                    }
                    
                    updateLiveAction('lighting', updates);
                  }}
                >
                  {ENUMS.time_of_day.map((v) => (
                    <option key={v} value={v} title={OPTION_DESCRIPTIONS.time_of_day?.[v] || ''}>{v.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.lighting_source}>
                  Source 
                  <span className="field-hint">
                    {selectedLiveActionPreset 
                      ? (selectedLiveActionPreset.year < 2002 
                          ? '(filtered by time + preset + era)' 
                          : selectedLiveActionPreset.disallowed_sources.length > 0 
                            ? '(filtered by time + preset)' 
                            : '(filtered by time)')
                      : '(filtered by time)'}
                  </span>
                </label>
                <select
                  value={liveActionConfig.lighting.source}
                  onChange={(e) => updateLiveAction('lighting', { source: e.target.value })}
                >
                  {getEffectiveOptions(
                    'lighting.source',
                    getLightingSourceOptionsWithReasons(
                      liveActionConfig.lighting.time_of_day,
                      selectedLiveActionPreset?.disallowed_sources || [],
                      selectedLiveActionPreset?.year,
                      selectedLiveActionPreset?.name
                    )
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {opt.value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.lighting_style}>Style <span className="field-hint">(filtered by time & mood)</span></label>
                <select
                  value={liveActionConfig.lighting.style}
                  onChange={(e) => updateLiveAction('lighting', { style: e.target.value })}
                >
                  {getEffectiveOptions(
                    'lighting.style',
                    getLightingStyleOptionsWithReasons(
                      liveActionConfig.lighting.time_of_day,
                      liveActionConfig.visual_grammar.mood
                    )
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {opt.value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Visual Grammar Section */}
            <div className="section">
              <h2>Visual Grammar</h2>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.shot_size}>
                  Shot Size
                  {getFocalLengthShotSizeHint(liveActionConfig.lens.focal_length_mm, liveActionConfig.visual_grammar.shot_size) && (
                    <span className="field-hint warning">
                      ({getFocalLengthShotSizeHint(liveActionConfig.lens.focal_length_mm, liveActionConfig.visual_grammar.shot_size)})
                    </span>
                  )}
                </label>
                <select
                  value={liveActionConfig.visual_grammar.shot_size}
                  onChange={(e) => updateLiveAction('visual_grammar', { shot_size: e.target.value })}
                >
                  {ENUMS.shot_size.map((v) => (
                    <option key={v} value={v} title={OPTION_DESCRIPTIONS.shot_size?.[v] || ''}>{SHOT_SIZE_NAMES[v] || v}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.composition}>Composition</label>
                <select
                  value={liveActionConfig.visual_grammar.composition}
                  onChange={(e) => updateLiveAction('visual_grammar', { composition: e.target.value })}
                >
                  {getEffectiveOptions(
                    'visual_grammar.composition',
                    ENUMS.composition.map(v => ({ value: v, disabled: false, description: OPTION_DESCRIPTIONS.composition?.[v] }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value} title={formatOptionTitle(opt)} disabled={opt.disabled}>{opt.value.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.mood}>
                  Mood
                  {selectedLiveActionPreset && selectedLiveActionPreset.disallowed_moods.length > 0 && (
                    <span className="field-hint">(filtered by preset)</span>
                  )}
                </label>
                <select
                  value={liveActionConfig.visual_grammar.mood}
                  onChange={(e) => {
                    const newMood = e.target.value;
                    const moodRestriction = MOOD_LIGHTING_RESTRICTIONS[newMood];
                    // If new mood disallows current lighting style, reset to first valid style
                    if (moodRestriction?.disallowed.includes(liveActionConfig.lighting.style)) {
                      // Find first valid lighting style for this mood
                      const validStyles = ENUMS.lighting_style.filter(s => !moodRestriction.disallowed.includes(s));
                      // Prefer the mood's preferred styles if available
                      const preferredValid = moodRestriction.preferred?.find(s => validStyles.includes(s));
                      const newStyle = preferredValid || validStyles[0] || 'High_Key';
                      updateLiveAction('visual_grammar', { mood: newMood });
                      updateLiveAction('lighting', { style: newStyle });
                    } else {
                      updateLiveAction('visual_grammar', { mood: newMood });
                    }
                  }}
                >
                  {getEffectiveOptions(
                    'visual_grammar.mood',
                    getMoodOptionsWithReasons(
                      selectedLiveActionPreset?.disallowed_moods || [],
                      selectedLiveActionPreset?.name
                    )
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {opt.value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.color_tone}>Color Tone</label>
                <select
                  value={liveActionConfig.visual_grammar.color_tone}
                  onChange={(e) => updateLiveAction('visual_grammar', { color_tone: e.target.value })}
                >
                  {ENUMS.color_tone.map((v) => (
                    <option key={v} value={v} title={OPTION_DESCRIPTIONS.color_tone?.[v] || ''}>{v.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Animation: Style Section */}
            <div className="section">
              <h2>Style</h2>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.animation_medium}>Medium</label>
                <select
                  value={animationConfig.medium}
                  onChange={(e) => updateAnimation('medium', e.target.value as never)}
                >
                  {getEffectiveOptions(
                    'medium',
                    ENUMS.animation_medium.map(v => ({ value: v, disabled: false, description: OPTION_DESCRIPTIONS.animation_medium?.[v] }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value} title={formatOptionTitle(opt)} disabled={opt.disabled}>{opt.value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.style_domain}>Style Domain</label>
                <select
                  value={animationConfig.style_domain}
                  onChange={(e) => {
                    const newDomain = e.target.value;
                    const restrictions = ANIMATION_DOMAIN_RESTRICTIONS[newDomain];
                    
                    // Build reset object for any invalid values
                    const updates: Record<string, unknown> = {};
                    
                    // Check color application
                    if (restrictions?.disallowed_colors?.includes(animationConfig.rendering.color_application)) {
                      // Find first valid color (Monochrome_Ink for Manga)
                      const validColors = ENUMS.color_application.filter(c => !restrictions.disallowed_colors?.includes(c));
                      updates.rendering = { ...animationConfig.rendering, color_application: validColors[0] || 'Monochrome_Ink' };
                    }
                    
                    // Check motion style
                    if (restrictions?.disallowed_motion?.includes(animationConfig.motion.motion_style)) {
                      updates.motion = { ...animationConfig.motion, motion_style: 'None' };
                    }
                    
                    // Check virtual camera
                    if (restrictions?.disallowed_cameras?.includes(animationConfig.motion.virtual_camera)) {
                      updates.motion = { ...(updates.motion || animationConfig.motion), virtual_camera: 'Locked' };
                    }
                    
                    // Check lighting model - if required_lighting, force it; if disallowed, avoid it
                    if (restrictions?.required_lighting && !restrictions.required_lighting.includes(animationConfig.rendering.lighting_model)) {
                      updates.rendering = { ...(updates.rendering || animationConfig.rendering), lighting_model: restrictions.required_lighting[0] };
                    } else if (restrictions?.disallowed_lighting?.includes(animationConfig.rendering.lighting_model)) {
                      const validLighting = ENUMS.lighting_model.filter(l => !restrictions.disallowed_lighting?.includes(l));
                      updates.rendering = { ...(updates.rendering || animationConfig.rendering), lighting_model: validLighting[0] || 'Cel_Shaded' };
                    }
                    
                    // Apply domain change
                    updateAnimation('style_domain', newDomain as never);
                    
                    // Apply cascaded resets if any
                    if (updates.rendering) {
                      updateAnimation('rendering', updates.rendering);
                    }
                    if (updates.motion) {
                      updateAnimation('motion', updates.motion);
                    }
                  }}
                >
                  {getEffectiveOptions(
                    'style_domain',
                    ENUMS.style_domain.map(v => ({ value: v, disabled: false, description: OPTION_DESCRIPTIONS.style_domain?.[v] }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value} title={formatOptionTitle(opt)} disabled={opt.disabled}>{opt.value}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Animation: Rendering Section */}
            <div className="section">
              <h2>Rendering</h2>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.line_treatment}>Line Treatment</label>
                <select
                  value={animationConfig.rendering.line_treatment}
                  onChange={(e) => updateAnimation('rendering', { line_treatment: e.target.value })}
                >
                  {getEffectiveOptions(
                    'rendering.line_treatment',
                    ENUMS.line_treatment.map(v => ({ value: v, disabled: false, description: OPTION_DESCRIPTIONS.line_treatment?.[v] }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value} title={formatOptionTitle(opt)} disabled={opt.disabled}>{opt.value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.color_application}>Color Application {animationConfig.style_domain === 'Manga' && <span className="field-hint">(Manga: Monochrome only)</span>}</label>
                <select
                  value={animationConfig.rendering.color_application}
                  onChange={(e) => updateAnimation('rendering', { color_application: e.target.value })}
                >
                  {getEffectiveOptions(
                    'rendering.color_application',
                    getColorApplicationOptionsWithReasons(animationConfig.style_domain)
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {opt.value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.lighting_model}>
                  Lighting Model
                  {animationConfig.style_domain === 'Manga' && <span className="field-hint">(Manga: Graphic only)</span>}
                  {animationConfig.style_domain === 'ThreeD' && <span className="field-hint">(3D: No Flat lighting)</span>}
                </label>
                <select
                  value={animationConfig.rendering.lighting_model}
                  onChange={(e) => updateAnimation('rendering', { lighting_model: e.target.value })}
                >
                  {getEffectiveOptions(
                    'rendering.lighting_model',
                    getLightingModelOptionsWithReasons(animationConfig.style_domain)
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {opt.value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.surface_detail}>Surface Detail</label>
                <select
                  value={animationConfig.rendering.surface_detail}
                  onChange={(e) => updateAnimation('rendering', { surface_detail: e.target.value })}
                >
                  {getEffectiveOptions(
                    'rendering.surface_detail',
                    ENUMS.surface_detail.map(v => ({ value: v, disabled: false, description: OPTION_DESCRIPTIONS.surface_detail?.[v] }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value} title={formatOptionTitle(opt)} disabled={opt.disabled}>{opt.value}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Animation: Motion Section */}
            <div className="section">
              <h2>Motion</h2>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.motion_style}>Motion Style {(animationConfig.style_domain === 'Manga' || animationConfig.style_domain === 'Illustration') && <span className="field-hint">(static only)</span>}</label>
                <select
                  value={animationConfig.motion.motion_style}
                  onChange={(e) => updateAnimation('motion', { motion_style: e.target.value })}
                >
                  {getEffectiveOptions(
                    'motion.motion_style',
                    getMotionStyleOptionsWithReasons(animationConfig.style_domain)
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {opt.value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.virtual_camera}>
                  Virtual Camera 
                  <span className="field-hint">
                    (filtered by domain/medium{animationConfig.motion.motion_style === 'None' ? '/motion' : ''})
                  </span>
                </label>
                <select
                  value={animationConfig.motion.virtual_camera}
                  onChange={(e) => updateAnimation('motion', { virtual_camera: e.target.value })}
                >
                  {getEffectiveOptions(
                    'motion.virtual_camera',
                    getVirtualCameraOptionsWithReasons(
                      animationConfig.style_domain, 
                      animationConfig.medium,
                      animationConfig.motion.motion_style
                    )
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                      disabled={opt.disabled}
                    >
                      {opt.value.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Animation: Visual Grammar */}
            <div className="section">
              <h2>Visual Grammar</h2>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.shot_size}>Shot Size</label>
                <select
                  value={animationConfig.visual_grammar.shot_size}
                  onChange={(e) => updateAnimation('visual_grammar', { shot_size: e.target.value })}
                >
                  {ENUMS.shot_size.map((v) => (
                    <option key={v} value={v} title={OPTION_DESCRIPTIONS.shot_size?.[v] || ''}>{SHOT_SIZE_NAMES[v] || v}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.mood}>Mood</label>
                <select
                  value={animationConfig.visual_grammar.mood}
                  onChange={(e) => updateAnimation('visual_grammar', { mood: e.target.value })}
                >
                  {getAnimationMoodOptionsWithReasons(
                    selectedAnimationPreset?.mood || [],
                    selectedAnimationPreset?.name
                  ).map((opt) => (
                    <option 
                      key={opt.value} 
                      value={opt.value}
                      title={formatOptionTitle(opt)}
                    >
                      {opt.value}{selectedAnimationPreset?.mood?.includes(opt.value) ? ' ★' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label title={FIELD_DESCRIPTIONS.color_tone}>Color Tone</label>
                <select
                  value={animationConfig.visual_grammar.color_tone}
                  onChange={(e) => updateAnimation('visual_grammar', { color_tone: e.target.value })}
                >
                  {ENUMS.color_tone.map((v) => (
                    <option key={v} value={v} title={OPTION_DESCRIPTIONS.color_tone?.[v] || ''}>{v.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}

// Export the main Cinema Prompt Engineering component
export { App as CinemaPromptEngineering };
export default App;
