import type {
  EnhancementImageMode,
  PromptConditioningAdapter,
  PromptSkillCatalogMatch,
  PromptSkillCatalogResponse,
  PromptSkillTask,
} from '../api/client';

/**
 * Task-specific prompt guidance controls for the Prompt Engineer.
 *
 * Everything shown here is derived from the backend skill catalog for the
 * current generation target. The menu picks a generation purpose (text to
 * video, edit, first/last frame, reference sheet, ...) — it never selects an
 * agent model and never changes the generation model or attached media.
 */

export interface SkillProfileSelection {
  targetModel: string;
  task: PromptSkillTask;
  modelVersion: string;
  conditioningAdapter: PromptConditioningAdapter | null;
}

export interface SkillProfileOption {
  key: string;
  label: string;
  selectable: boolean;
  task: PromptSkillTask;
  modelVersion: string;
  conditioningAdapter: PromptConditioningAdapter | null;
  /** Current-inputs guidance shown while this task is selected, or null when usable now. */
  guidance?: string;
}

export interface SkillProfileContext {
  hasImages: boolean;
  imageMode: EnhancementImageMode;
  imageCount: number;
  /** Images that act as generator conditioning (description-only images are not). */
  conditioningCount: number;
  /** Media-derived purpose of the current inputs, mirroring backend inference. */
  videoTask: 't2v' | 'i2v' | 'first_last' | 'reference' | null;
  assetRoles: ReadonlySet<string>;
  effectiveDialect: string | null;
}

const TASK_LABELS: Record<PromptSkillTask, string> = {
  t2v: 'Text to video',
  i2v: 'Image to video',
  first_last: 'First and last frame',
  reference: 'Reference video',
  v2v: 'Video to video',
  t2i: 'Text to image',
  edit: 'Image edit',
  multi_reference: 'Multi-reference',
  style_reference: 'Style reference',
  outpaint: 'Outpaint',
  rgba: 'Transparency (RGBA)',
  control: 'Control guidance',
  relight: 'Relight',
  restore: 'Restore',
  upscale: 'Upscale',
  hdr: 'HDR',
  audio_edit: 'Audio edit',
};

const ADAPTER_LABELS: Record<PromptConditioningAdapter, string> = {
  ingredients: 'Ingredients',
  union_control: 'Union control',
  motion_track_control: 'Motion track control',
  layout_to_render: 'Layout to render',
  in_outpainting: 'In/out painting',
  relight: 'Relight',
  day_to_night: 'Day to night',
  colorization: 'Colorization',
  decompression: 'Decompression',
  deblur: 'Deblur',
  water_simulation: 'Water simulation',
  clean_plate: 'Clean plate',
  instant_shave: 'Instant shave',
  cross_eyed: 'Cross-eyed',
  pixel_spatial_upscaler: 'Spatial upscaler',
  refine_details: 'Refine details',
  restore: 'Restore',
  alpha_gen: 'Alpha generation',
  hdr: 'HDR',
  sdr_to_hdr: 'SDR to HDR',
  dub_it: 'Dubbing',
};

// Keep these in sync with the labels of the image-use menu.
const IMAGE_USE_LABELS: Record<EnhancementImageMode, string> = {
  description_only: 'Describe image',
  reference: 'Use as reference',
  starting_frame: 'Use as starting image',
};

const ROLE_INPUT_LABELS: Record<string, string> = {
  first_frame: 'a confirmed starting frame',
  last_frame: 'a confirmed final frame',
  reference_image: 'reference image(s)',
  reference_video: 'a source video',
  reference_audio: 'reference audio',
};

const VIDEO_TASKS = new Set<PromptSkillTask>(['t2v', 'i2v', 'first_last', 'reference', 'v2v']);

export function skillProfileKey(
  selection: Pick<SkillProfileSelection, 'task' | 'modelVersion' | 'conditioningAdapter'>,
): string {
  return `${selection.task}|${selection.conditioningAdapter ?? ''}|${selection.modelVersion}`;
}

export function skillProfileLabel(
  task: PromptSkillTask,
  adapter: PromptConditioningAdapter | null,
): string {
  const base = TASK_LABELS[task] ?? task;
  return adapter ? `${base} (${ADAPTER_LABELS[adapter] ?? adapter})` : base;
}

