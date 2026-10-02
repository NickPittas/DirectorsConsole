import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  EnhancementImage,
  EnhancementImageMode,
  ImageCapabilities,
  ImageTargetCapability,
} from '../api/client';

interface EnhancementImageInputsProps {
  images: EnhancementImage[];
  onImagesChange: (images: EnhancementImage[]) => void;
  mode: EnhancementImageMode;
  onModeChange: (mode: EnhancementImageMode) => void;
  dialect: string;
  children: ReactNode;
  capability?: ImageTargetCapability;
  limits?: ImageCapabilities['limits'];
  disabled?: boolean;
}

const defaults = { max_images: 30, max_image_bytes: 4 * 1024 * 1024, max_total_image_bytes: 12 * 1024 * 1024, max_source_bytes: 20 * 1024 * 1024, max_edge: 2048 };
type ImageMime = EnhancementImage['mimeType'];

function base64Bytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.floor(data.length * 3 / 4) - padding;
}

function inspectImage(bytes: Uint8Array): { mime: ImageMime; animated: boolean } | null {
  if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    let animated = false;
    for (let i = 8; i + 8 <= bytes.length;) {
      const size = new DataView(bytes.buffer, bytes.byteOffset + i, 4).getUint32(0);
      if (i + size + 12 > bytes.length) break;
      if (String.fromCharCode(...bytes.subarray(i + 4, i + 8)) === 'acTL') animated = true;
      i += size + 12;
    }
    return { mime: 'image/png', animated };
  }
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) return { mime: 'image/jpeg', animated: false };
  if (bytes.length >= 16 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    let animated = false;
    for (let i = 12; i + 8 <= bytes.length;) {
      const chunk = String.fromCharCode(...bytes.subarray(i, i + 4));
      if (chunk === 'ANIM' || chunk === 'ANMF') animated = true;
      const size = new DataView(bytes.buffer, bytes.byteOffset + i + 4, 4).getUint32(0, true);
      i += 8 + size + (size & 1);
    }
    return { mime: 'image/webp', animated };
  }
  return null;
}

