/**
 * 文件上传路由
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// 确保上传目录存在
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const imagesDir = path.join(uploadDir, 'images');
const fontsDir = path.join(uploadDir, 'fonts');

[imagesDir, fontsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 图片上传配置
const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, imagesDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|heic)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('不支持的图片格式'));
    }
  },
});

// 字体上传配置
const fontStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, fontsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.ttf';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fontUpload = multer({
  storage: fontStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(ttf|otf|woff|woff2)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('不支持的字体格式'));
    }
  },
});

// 上传图片（支持多张）
router.post('/images', requireAuth, imageUpload.array('images', 9), (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: '未选择文件' });
      return;
    }

    const urls = files.map(f => `/api/uploads/images/${f.filename}`);
    res.json({ urls });
  } catch (err: any) {
    res.status(500).json({ error: '上传失败' });
  }
});

// 上传字体
router.post('/fonts', requireAuth, fontUpload.single('font'), (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: '未选择文件' });
      return;
    }

    res.json({
      url: `/api/uploads/fonts/${file.filename}`,
      fileName: file.originalname,
      fileSize: file.size,
    });
  } catch (err: any) {
    res.status(500).json({ error: '上传失败' });
  }
});

export default router;
