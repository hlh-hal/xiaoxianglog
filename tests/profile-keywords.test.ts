import assert from 'node:assert/strict';
import { extractKeywords, extractRecentDiaryKeywords } from '../src/utils/textUtils';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('extracts Chinese keywords and sorts by frequency', () => {
  const keywords = extractKeywords('学习让我平静，学习让我开心。散步也让我平静。');
  assert.equal(keywords[0].text, '学习');
  assert.equal(keywords[0].value, 2);
  assert.ok(keywords.some((keyword) => keyword.text === '平静'));
});

test('normalizes English keyword casing for display', () => {
  const keywords = extractKeywords('AI ai Ai Java java react React offer loss');
  const ai = keywords.find((keyword) => keyword.text === 'AI');
  const java = keywords.find((keyword) => keyword.text === 'Java');
  const react = keywords.find((keyword) => keyword.text === 'React');

  assert.equal(ai?.value, 3);
  assert.equal(java?.value, 2);
  assert.equal(react?.value, 2);
  assert.equal(keywords.filter((keyword) => keyword.text.toLowerCase() === 'ai').length, 1);
  assert.equal(keywords.some((keyword) => keyword.text === 'offer'), false);
});

test('filters low-signal English, numbers, single-character words, and common Chinese stop words', () => {
  const texts = extractKeywords('ok why agent scanner skill sop app prompt codex hermes taste p0 p1 10kg1 2026 的 人 我 A 好 Java').map((keyword) => keyword.text);
  assert.deepEqual(texts, ['Java']);
});

test('uses only recent diary content and ignores manual tags', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [
      {
        diaryDate: '2026-06-04T08:00:00+08:00',
        content: '学习 学习 平静 AI',
        tags: ['手动标签'],
      } as any,
      {
        diaryDate: '2026-03-01T08:00:00+08:00',
        content: '过期词 过期词 过期词',
        tags: ['旧标签'],
      } as any,
    ],
    { now },
  );

  assert.ok(keywords.includes('学习'));
  assert.equal(keywords.includes('AI'), false);
  assert.equal(keywords.includes('手动标签'), false);
  assert.equal(keywords.includes('过期词'), false);
});

test('extracts recent diary keywords from block content when entry content is empty', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [
      {
        diaryDate: '2026-06-04T08:00:00+08:00',
        content: '',
        blocks: [
          { title: '开心的事', content: '今天散步，和朋友聊天，项目也有进展' },
          { title: '今日思考', content: '学习的时候感觉更平静' },
        ],
      },
    ],
    { now, limit: 12 },
  );

  assert.ok(keywords.includes('散步'));
  assert.ok(keywords.includes('朋友'));
  assert.ok(keywords.includes('项目'));
  assert.ok(keywords.includes('学习'));
});

test('accepts local diary date formats for recent profile keywords', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [
      { diaryDate: '2026年6月4日 09:30', content: '散步 朋友 项目' },
      { diaryDate: '2026/06/03', content: '学习 妈妈 开心' },
      { diaryDate: '6月2日', content: '工作 焦虑 平静' },
    ],
    { now, limit: 12 },
  );

  assert.ok(keywords.includes('散步'));
  assert.ok(keywords.includes('学习'));
  assert.ok(keywords.includes('工作'));
});

test('falls back to createdAt when diaryDate cannot be parsed', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [
      {
        diaryDate: '今天',
        createdAt: '2026-06-04T08:00:00+08:00',
        content: '项目 朋友 学习',
      },
    ],
    { now, limit: 12 },
  );

  assert.ok(keywords.includes('项目'));
  assert.ok(keywords.includes('朋友'));
  assert.ok(keywords.includes('学习'));
});

test('shows a single meaningful Chinese keyword from a very short diary', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [{ diaryDate: '2026-06-04T08:00:00+08:00', content: '累' }],
    { now, limit: 12 },
  );

  assert.deepEqual(keywords, ['累']);
});