function roleGuidance(roles: string[], ctx: SkillProfileContext): string {
  if (roles.includes('first_frame') && roles.includes('last_frame')) {
    return 'This task aligns a first and a last frame. The image inputs here can attach a starting frame only, so it cannot run with the current inputs.';
  }
  if (roles.includes('last_frame')) {
    return 'This task also needs a confirmed final frame, which the image inputs here cannot provide yet.';
  }
  if (roles.includes('reference_video')) {
    return 'This task needs a source video as input, which image attachments cannot provide.';
  }
  if (roles.includes('reference_audio')) {
    return 'This task needs reference audio as input, which image attachments cannot provide.';
  }
  if (roles.includes('first_frame')) {
    return 'This task needs a confirmed starting frame. Attach one image with image use "Use as starting image".';
  }
  if (roles.includes('reference_image')) {
    return ctx.hasImages
      ? 'This task needs the images attached as references. Switch image use to "Use as reference".'
      : 'This task needs reference images. Attach them with image use "Use as reference".';
  }
  const list = roles.map(role => ROLE_INPUT_LABELS[role] ?? role).join(', ');
  return `This task needs additional confirmed media input: ${list}.`;
}

function taskConflictGuidance(task: PromptSkillTask, ctx: SkillProfileContext): string {
  switch (task) {
    case 't2v':
      return 'Text-to-video builds the shot from the description alone. Remove the attached images or switch their image use to "Describe image".';
    case 'i2v':
      return ctx.hasImages
        ? 'Image-to-video needs a single starting frame. Switch image use to "Use as starting image".'
        : 'Image-to-video needs a starting frame. Attach one image with image use "Use as starting image".';
    case 'first_last':
      return 'This task aligns a first and a last frame. The image inputs here can attach a starting frame only, so it cannot run with the current inputs.';
    case 'reference':
      return ctx.hasImages
        ? 'Reference-guided video works from reference images. Switch image use to "Use as reference".'
        : 'Reference-guided video needs reference images. Attach them with image use "Use as reference".';
    case 'v2v':
      return 'This task edits an existing source video, which image attachments cannot provide.';
    default:
      return 'This task does not match the current media inputs.';
  }
}

/** Mirror of the backend media checks, phrased as user guidance. */
function mediaGuidance(match: PromptSkillCatalogMatch, ctx: SkillProfileContext): string | null {
  const media = match.media ?? {};
  const allowedModes = media.imageModes ?? [];
  if (ctx.imageCount > 0 && allowedModes.length > 0 && !allowedModes.includes(ctx.imageMode)) {
    const names = allowedModes.map(mode => IMAGE_USE_LABELS[mode] ?? mode).join('" or "');
    return `This task expects the images with image use "${names}". Change the image-use menu or remove the images.`;
  }
  const missingRoles = (media.requiredRoles ?? []).filter(role => !ctx.assetRoles.has(role));
  if (missingRoles.length > 0) return roleGuidance(missingRoles, ctx);
  const anyRoles = media.requiredRolesAny ?? [];
  const hasAnyRole = anyRoles.some(role => ctx.assetRoles.has(role));
  if (anyRoles.length > 0 && !hasAnyRole) return roleGuidance(anyRoles, ctx);
  const minImages = media.minImages ?? 0;
  if (ctx.conditioningCount < minImages && !hasAnyRole) {
    return `This task needs at least ${minImages} image${minImages === 1 ? '' : 's'} attached as generator input. Switch image use to "Use as reference" and attach ${minImages === 1 ? 'it' : 'them'}.`;
  }
  const maxImages = media.maxImages;
  if (maxImages !== undefined && ctx.conditioningCount > maxImages) {
    return `This task accepts at most ${maxImages} image${maxImages === 1 ? '' : 's'} as generator input. Remove the extra images or change their image use.`;
  }
  if ((media.requiresImagesWhenMode ?? []).includes(ctx.imageMode) && ctx.imageCount === 0) {
    return 'This task needs the actual image attached for the chosen image use. Add the image file.';
  }
  return null;
}

interface MatchFailure {
  rank: number;
  message: string;
}

