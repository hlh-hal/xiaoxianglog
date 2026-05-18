/**
 * 文件上传路由
 */
import { Router, Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { isOssEnabled, storeLocalUpload, uploadFontToOss, uploadImageToOss } from '../lib/objectStorage.js';

const router = Router();
let ossUploadsUnavailable = false;

function summarizeStorageError(error: any): string {
  const code = error?.code || error?.name || 'UnknownError';
  const status = error?.status ? ` status=${error.status}` : '';
  const message = error?.message ? ` ${error.message}` : '';
  return `${code}${status}${message}`.trim();
}

async function storeImage(file: Express.Multer.File): Promise<string> {
  const payload = {
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
  };

  if (isOssEnabled() && !ossUploadsUnavailable) {
    try {
      const result = await uploadImageToOss(payload);
      return result.url;
    } catch (error) {
      const summary = summarizeStorageError(error);
      console.warn(`Upload image to OSS failed, falling back to local storage: ${summary}`);
      if ((error as any)?.code === 'NoSuchBucket') {
        ossUploadsUnavailable = true;
      }
    }
  }

  const result = await storeLocalUpload('images', payload);
  return result.url;
}

async function storeFont(file: Express.Multer.File): Promise<string> {
  const payload = {
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
  };

  if (isOssEnabled() && !ossUploadsUnavailable) {
    try {
      const result = await uploadFontToOss(payload);
      return result.url;
    } catch (error) {
      const summary = summarizeStorageError(error);
      console.warn(`Upload font to OSS failed, falling back to local storage: ${summary}`);
      if ((error as any)?.code === 'NoSuchBucket') {
        ossUploadsUnavailable = true;
      }
    }
  }

  const result = await storeLocalUpload('fonts', payload);
  return result.url;
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|heic)$/i;
    if (allowed.test(file.originalname) || /^image\/(jpeg|jpg|png|gif|webp|heic)$/i.test(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('不支持的图片格式'));
  },
});

const fontUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(ttf|otf|woff|woff2)$/i;
    if (allowed.test(file.originalname) || /^(font\/(ttf|otf|woff|woff2)|application\/(x-font-ttf|font-ttf|vnd\.ms-opentype))$/i.test(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('不支持的字体格式'));
  },
});

function handleUploadError(err: any, res: Response): boolean {
  if (!err) return false;

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: '文件太大，请换一张小一点的图片' });
      return true;
    }
    res.status(400).json({ error: err.message || '上传参数不正确' });
    return true;
  }

  res.status(400).json({ error: err.message || '上传文件不支持' });
  return true;
}

const uploadImagesMiddleware: RequestHandler = (req, res, next) => {
  imageUpload.array('images', 9)(req, res, (err: any) => {
    if (handleUploadError(err, res)) return;
    next();
  });
};

const uploadFontMiddleware: RequestHandler = (req, res, next) => {
  fontUpload.single('font')(req, res, (err: any) => {
    if (handleUploadError(err, res)) return;
    next();
  });
};

router.post('/images', requireAuth, uploadImagesMiddleware, async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: '未选择文件' });
      return;
    }

    const urls = await Promise.all(files.map(storeImage));

    res.json({ urls });
  } catch (err: any) {
    console.error('上传图片失败:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

router.post('/fonts', requireAuth, uploadFontMiddleware, async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: '未选择文件' });
      return;
    }

    const url = await storeFont(file);

    res.json({
      url,
      fileName: file.originalname,
      fileSize: file.size,
    });
  } catch (err: any) {
    console.error('上传字体失败:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

export default router;