test('returns only the few available Chinese keywords without filling English fragments', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [
      { diaryDate: '2026-06-04T08:00:00+08:00', content: '累 AI offer why' },
      { diaryDate: '2026-06-03T08:00:00+08:00', content: '忙 sana not loss' },
      { diaryDate: '2026-06-02T08:00:00+08:00', content: '困 ok scanner' },
    ],
    { now, limit: 12 },
  );

  assert.deepEqual(keywords, ['累', '忙', '困']);
});

test('uses loose Chinese fallback when primary scoring has no keyword', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [{ diaryDate: '2026-06-04T08:00:00+08:00', content: '<p>烦</p>' }],
    { now, limit: 12 },
  );

  assert.deepEqual(keywords, ['烦']);
});

test('does not fill recent diary keywords with all-English fallback', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const content = 'alpha beta gamma delta epsilon zeta theta lambda kappa sigma omega react java ai node vite prisma express sqlite tailwind capacitor';
  const keywords = extractRecentDiaryKeywords([{ diaryDate: now, content }], { now, limit: 14 });

  assert.deepEqual(keywords, []);
});

test('prioritizes themes that appear across multiple diaries over repeated single-entry fragments', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [
      { diaryDate: '2026-06-04T08:00:00+08:00', content: '散步 项目 项目 项目 项目 项目' },
      { diaryDate: '2026-06-03T08:00:00+08:00', content: '散步 朋友' },
      { diaryDate: '2026-06-02T08:00:00+08:00', content: '散步 学习' },
    ],
    { now, limit: 3 },
  );

  assert.equal(keywords[0], '散步');
});

test('uses recency and English downranking for recent profile keywords', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [
      { diaryDate: '2026-03-20T08:00:00+08:00', content: 'Java Java Java Java Java Java' },
      { diaryDate: '2026-06-04T08:00:00+08:00', content: '朋友 学习 散步' },
      { diaryDate: '2026-06-03T08:00:00+08:00', content: '朋友 焦虑' },
    ],
    { now, limit: 8 },
  );

  assert.equal(keywords[0], '朋友');
  assert.ok(keywords.indexOf('Java') > keywords.indexOf('朋友'));
});

test('keeps English as a small supplement when Chinese life themes exist', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [
      { diaryDate: '2026-06-04T08:00:00+08:00', content: 'AI AI AI Java Java Java React React React alpha beta gamma 工作 学习 妈妈 散步 焦虑 开心 项目 朋友' },
    ],
    { now, limit: 12 },
  );
  const englishCount = keywords.filter((keyword) => /^[a-zA-Z]+$/.test(keyword)).length;

  assert.ok(keywords.slice(0, 6).every((keyword) => !/^[a-zA-Z]+$/.test(keyword)));
  assert.ok(englishCount <= 2);
});

test('filters screenshot-like English fragments from recent profile keywords', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [{ diaryDate: now, content: 'AI sana offer not what loss' }],
    { now, limit: 12 },
  );

  assert.deepEqual(keywords, []);
});

test('suppresses sensitive-looking tokens even when repeated across diaries', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const oneOff = extractRecentDiaryKeywords(
    [{ diaryDate: '2026-06-04T08:00:00+08:00', content: '账号123456 项目 项目' }],
    { now },
  );
  const repeated = extractRecentDiaryKeywords(
    [
      { diaryDate: '2026-06-04T08:00:00+08:00', content: '账号123456 项目' },
      { diaryDate: '2026-06-03T08:00:00+08:00', content: '账号123456 学习' },
    ],
    { now },
  );

  assert.equal(oneOff.includes('账号123456'), false);
  assert.equal(repeated.includes('账号123456'), false);
});

test('limits recent profile keywords to the requested maximum', () => {
  const now = new Date('2026-06-04T12:00:00+08:00');
  const keywords = extractRecentDiaryKeywords(
    [{ diaryDate: now, content: '工作 学习 妈妈 散步 焦虑 开心 项目 朋友 家人 同事 睡觉 跑步 读书 写作 复盘 计划' }],
    { now, limit: 12 },
  );

  assert.equal(keywords.length, 12);
});
