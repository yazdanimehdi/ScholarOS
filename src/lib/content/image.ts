import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

/**
 * An optimized image: build-time ImageMetadata (static/git) or a URL (Postgres mode: Vercel Blob, optimized by
 * /_vercel/image). Other strings (public/ paths) are served as they are.
 */
export async function resolveImage(src: ImageMetadata | string, width: number): Promise<{ src: string }> {
  if (typeof src === 'string' && !/^https?:\/\//.test(src)) return { src };
  return getImage({ src, width, inferSize: typeof src === 'string' });
}
