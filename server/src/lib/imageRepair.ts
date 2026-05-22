import fs from 'node:fs/promises';
import path from 'node:path';

const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
const imageUploadDir = path.join(uploadRoot, 'images');
const compareLength = 4096;

type ImageCandidate = {
  fileName: string;
  prefix: string;
};

let candidateCache: Promise<ImageCandidate[]> | null = null;

function mimeFromFileName(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return null;
}

function normalizeDataImage(value: string): string {
  return value
    .trim()
    .replace(/^data:(image\/[^;,]+);base,/i, 'data:$1;base64,')
    .replace(/^data:(image\/[^;,]+);base64;/i, 'data:$1;base64,')
    .replace(/\s/g, '');
}

async function buildCandidates(): Promise<ImageCandidate[]> {
  try {
    const files = await fs.readdir(imageUploadDir);
    const candidates = await Promise.all(files.map(async (fileName) => {
      const mime = mimeFromFileName(fileName);
      if (!mime) return null;

      const fullPath = path.join(imageUploadDir, fileName);
      const content = await fs.readFile(fullPath);
      return {
        fileName,
        prefix: `data:${mime};base64,${content.toString('base64').slice(0, compareLength)}`,
      };
    }));

    return candidates.filter((candidate): candidate is ImageCandidate => Boolean(candidate));
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn('Build legacy image repair index failed:', error);
    }
    return [];
  }
}

async function getCandidates(): Promise<ImageCandidate[]> {
  if (!candidateCache) {
    candidateCache = buildCandidates();
  }
  return candidateCache;
}

export async function repairLegacyImageUrl(url: string): Promise<string> {
  const normalized = normalizeDataImage(url);
  if (!normalized.startsWith('data:image/')) return url;

  const candidates = await getCandidates();
  const probe = normalized.slice(0, Math.min(normalized.length, compareLength));
  const match = candidates.find(candidate => candidate.prefix.startsWith(probe));
  return match ? `/api/uploads/images/${match.fileName}` : url;
}

export async function repairLegacyImageUrls(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(repairLegacyImageUrl));
}
