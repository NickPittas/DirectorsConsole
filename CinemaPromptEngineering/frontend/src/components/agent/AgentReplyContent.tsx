import ReactMarkdown from 'react-markdown';
import { getGalleryWorkspace } from '@/gallery/services/gallery-workspace';
import { orchestratorManager } from '@/storyboard/services/orchestrator';

const MAX_MEDIA_PER_REPLY = 20;

type MediaKind = 'image' | 'video' | 'audio';

function trustedOrigins(): Set<string> {
  const origins = new Set<string>();
  const add = (value: string) => {
    try {
      const url = new URL(value);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password) {
        origins.add(url.origin);
      }
    } catch {
      // Invalid configured origins cannot authorize media loading.
    }
  };

  orchestratorManager.getNodes().forEach(node => add(node.url));
  add(getGalleryWorkspace().orchestratorUrl);
  if (typeof window !== 'undefined') add(window.location.origin);
  return origins;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

function resolveHttpUrl(value: string): URL | null {
  const absolute = parseHttpUrl(value);
  if (absolute) return absolute;
  if (typeof window === 'undefined' || /^[a-z][a-z\d+.-]*:/i.test(value)) return null;
  try {
    const url = new URL(value, window.location.href);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

function mediaKind(url: URL): MediaKind | null {
  const paths = [url.searchParams.get('filename'), url.searchParams.get('path'), url.pathname];
  const extension = paths.map(path => path?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()).find(Boolean);
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension || '')) return 'image';
  if (['mp4', 'webm', 'mov'].includes(extension || '')) return 'video';
  if (['wav', 'mp3', 'flac', 'ogg', 'm4a'].includes(extension || '')) return 'audio';
  return null;
}

function sourceLink(url: URL) {
  return <a href={url.href} target="_blank" rel="noopener noreferrer">Open source</a>;
}

function renderMedia(url: URL, kind: MediaKind, alt: string) {
  const mediaStyle = { display: 'block', width: '100%', maxHeight: 240 } as const;
  return (
    <figure style={{ margin: 0, maxWidth: '100%' }}>
      {kind === 'image' && <img src={url.href} alt={alt} style={{ ...mediaStyle, objectFit: 'contain' }} />}
      {kind === 'video' && <video src={url.href} controls preload="metadata" style={mediaStyle} aria-label={alt || undefined} />}
      {kind === 'audio' && <audio src={url.href} controls preload="metadata" aria-label={alt || undefined} />}
      <figcaption>{sourceLink(url)}</figcaption>
    </figure>
  );
}

export function AgentReplyContent({ text }: { text: string }) {
  const origins = trustedOrigins();
  let mediaCount = 0;
  const canEmbed = (url: URL) => origins.has(url.origin) && mediaCount < MAX_MEDIA_PER_REPLY;
  const embed = (url: URL, kind: MediaKind, alt: string) => {
    mediaCount += 1;
    return renderMedia(url, kind, alt);
  };

  return (
    <div className="agent-chat__text">
      <ReactMarkdown
        skipHtml
        components={{
          p({ children }) {
            return <div>{children}</div>;
          },
          a({ href, children }) {
            const url = href ? resolveHttpUrl(href) : null;
            if (!url) return <>{children}</>;
            const trusted = canEmbed(url);
            const kind = trusted ? mediaKind(url) : null;
            if (kind) return embed(url, kind, typeof children === 'string' ? children : '');
            const external = typeof window === 'undefined' || url.origin !== window.location.origin;
            return (
              <a href={url.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {children}
              </a>
            );
          },
          img({ src, alt }) {
            const url = src ? resolveHttpUrl(src) : null;
            if (!url) return <>{alt}</>;
            if (!canEmbed(url)) {
              const external = typeof window === 'undefined' || url.origin !== window.location.origin;
              return (
                <a href={url.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                  {alt || url.href}
                </a>
              );
            }
            return embed(url, mediaKind(url) || 'image', alt || '');
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
