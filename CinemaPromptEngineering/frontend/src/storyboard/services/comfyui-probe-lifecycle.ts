import { normalizeComfyUIUrl, probeComfyUI, type ComfyUIProbeResult } from '../comfyui-client';

export function getManagedComfyUIProbeUrls(nodes: Array<{ url: string }>): string[] {
  return [...new Set(nodes.map(node => normalizeComfyUIUrl(node.url)).filter(Boolean))];
}

export interface ProbeLifecycleOptions {
  urls: string[];
  intervalMs?: number;
  probe?: (url: string, signal: AbortSignal) => Promise<ComfyUIProbeResult>;
  setStatuses: (statuses: Record<string, 'connecting' | 'connected' | 'disconnected'>) => void;
  onResult: (url: string, result: ComfyUIProbeResult) => void;
  setIntervalFn?: typeof window.setInterval;
  clearIntervalFn?: typeof window.clearInterval;
}

/** Own the browser probe poll's abort, cleanup, and stale-completion rules. */
export function startComfyUIProbeLifecycle(options: ProbeLifecycleOptions): () => void {
  const urls = [...new Set(options.urls.filter(Boolean))];
  const statuses = Object.fromEntries(urls.map(url => [url, 'connecting' as const]));
  options.setStatuses(statuses);
  const probe = options.probe || ((url, signal) => probeComfyUI(url, signal, 5000));
  const setIntervalFn = options.setIntervalFn || window.setInterval.bind(window);
  const clearIntervalFn = options.clearIntervalFn || window.clearInterval.bind(window);
  const controllers = new Set<AbortController>();
  const inFlight = new Set<string>();
  let active = true;
  let timer: number | null = null;

  const run = async () => {
    await Promise.all(urls.map(async url => {
      if (inFlight.has(url)) return;
      inFlight.add(url);
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const result = await probe(url, controller.signal);
        if (active) options.onResult(url, result);
      } finally {
        controllers.delete(controller);
        inFlight.delete(url);
      }
    }));
  };

  void run();
  timer = setIntervalFn(() => { void run(); }, options.intervalMs ?? 5000);
  return () => {
    active = false;
    if (timer !== null) clearIntervalFn(timer);
    controllers.forEach(controller => controller.abort());
    controllers.clear();
  };
}
