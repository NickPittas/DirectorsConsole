/**
 * Camera Angle Data Module
 * 
 * Defines 96 camera angles (8 directions × 4 heights × 3 shot sizes)
 * for the multi-angle LoRA workflow.
 * 
 * Reference: https://github.com/NickPittas/ComfyUI_CameraAngleSelector
 */

// ============================================================================
// Constants
// ============================================================================

export const VIEW_DIRECTIONS = [
  'front',
  'front-right quarter',
  'right side',
  'back-right quarter',
  'back',
  'back-left quarter',
  'left side',
  'front-left quarter',
] as const;

export const HEIGHT_ANGLES = [
  'low-angle',
  'eye-level',
  'elevated',
  'high-angle',
] as const;

export const SHOT_SIZES = [
  'close-up',
  'medium',
  'wide',
] as const;

export const ANGLE_LORA_NAME = 'qwen-image-edit-2511-multiple-angles-lora.safetensors';

// ============================================================================
// Types
// ============================================================================

export type Direction = typeof VIEW_DIRECTIONS[number];
export type Height = typeof HEIGHT_ANGLES[number];
export type ShotSize = typeof SHOT_SIZES[number];

export interface CameraAngle {
  id: string;
  direction: Direction;
  height: Height;
  size: ShotSize;
  prompt: string;
  displayName: string;
}

// ============================================================================
// Camera Angles Generation
// ============================================================================

/**
 * Generate all 96 camera angle combinations
 */
function generateCameraAngles(): CameraAngle[] {
  const angles: CameraAngle[] = [];

  for (const direction of VIEW_DIRECTIONS) {
    for (const height of HEIGHT_ANGLES) {
      for (const size of SHOT_SIZES) {
        const id = `${direction.replace(/\s+/g, '-')}_${height}_${size}`;
        const prompt = formatAnglePrompt({ direction, height, size });
        const displayName = formatDisplayName({ direction, height, size });
        
        angles.push({
          id,
          direction,
          height,
          size,
          prompt,
          displayName,
        });
      }
    }
  }

  return angles;
}

/**
 * Format angle into prompt string
 * Format: "<sks> {direction} view {height} shot {size} shot"
 */
export function formatAnglePrompt(angles: {
  direction: Direction;
  height: Height;
  size: ShotSize;
}): string {
  return `<sks> ${angles.direction} view ${angles.height} shot ${angles.size} shot`;
}

/**
 * Format angle into display name
 * Example: "Front Eye-Level Medium"
 */
function formatDisplayName(angles: {
  direction: Direction;
  height: Height;
  size: ShotSize;
}): string {
  const directionWords = angles.direction.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
  const heightWords = angles.height.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join('-');
  const sizeWords = angles.size.charAt(0).toUpperCase() + angles.size.slice(1);
  
  return `${directionWords} ${heightWords} ${sizeWords}`;
}

// Export all 96 camera angles
export const CAMERA_ANGLES: CameraAngle[] = generateCameraAngles();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get camera angle by ID
 */
export function getAngleById(id: string): CameraAngle | undefined {
  return CAMERA_ANGLES.find(angle => angle.id === id);
}

/**
 * Get camera angle by its components
 */
export function getAngleByComponents(
  direction: Direction,
  height: Height,
  size: ShotSize
): CameraAngle | undefined {
  return CAMERA_ANGLES.find(angle => 
    angle.direction === direction &&
    angle.height === height &&
    angle.size === size
  );
}

/**
 * Extract angle ID from a prompt string
 * Returns null if no valid angle prefix found
 */
export function parseAngleFromPrompt(prompt: string): CameraAngle | null {
  // Match "<sks> {direction} view {height} shot {size} shot"
  const angleRegex = /^<sks>\s+([\w\s-]+?)\s+view\s+([\w-]+?)\s+shot\s+([\w-]+?)\s+shot/i;
  const match = prompt.match(angleRegex);
  
  if (!match) return null;
  
  const [, directionStr, heightStr, sizeStr] = match;
  
  // Normalize the strings to match our constants
  const direction = normalizeDirection(directionStr.toLowerCase().trim());
  const height = normalizeHeight(heightStr.toLowerCase().trim());
  const size = normalizeShotSize(sizeStr.toLowerCase().trim());
  
  if (!direction || !height || !size) return null;
  
  return getAngleByComponents(direction, height, size) ?? null;
}

