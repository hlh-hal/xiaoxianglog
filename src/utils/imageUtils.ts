import { normalizeImageDataUrl } from './media';

export function extractImages(content: string): string[] {
  if (!content) return [];
  
  // Extract Markdown image links: ![alt](url)
  const mdImages = [...content.matchAll(/!\[.*?\]\((.*?)\)/g)].map(m => normalizeImageDataUrl(m[1]));
  
  // Extract HTML img tags: <img src="url" ... />
  const htmlImages = [...content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => normalizeImageDataUrl(m[1]));
  
  return [...mdImages, ...htmlImages].filter(Boolean);
}