function matchFailure(match: PromptSkillCatalogMatch, ctx: SkillProfileContext): MatchFailure | null {
  if (VIDEO_TASKS.has(match.task)) {
    if (ctx.videoTask === null) {
      return { rank: 0, message: 'This task guides video generation and does not match the current inputs.' };
    }
    if (ctx.videoTask !== match.task) {
      return { rank: 0, message: taskConflictGuidance(match.task, ctx) };
    }
  }
  const mediaMessage = mediaGuidance(match, ctx);
  if (mediaMessage) return { rank: 1, message: mediaMessage };
  if (match.dialect_id && ctx.effectiveDialect && match.dialect_id !== ctx.effectiveDialect) {
    return {
      rank: 2,
      message: 'This task needs its matching model variant. Pick the matching entry in the variant menu next to the generation model.',
    };
  }
  return null;
}

function profileGuidance(matches: PromptSkillCatalogMatch[], ctx: SkillProfileContext): string | null {
  let worst: MatchFailure | null = null;
  for (const match of matches) {
    const failure = matchFailure(match, ctx);
    if (failure === null) return null;
    if (!worst || failure.rank < worst.rank) worst = failure;
  }
  return worst ? worst.message : null;
}

/**
 * Merge the catalog matches into one option per task/adapter/version and
 * evaluate each against the current inputs. Matches the catalog reports as
 * not selectable are omitted; the backend remains authoritative at enhance
 * time and its validation still decides.
 */
export function evaluateSkillProfiles(
  catalog: PromptSkillCatalogResponse,
  ctx: SkillProfileContext,
): SkillProfileOption[] {
  const groups = new Map<string, PromptSkillCatalogMatch[]>();
  for (const match of catalog.matches) {
    const key = skillProfileKey({
      task: match.task,
      conditioningAdapter: match.conditioning_adapter,
      modelVersion: match.model_version,
    });
    const bucket = groups.get(key);
    if (bucket) bucket.push(match);
    else groups.set(key, [match]);
  }
  const distinctVersions = new Set(Array.from(groups.values(), matches => matches[0].model_version));
  const options: SkillProfileOption[] = [];
  for (const [key, matches] of groups) {
    const selectableMatches = matches.filter(match => match.status !== 'unsupported');
    if (selectableMatches.length === 0) continue;
    const head = selectableMatches[0];
    let label = skillProfileLabel(head.task, head.conditioning_adapter);
    if (distinctVersions.size > 1) label = `${label} — ${head.model_version}`;
    const guidance = profileGuidance(selectableMatches, ctx);
    options.push({
      key,
      label,
      selectable: true,
      task: head.task,
      modelVersion: head.model_version,
      conditioningAdapter: head.conditioning_adapter,
      ...(guidance ? { guidance } : {}),
    });
  }
  return options;
}

interface PromptSkillSelectorProps {
  options: SkillProfileOption[];
  /** Selected profile key, or '' for automatic. */
  value: string;
  onValueChange: (key: string) => void;
  loading: boolean;
  disabled?: boolean;
  notice?: string | null;
  noticeTone?: 'guidance' | 'info';
}

export function PromptSkillSelector({
  options,
  value,
  onValueChange,
  loading,
  disabled = false,
  notice = null,
  noticeTone = 'info',
}: PromptSkillSelectorProps) {
  if (loading) return null;
  if (options.length === 0 && !notice) return null;
  const known = options.some(option => option.key === value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, maxWidth: '280px' }}>
      <select
        className="toolbar-model"
        aria-label="Generation task"
        title="Choose the generation purpose for task-specific prompt guidance. Automatic keeps the existing model guidance."
        value={value}
        disabled={disabled}
        onChange={event => onValueChange(event.target.value)}
      >
        {!known && value && <option value={value}>Previously selected task — unavailable</option>}
        <option value="">Automatic — current model guidance</option>
        {options.filter(option => option.selectable).map(option => (
          <option key={option.key} value={option.key}>{option.label}</option>
        ))}
      </select>
      {notice && (
        <span
          role="status"
          style={{
            color: noticeTone === 'guidance' ? 'var(--text-warning, #f59e0b)' : 'var(--text-muted)',
            fontSize: '0.75rem',
            lineHeight: 1.35,
          }}
        >
          {notice}
        </span>
      )}
    </div>
  );
}
