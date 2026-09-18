export type TabType = 'image-generation' | 'image-editing' | 'upscaling' | 'video-generation';
export type SubTabType = 'text2img' | 'img2img' | 'inpainting' | 'editing' | 'upscale' | 'img2vid' | 'txt2vid' | 'fflf';

export type CanonicalWorkflowCategory =
  | 'Image Generation'
  | 'Text to Image'
  | 'Image to Image'
  | 'InPainting'
  | 'Image Editing'
  | 'Upscaling'
  | 'Video Generation'
  | 'Image to Video'
  | 'Text to Video'
  | 'First/Last Frame to Video';

// Keep imported/custom tags intact while giving canonical tags editor autocomplete.
export type LegacyWorkflowCategory = Record<string, unknown>;
export type WorkflowCategory = CanonicalWorkflowCategory | (string & {}) | LegacyWorkflowCategory;

export function getWorkflowCategoryLabel(category: unknown): string | undefined {
  if (typeof category === 'string') return category;
  if (!category || typeof category !== 'object') return undefined;
  const value = category as Record<string, unknown>;
  return [value.label, value.name, value.id].find(item => typeof item === 'string');
}

export const WORKFLOW_CATEGORIES: CanonicalWorkflowCategory[] = [
  'Image Generation',
  'Text to Image',
  'Image to Image',
  'InPainting',
  'Image Editing',
  'Upscaling',
  'Video Generation',
  'Image to Video',
  'Text to Video',
  'First/Last Frame to Video',
];

export const SUBCATEGORY_TO_CATEGORY_MAP: Record<string, CanonicalWorkflowCategory> = {
  text2img: 'Text to Image',
  img2img: 'Image to Image',
  inpainting: 'InPainting',
  editing: 'Image Editing',
  upscale: 'Upscaling',
  img2vid: 'Image to Video',
  txt2vid: 'Text to Video',
  fflf: 'First/Last Frame to Video',
};

export const CATEGORY_TO_ROUTE: Partial<Record<CanonicalWorkflowCategory, { category: TabType; subCategory: SubTabType }>> = {
  'Text to Image': { category: 'image-generation', subCategory: 'text2img' },
  'Image to Image': { category: 'image-generation', subCategory: 'img2img' },
  InPainting: { category: 'image-generation', subCategory: 'inpainting' },
  'Image Editing': { category: 'image-editing', subCategory: 'editing' },
  Upscaling: { category: 'upscaling', subCategory: 'upscale' },
  'Image to Video': { category: 'video-generation', subCategory: 'img2vid' },
  'Text to Video': { category: 'video-generation', subCategory: 'txt2vid' },
  'First/Last Frame to Video': { category: 'video-generation', subCategory: 'fflf' },
};

export interface WorkflowRoute {
  category: TabType;
  subCategory: SubTabType;
}

const ROUTES: WorkflowRoute[] = Object.values(CATEGORY_TO_ROUTE).filter(
  (route): route is WorkflowRoute => Boolean(route),
);

export function isTabType(value: unknown): value is TabType {
  return typeof value === 'string' && ['image-generation', 'image-editing', 'upscaling', 'video-generation'].includes(value);
}

export function isSubTabType(value: unknown): value is SubTabType {
  return typeof value === 'string' && [
    'text2img', 'img2img', 'inpainting', 'editing', 'upscale', 'img2vid', 'txt2vid', 'fflf',
  ].includes(value);
}

export function isValidWorkflowRoute(category: unknown, subCategory: unknown): category is TabType {
  return isTabType(category) && isSubTabType(subCategory)
    && ROUTES.some(route => route.category === category && route.subCategory === subCategory);
}

export function getDefaultSubCategory(tab: TabType): SubTabType {
  switch (tab) {
    case 'image-editing': return 'editing';
    case 'upscaling': return 'upscale';
    case 'video-generation': return 'img2vid';
    default: return 'text2img';
  }
}

export function getCategoryRoute(category: WorkflowCategory | string | undefined): WorkflowRoute | undefined {
  const labels = category && typeof category === 'object'
    ? [getWorkflowCategoryLabel(category), category.id, category.name]
    : [getWorkflowCategoryLabel(category)];
  const names = labels.filter((label): label is string => Boolean(label));
  const categoryName = names.find(label => CATEGORY_TO_ROUTE[label as CanonicalWorkflowCategory]);
  if (categoryName) return CATEGORY_TO_ROUTE[categoryName as CanonicalWorkflowCategory];
  const canonicalName = names.map(label => SUBCATEGORY_TO_CATEGORY_MAP[label]).find(Boolean);
  return canonicalName ? CATEGORY_TO_ROUTE[canonicalName] : undefined;
}

