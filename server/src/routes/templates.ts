/**
 * 日记模板路由
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { paramString } from '../utils/request.js';

const router = Router();
router.use(requireAuth);

// 获取模板列表（系统 + 用户自定义）
router.get('/', async (req: Request, res: Response) => {
  try {
    const templates = await prisma.diaryTemplate.findMany({
      where: {
        OR: [
          { isSystem: true },
          { userId: req.user!.userId },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ error: '获取模板失败' });
  }
});

// 创建/更新模板
router.post('/', async (req: Request, res: Response) => {
  try {
    const { id, title, content } = req.body;
    if (!title || !content) {
      res.status(400).json({ error: '标题和内容不能为空' });
      return;
    }

    if (id) {
      // 更新
      const result = await prisma.diaryTemplate.updateMany({
        where: { id, userId: req.user!.userId },
        data: { title, content },
      });
      if (result.count === 0) {
        res.status(404).json({ error: '模板不存在' });
        return;
      }
      const updated = await prisma.diaryTemplate.findFirst({ where: { id: String(id), userId: req.user!.userId } });
      res.json(updated);
    } else {
      // 创建
      const template = await prisma.diaryTemplate.create({
        data: { userId: req.user!.userId, title, content },
      });
      res.status(201).json(template);
    }
  } catch (err: any) {
    res.status(500).json({ error: '保存模板失败' });
  }
});

// 删除模板
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await prisma.diaryTemplate.deleteMany({
      where: { id: paramString(req, 'id'), userId: req.user!.userId, isSystem: false },
    });
    if (result.count === 0) {
      res.status(404).json({ error: '模板不存在或无法删除系统模板' });
      return;
    }
    res.json({ message: '已删除' });
  } catch (err: any) {
    res.status(500).json({ error: '删除失败' });
  }
});

export default router;
