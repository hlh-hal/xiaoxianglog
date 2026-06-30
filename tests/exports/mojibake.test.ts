import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const editorSource = fs.readFileSync(path.join(repoRoot, 'src', 'pages', 'Editor.tsx'), 'utf8');

const requiredVisibleText = [
  '正在生成图片',
  '分享至',
  '微信好友',
  '日志圈',
  '保存到本地',
  '功能还在开发中，敬请期待',
  '图片已保存到系统相册',
  '保存失败，请重试',
  '图片已下载',
  '导出图片失败，请重试',
];

const forbiddenExportMojibake = [
  '姝ｅ湪鐢熸垚',
  '鍒嗕韩鑷',
  '寰俊濂藉弸',
  '鍔熻兘杩樺湪',
  'Saved to folder',
  'Image downloaded',
  'Export failed:',
  'Export image failed',
];

for (const text of requiredVisibleText) {
  assert.ok(
    editorSource.includes(text),
    `Editor export/share UI should contain normal Chinese text: ${text}`,
  );
}

for (const text of forbiddenExportMojibake) {
  assert.ok(
    !editorSource.includes(text),
    `Editor export/share UI should not contain mojibake or English fallback text: ${text}`,
  );
}

console.log('export mojibake guard passed');
