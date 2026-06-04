import assert from 'node:assert/strict';
import {
  DAILY_ECHO_SYSTEM_PROMPT,
  buildShortDiaryEchoFallback,
  buildDailyEchoUserPrompt,
  countDailyEchoAnchorHits,
  extractDiaryEchoAnchors,
  isVagueEchoContent,
  validateDailyEchoContent,
} from '../src/services/aiService';

const diaryText = `
感谢的人：
老妈愿意和我聊天，唠唠家常。
sana同学的夸夸，很受用。
老己，今天真有点累。

改进的事：
在和AI交流想法的时候，要说清楚背景，AI才能给出更符合情况的回答。我没有说清楚自建 agent 的成本，结果 AI 就分析偏了。
`;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('uses dedicated daily echo system prompt instead of gentle style composition', () => {
  assert.ok(DAILY_ECHO_SYSTEM_PROMPT.includes('用户日志分析助手'));
  assert.ok(DAILY_ECHO_SYSTEM_PROMPT.includes('用户可信赖的成长伙伴'));
  assert.ok(DAILY_ECHO_SYSTEM_PROMPT.includes('一面温暖而清晰的镜子'));
  assert.ok(DAILY_ECHO_SYSTEM_PROMPT.includes('洞察草稿'));
  assert.ok(DAILY_ECHO_SYSTEM_PROMPT.includes('用户可见回声'));
  assert.equal(DAILY_ECHO_SYSTEM_PROMPT.includes('现在的风格是「温柔陪伴」'), false);
});

test('user prompt keeps diary details, anchors, and 600 char hard limit', () => {
  const prompt = buildDailyEchoUserPrompt(diaryText, '2026-05-31', 1, 'not-grounded');
  assert.ok(prompt.includes('2026-05-31'));
  assert.ok(prompt.includes('硬上限是 600 字'));
  assert.ok(prompt.includes('老妈'));
  assert.ok(prompt.includes('sana'));
  assert.ok(prompt.includes('agent'));
  assert.ok(prompt.includes('日记内容：'));
  assert.ok(prompt.includes('not-grounded'));
});

test('extracts concrete anchors from diary details', () => {
  const anchors = extractDiaryEchoAnchors(diaryText);
  assert.ok(anchors.some(anchor => /老妈|sana|AI|agent/.test(anchor)), anchors.join(','));
});

test('rejects vague local-template style echo', () => {
  assert.equal(
    isVagueEchoContent('小象看到你写下了“下午掉铁+有氧”。这不是一句空泛的概括，而是今天真实发生过的一个点。'),
    true,
  );
});

test('rejects echo that does not respond to diary anchors', () => {
  const result = validateDailyEchoContent(
    '这一天下来，你有很多感受，也有一些值得被看见的努力。慢慢写下来，本身就是一种温柔的整理。',
    diaryText,
  );
  assert.equal(result.content, '');
});

test('accepts complete echo grounded in multiple diary details', () => {
  const content = '小象读到这里，感觉你今天不是单纯在复盘任务，而是在练习把事情看得更准确：老妈愿意陪你聊家常，sana同学的夸夸给了你一点被看见的亮光；同时你也发现，和AI交流想法时如果没说清自建 agent 的成本，分析就会偏掉。能把这些都写下来，说明你已经在从“被结果影响”慢慢走向“看见问题怎么发生”，这是一种很稳的成长。';
  const anchors = extractDiaryEchoAnchors(diaryText);
  assert.ok(countDailyEchoAnchorHits(content, anchors) >= 2);
  assert.equal(validateDailyEchoContent(content, diaryText).content, content);
});

test('rejects provider-truncated echo even if it has text', () => {
  const result = validateDailyEchoContent(
    '小象读到你写老妈聊天和 AI 背景没说清，能感觉你在认真复盘。',
    diaryText,
    'length',
  );
  assert.equal(result.reason, 'truncated');
});

test('accepts short diary echo with one concrete anchor', () => {
  const shortDiary = '阿萨DAS大王你到家说声';
  const content = '小象听见你写下「阿萨DAS大王你到家说声」。这句话很短，但里面有一份具体的惦记：你想确认对方平安到家。';
  const anchors = extractDiaryEchoAnchors(shortDiary);
  assert.ok(anchors.length >= 1, anchors.join(','));
  assert.equal(validateDailyEchoContent(content, shortDiary).content, content);
});

test('builds grounded fallback for very short diary instead of failed state', () => {
  const content = buildShortDiaryEchoFallback('阿萨DAS大王你到家说声');
  assert.ok(content.includes('阿萨DAS大王你到家说声'));
  assert.ok(content.includes('到家'));
  assert.ok(content.includes('惦记'));
  assert.equal(validateDailyEchoContent(content, '阿萨DAS大王你到家说声').content, content);
});
