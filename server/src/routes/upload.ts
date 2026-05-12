/**
 * 文件上传路由
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { isOssEnabled, storeLocalUpload, uploadFontToOss, uploadImageToOss } from '../lib/objectStorage.js';

const router = Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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

router.post('/images', requireAuth, imageUpload.array('images', 9), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: '未选择文件' });
      return;
    }

    const urls = await Promise.all(files.map(async (file) => {
      const payload = {
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
      };
      if (isOssEnabled()) {
        const result = await uploadImageToOss(payload);
        return result.url;
      }
      const result = await storeLocalUpload('images', payload);
      return result.url;
    }));

    res.json({ urls });
  } catch (err: any) {
    console.error('上传图片失败:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

router.post('/fonts', requireAuth, fontUpload.single('font'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: '未选择文件' });
      return;
    }

    const payload = {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    };
    const result = isOssEnabled()
      ? await uploadFontToOss(payload)
      : await storeLocalUpload('fonts', payload);

    res.json({
      url: result.url,
      fileName: file.originalname,
      fileSize: file.size,
    });
  } catch (err: any) {
    console.error('上传字体失败:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

export default router;
