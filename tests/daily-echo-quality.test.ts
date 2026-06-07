import assert from 'node:assert/strict';
import {
  DAILY_ECHO_SYSTEM_PROMPT,
  buildDailyEchoUserPrompt,
  countDailyEchoAnchorHits,
  extractDiaryEchoAnchors,
  isVagueEchoContent,
  validateDailyEchoContent,
} from '../src/services/aiService';
import { parseDailyEchoContent } from '../src/utils/dailyEchoQuote';

const screenshotDiaryText = `开心的事：
无

充实的事：
1，继续迭代小象回声提示词，方向是从对事件的表面回应转向对用户的洞察，未来的方向可能是结合一周的日志来分析，但好像有点太散了，聚焦一到两点深入谈谈会不会更好，一是担心冗余，二是长了也不乐意看
2，高频关键词进行优化，从纯词频到提炼意义显示，减少无意义的词出现

感谢的人：
我中午想午睡，室友调低声音，感谢

改进的事：
黑眼圈出来了，看来不能熬夜写日志了，提前写完日志

今日思考：
“如果我是老师，我不希望我成为我的学生”
这句话或许也是我高中的写照。`;

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
  assert.ok(DAILY_ECHO_SYSTEM_PROMPT.includes('最终只输出“今日回声”和“用户可见回声”'));
  assert.ok(DAILY_ECHO_SYSTEM_PROMPT.includes('分享金句'));
  assert.ok(DAILY_ECHO_SYSTEM_PROMPT.includes('不要输出给用户'));
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
  assert.ok(prompt.includes('今日回声：'));
  assert.ok(prompt.includes('用户可见回声：'));
  assert.ok(prompt.includes('12-24 字'));
  assert.ok(prompt.includes('不要输出洞察草稿'));
});

test('extracts concrete anchors from diary details', () => {
  const anchors = extractDiaryEchoAnchors(diaryText);
  assert.ok(anchors.some(anchor => /老妈|sana|AI|agent/.test(anchor)), anchors.join(','));
});

test('extracts short phrase anchors from screenshot diary without cross-section glue', () => {
  const anchors = extractDiaryEchoAnchors(screenshotDiaryText);
  assert.ok(anchors.some(anchor => /小象回声/.test(anchor)), anchors.join(','));
  assert.ok(anchors.some(anchor => /用户.?洞察|表面回应/.test(anchor)), anchors.join(','));
  assert.ok(anchors.includes('室友调低声音'), anchors.join(','));
  assert.ok(anchors.includes('黑眼圈'), anchors.join(','));
  assert.equal(anchors.some(anchor => anchor.includes('减少无意义的词出现 我中午想午睡')), false);
  assert.equal(anchors.some(anchor => anchor.includes('长了也不乐意看 2')), false);
});

test('accepts natural rewritten echo for screenshot diary details', () => {
  const content = '今天你继续迭代小象回声提示词，把它从事件表面回应往用户洞察推进，也在思考一周日志分析是否太散、太长。你还注意到关键词优化要从纯词频走向意义提炼，午睡时室友调低声音让你感到被照顾，而黑眼圈也提醒你要提前写完日志。';
  const anchors = extractDiaryEchoAnchors(screenshotDiaryText);
  assert.ok(countDailyEchoAnchorHits(content, anchors) >= 2, anchors.join(','));
  assert.equal(parseDailyEchoContent(validateDailyEchoContent(content, screenshotDiaryText).content).body, content);
});

test('parses today quote and visible echo without leaking quote into body', () => {
  const output = `今日回声：你在校准产品，也在校准自己的节奏

用户可见回声：今天你继续迭代小象回声提示词，把它从事件表面回应往用户洞察推进，也在思考一周日志分析是否太散、太长。你还注意到关键词优化要从纯词频走向意义提炼，午睡时室友调低声音让你感到被照顾，而黑眼圈也提醒你要提前写完日志。`;
  const result = validateDailyEchoContent(output, screenshotDiaryText);
  const parsed = parseDailyEchoContent(result.content);
  assert.equal(parsed.quote, '你在校准产品，也在校准自己的节奏');
  assert.equal(parsed.body.includes('今日回声'), false);
  assert.ok(parsed.body.includes('小象回声提示词'));
});

test('derives a fallback quote for legacy echo content', () => {
  const legacyContent = '今天你继续迭代小象回声提示词，把它从事件表面回应往用户洞察推进，这个方向很清楚。你也看见自己想结合一周日志分析，却担心太散、太长。';
  const parsed = parseDailyEchoContent(legacyContent);
  assert.ok(parsed.quote.length >= 8);
  assert.equal(parsed.hasExplicitQuote, false);
  assert.equal(parsed.body, legacyContent);
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
  assert.equal(parseDailyEchoContent(validateDailyEchoContent(content, diaryText).content).body, content);
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
  assert.equal(parseDailyEchoContent(validateDailyEchoContent(content, shortDiary).content).body, content);
});

test('accepts short diary echo grounded in natural short fragments', () => {
  const shortDiary = '阿萨DAS大王你到家说声';
  const content = '这句话很短，但小象读到的是一份具体的牵挂：你想让对方到家后说声，好确认那个人平安。';
  const anchors = extractDiaryEchoAnchors(shortDiary);
  assert.ok(anchors.includes('到家') || anchors.includes('说声'), anchors.join(','));
  assert.equal(parseDailyEchoContent(validateDailyEchoContent(content, shortDiary).content).body, content);
});

test('still rejects short diary echo without a concrete diary detail', () => {
  const result = validateDailyEchoContent(
    '这句话很短，但也说明你今天有一些感受值得被看见。',
    '阿萨DAS大王你到家说声',
  );
  assert.equal(result.content, '');
});

test('extracts visible echo when model returns internal draft plus final echo', () => {
  const modelOutput = `洞察草稿：
今日主线：产品探索与生活能量并行
核心矛盾：如何把想法落到用户真正能感知的位置
人格特质：主动、复盘意识强
成长方向：把洞察转成更清晰的产品动作

用户可见回声：
今天的你一边在蒸馏毛老师 skill、研究大模型原理和 hermes 生成小红书文章 skill，一边也用王者三连赢、校园跑和足球把身体里的活力找回来。小象特别看到你对小象回声卡片位置的反思，以及 sana 提到浮窗后的启发：你不是只想做功能，而是在追问用户怎样才真的能看见价值。`;
  const result = validateDailyEchoContent(modelOutput, `开心的事：蒸馏了毛老师skill，王者三连赢，校园跑和足球。
充实的事：学习大模型原理，用hermes生成小红书文章skill，思考小象回声卡片位置，sana提出浮窗。`);
  assert.ok(result.content.includes('蒸馏毛老师 skill'));
  assert.ok(result.content.includes('sana'));
  assert.equal(result.content.includes('洞察草稿'), false);
});
