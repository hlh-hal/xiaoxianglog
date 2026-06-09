import assert from 'node:assert/strict';
import { resolveAssetUrl } from '../src/services/apiClient';
import { resolveMediaUrl } from '../src/utils/media';

const nativeApiBase = 'https://www.xiaoxianglog.cn/api';

assert.equal(
  resolveAssetUrl('/api/uploads/images/photo.jpg', nativeApiBase),
  'https://www.xiaoxianglog.cn/api/uploads/images/photo.jpg',
);

assert.equal(
  resolveAssetUrl('/uploads/images/photo.jpg', nativeApiBase),
  'https://www.xiaoxianglog.cn/uploads/images/photo.jpg',
);

assert.equal(
  resolveMediaUrl('/api/uploads/images/photo.jpg'),
  '/api/uploads/images/photo.jpg',
);

assert.equal(
  resolveMediaUrl('uploads/images/photo.jpg'),
  '/api/uploads/images/photo.jpg',
);

assert.equal(
  resolveMediaUrl('https://cdn.example.com/photo.jpg'),
  'https://cdn.example.com/photo.jpg',
);

assert.equal(
  resolveMediaUrl('data:image/png;base64,AAAA'),
  'data:image/png;base64,AAAA',
);

console.log('media-url tests passed');