/**
 * Remove angle prefix from prompt string
 * Returns the prompt without the angle prefix
 */
export function removeAnglePrefix(prompt: string): string {
  const angleRegex = /^<sks>\s+[\w\s-]+?\s+view\s+[\w-]+?\s+shot\s+[\w-]+?\s+shot\s*/i;
  return prompt.replace(angleRegex, '').trim();
}

/**
 * Check if prompt contains a valid angle prefix
 */
export function hasAnglePrefix(prompt: string): boolean {
  return parseAngleFromPrompt(prompt) !== null;
}

// ============================================================================
// Normalization Helpers
// ============================================================================

function normalizeDirection(input: string): Direction | null {
  // Normalize spaces and dashes
  const normalized = input
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const match = VIEW_DIRECTIONS.find(d => {
    const dNormalized = d.toLowerCase();
    return normalized === dNormalized;
  });
  
  return match || null;
}

function normalizeHeight(input: string): Height | null {
  const match = HEIGHT_ANGLES.find(h => h.toLowerCase() === input);
  return match || null;
}

function normalizeShotSize(input: string): ShotSize | null {
  const match = SHOT_SIZES.find(s => s.toLowerCase() === input);
  return match || null;
}

// ============================================================================
// Three.js Position Helpers
// ============================================================================

/**
 * Get 3D position for a camera angle marker
 * Returns [x, y, z] coordinates
 */
export function getAnglePosition(angle: CameraAngle): [number, number, number] {
  const directionIndex = VIEW_DIRECTIONS.indexOf(angle.direction);
  const heightIndex = HEIGHT_ANGLES.indexOf(angle.height);
  const sizeIndex = SHOT_SIZES.indexOf(angle.size);
  
  // Calculate horizontal angle (direction)
  // Front is 0 degrees, going clockwise
  const horizontalAngle = (directionIndex / VIEW_DIRECTIONS.length) * Math.PI * 2;
  
  // Radius from center based on shot size
  const radii = [2.0, 2.5, 3.0]; // close-up, medium, wide
  const radius = radii[sizeIndex];
  
  // Height positions
  const heights = [0.3, 1.0, 1.7, 2.4]; // low, eye, elevated, high
  const y = heights[heightIndex];
  
  // Calculate X and Z positions
  const x = Math.sin(horizontalAngle) * radius;
  const z = Math.cos(horizontalAngle) * radius;
  
  return [x, y, z];
}

/**
 * Get color for a direction
 * Returns hex color string (green=front, red=back, gradient in between)
 */
export function getDirectionColor(direction: Direction): number {
  const index = VIEW_DIRECTIONS.indexOf(direction);
  
  // Create a color gradient
  // Front (0) = green (0x00ff00)
  // Back (4) = red (0xff0000)
  // Sides blend accordingly
  
  if (index === 0) return 0x00ff00; // Front - green
  if (index === 4) return 0xff0000; // Back - red
  
  // Interpolate for other directions
  const progress = index / VIEW_DIRECTIONS.length;
  const r = Math.floor(progress * 255);
  const g = Math.floor((1 - progress) * 255);
  return (r << 16) | (g << 8) | 0;
}

/**
 * Get height ring color
 */
export function getHeightColor(height: Height): number {
  const index = HEIGHT_ANGLES.indexOf(height);
  const colors = [0x4444ff, 0xffff44, 0xffaa00, 0xff4444];
  return colors[index];
}

/**
 * Get shot size radius
 */
export function getShotRadius(size: ShotSize): number {
  const index = SHOT_SIZES.indexOf(size);
  const radii = [2.0, 2.5, 3.0];
  return radii[index];
}