export function getCategoryForRoute(route: WorkflowRoute | undefined): CanonicalWorkflowCategory | undefined {
  if (!route) return undefined;
  return (Object.keys(CATEGORY_TO_ROUTE) as CanonicalWorkflowCategory[]).find(category => {
    const candidate = CATEGORY_TO_ROUTE[category];
    return candidate?.category === route.category && candidate.subCategory === route.subCategory;
  });
}

export function getLeafRoutes(categories: readonly WorkflowCategory[] | undefined): WorkflowRoute[] {
  if (!categories) return [];
  return categories
    .map(getCategoryRoute)
    .filter((route): route is WorkflowRoute => Boolean(route));
}

export function getWorkflowRoutes(workflow: {
  category?: string;
  subCategory?: string;
  categories?: readonly WorkflowCategory[];
}): WorkflowRoute[] {
  const explicitRoutes = getLeafRoutes(workflow.categories);
  if (explicitRoutes.length > 0) return explicitRoutes;
  if (isValidWorkflowRoute(workflow.category, workflow.subCategory)) {
    return [{ category: workflow.category as TabType, subCategory: workflow.subCategory as SubTabType }];
  }
  return [];
}

export function workflowMatchesRoute(
  workflow: { category?: string; subCategory?: string; categories?: readonly WorkflowCategory[] },
  category: TabType,
  subCategory: SubTabType,
): boolean {
  return getWorkflowRoutes(workflow).some(route => route.category === category && route.subCategory === subCategory);
}

export function getPrimaryWorkflowRoute(workflow: {
  category?: string;
  subCategory?: string;
  categories?: readonly WorkflowCategory[];
}): WorkflowRoute | undefined {
  return getWorkflowRoutes(workflow)[0];
}

export function isVideoWorkflow(workflow: {
  category?: string;
  subCategory?: string;
  categories?: readonly WorkflowCategory[];
} | undefined): boolean {
  if (!workflow) return false;
  const explicitRoutes = getLeafRoutes(workflow.categories);
  if (explicitRoutes.length > 0) return explicitRoutes.some(route => route.category === 'video-generation');
  return workflow.category === 'video-generation'
    || getWorkflowRoutes(workflow).some(route => route.category === 'video-generation');
}

export function getCategorySelectionError(categories: readonly WorkflowCategory[]): string | undefined {
  if (categories.some(category => getWorkflowCategoryLabel(category) === 'Video Generation')
    && !getLeafRoutes(categories).some(route => route.category === 'video-generation')) {
    return 'Choose Image to Video, Text to Video, or First/Last Frame to Video before saving Video Generation.';
  }
  return undefined;
}

export function applyWorkflowCategorySelection<T extends {
  category: TabType;
  subCategory: SubTabType;
  categories?: WorkflowCategory[];
}>(workflow: T, categories: WorkflowCategory[], preferredCategory?: string): T {
  const nextCategories = Array.from(new Set(categories));
  const error = getCategorySelectionError(nextCategories);
  if (error) throw new Error(error);

  const preferredRoute = getCategoryRoute(preferredCategory);
  const selectedRoute = preferredRoute || getLeafRoutes(nextCategories)[0];
  if (!selectedRoute) return { ...workflow, categories: nextCategories };

  if (selectedRoute.category === 'video-generation'
    && !nextCategories.some(category => getWorkflowCategoryLabel(category) === 'Video Generation')) {
    nextCategories.push('Video Generation');
  }

  return {
    ...workflow,
    category: selectedRoute.category,
    subCategory: selectedRoute.subCategory,
    categories: nextCategories,
  };
}

export function filterWorkflowsByRoute<T extends {
  category?: string;
  subCategory?: string;
  categories?: readonly WorkflowCategory[];
}>(workflows: readonly T[], category: TabType, subCategory: SubTabType): T[] {
  return workflows.filter(workflow => workflowMatchesRoute(workflow, category, subCategory));
}