function readAsBytes(file: File, readers: Set<FileReader>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    readers.add(reader);
    reader.onload = () => {
      readers.delete(reader);
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => {
      readers.delete(reader);
      reject(new Error('Could not read the image. Try another file.'));
    };
    reader.onabort = () => {
      readers.delete(reader);
      reject(new Error('Image processing was cancelled.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

function readAsBase64(blob: Blob, readers: Set<FileReader>): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    readers.add(reader);
    reader.onload = () => {
      readers.delete(reader);
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      if (comma < 0) reject(new Error('Could not read the resized image. Try another file.'));
      else resolve(result.slice(comma + 1));
    };
    reader.onerror = () => {
      readers.delete(reader);
      reject(new Error('Could not read the image. Try another file.'));
    };
    reader.onabort = () => {
      readers.delete(reader);
      reject(new Error('Image processing was cancelled.'));
    };
    reader.readAsDataURL(blob);
  });
}

export function EnhancementImageInputs({
  images, onImagesChange, mode, onModeChange, dialect, children,
  capability, limits, disabled = false,
}: EnhancementImageInputsProps) {
  const caps = { ...defaults, ...limits };
  const selectedDialect = capability?.dialects.find(item => item.id === dialect)
    || capability?.dialects.find(item => item.id === capability.default_dialect);
  const generation = useRef(0);
  const readers = useRef(new Set<FileReader>());
  const nextId = useRef(1);
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  images.forEach(image => { nextId.current = Math.max(nextId.current, image.id + 1); });

  const cancelPending = useCallback(() => {
    generation.current += 1;
    readers.current.forEach(reader => reader.abort());
    readers.current.clear();
  }, []);

  useEffect(() => () => cancelPending(), [cancelPending, capability?.target_model, mode, dialect]);

  const countLimit = (nextMode: EnhancementImageMode, nextDialect = selectedDialect) => {
    if (nextMode === 'description_only') return 1;
    if (!nextDialect) return caps.max_images;
    if (nextMode === 'starting_frame') return nextDialect.supports_starting_frame ? 1 : 0;
    if (!nextDialect.supports_reference) return 0;
    return Math.min(caps.max_images, nextDialect.reference_limit ?? caps.max_images);
  };

  const compatibilityError = (candidate: EnhancementImage[], candidateMode = mode, candidateDialect = selectedDialect) => {
    const maxCount = countLimit(candidateMode, candidateDialect);
    if (candidate.length > maxCount) return `This mode supports at most ${maxCount} image${maxCount === 1 ? '' : 's'} for the selected target. Remove images before changing image use or model variant.`;
    if (candidate.some(image => base64Bytes(image.data) > caps.max_image_bytes)) return 'An existing image exceeds the current per-image limit. Remove it or choose a target with a higher limit.';
    if (candidate.reduce((total, image) => total + base64Bytes(image.data), 0) > caps.max_total_image_bytes) return 'Existing images exceed the current total image limit. Remove images or choose a target with a higher limit.';
    return '';
  };

  const existingCompatibilityError = compatibilityError(images);

  const changeMode = (value: EnhancementImageMode) => {
    cancelPending();
    const issue = compatibilityError(images, value);
    if (issue) { setError(issue); return; }
    setError('');
    onModeChange(value);
  };

  const addFiles = async (files: FileList | File[]) => {
    if (disabled || !files.length) return;
    cancelPending();
    const task = generation.current;
    const additions = Array.from(files);
    const countMax = countLimit(mode);
    if (images.length + additions.length > countMax) {
      setError(`You can add ${Math.max(0, countMax - images.length)} more image${countMax - images.length === 1 ? '' : 's'} for this mode and target.`);
      return;
    }
    const ids = additions.map(() => nextId.current++);
    const pending: EnhancementImage[] = [];
    let totalBytes = images.reduce((sum, image) => sum + base64Bytes(image.data), 0);
    try {
      for (const [index, file] of additions.entries()) {
        if (file.size > caps.max_source_bytes) throw new Error(`${file.name || 'A selected file'} exceeds the ${Math.round(caps.max_source_bytes / 1024 / 1024)} MiB source-file limit.`);
        const source = await readAsBytes(file, readers.current);
        if (task !== generation.current) return;
        const inspected = inspectImage(source);
        if (!inspected || (file.type && inspected.mime !== file.type)) throw new Error(`${file.name || 'A selected file'} is not a valid PNG, JPEG, or WebP image.`);
        if (inspected.animated) throw new Error(`${file.name || 'This image'} is animated; choose a still PNG, JPEG, or WebP file.`);

        const bitmap = await createImageBitmap(file);
        if (task !== generation.current) { bitmap.close(); return; }
        const scale = Math.min(1, caps.max_edge / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) { bitmap.close(); throw new Error('Your browser could not resize this image. Try another browser or file.'); }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise<Blob>((resolve, reject) => { canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not encode the resized image. Try another file.')), inspected.mime); });
        if (task !== generation.current) return;
        if (blob.type !== inspected.mime) throw new Error(`${file.name || 'This image'} could not be encoded as ${inspected.mime}. Try another browser or file.`);
        if (blob.size > caps.max_image_bytes) throw new Error(`${file.name || 'A resized image'} exceeds the ${Math.round(caps.max_image_bytes / 1024 / 1024)} MiB image limit after resizing.`);
        totalBytes += blob.size;
        if (totalBytes > caps.max_total_image_bytes) throw new Error(`The selected images exceed the ${Math.round(caps.max_total_image_bytes / 1024 / 1024)} MiB combined limit.`);
        const data = await readAsBase64(blob, readers.current);
        if (task !== generation.current) return;
        pending.push({ id: ids[index], mimeType: inspected.mime, data });
      }
      if (task === generation.current) {
        onImagesChange([...images, ...pending]);
        setError('');
      }
    } catch (reason) {
      if (task === generation.current) setError(reason instanceof Error ? reason.message : 'Image processing failed. Try another file.');
    }
  };

  const removeImage = (id: number) => {
    cancelPending();
    setError('');
    onImagesChange(images.filter(image => image.id !== id));
  };

  const modeSupported = (value: EnhancementImageMode) => value === 'description_only' || countLimit(value) > 0;
  const maxForMode = countLimit(mode);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (Array.from(event.dataTransfer.types).includes('Files')) {
      event.preventDefault();
      setIsDragOver(true);
    }
  };
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    setIsDragOver(false);
    void addFiles(event.dataTransfer.files);
  };

  return (
    <div className={`cpe-prompt-composer${isDragOver ? ' is-drag-over' : ''}`}
      onDragEnter={handleDragOver} onDragOver={handleDragOver}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragOver(false); }}
      onDrop={handleDrop}>
      {children}
      {images.length > 0 && <div className="cpe-image-thumbnails" aria-label="Attached images">
        {images.map(image => <div className="cpe-image-chip" key={image.id}>
          <img src={`data:${image.mimeType};base64,${image.data}`} alt={`Image @img${image.id}`} />
          <span>@img{image.id}</span>
          <button type="button" className="cpe-image-remove" disabled={disabled} onClick={() => removeImage(image.id)} aria-label={`Remove image @img${image.id}`} title="Remove image">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
          </button>
        </div>)}
      </div>}
      <div className="cpe-image-footer">
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden
          disabled={disabled || maxForMode === 0 || images.length >= maxForMode}
          onChange={event => { void addFiles(event.currentTarget.files || []); event.currentTarget.value = ''; }} />
        <button type="button" className="toolbar-settings" aria-label="Add images" title="Add images" disabled={disabled || maxForMode === 0 || images.length >= maxForMode} onClick={() => fileInput.current?.click()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14m-7-7h14" /></svg>
        </button>
        {images.length === 0 && maxForMode > 0 && <span className="cpe-image-hint">Drop images here</span>}
        <select className="toolbar-model" aria-label="Image use" value={mode} disabled={disabled} onChange={event => changeMode(event.target.value as EnhancementImageMode)}>
          <option value="description_only">Describe image</option>
          <option value="reference" disabled={!modeSupported('reference')}>Use as reference</option>
          <option value="starting_frame" disabled={!modeSupported('starting_frame')}>Use as starting image</option>
        </select>
      </div>
      {mode === 'reference' && selectedDialect?.requires_composite_sheet && <div className="cpe-image-hint">Use one prepared reference sheet</div>}
      {(existingCompatibilityError || error) && <div className="cpe-image-alert" role="alert">{existingCompatibilityError || error}</div>}
    </div>
  );
}
