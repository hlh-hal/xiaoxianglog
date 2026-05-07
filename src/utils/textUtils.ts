/**
 * Strips both HTML tags and Markdown syntax from a string to return plain text.
 * 
 * Order:
 * 1. Strip HTML tags using DOMParser (or regex as fallback)
 * 2. Strip Markdown syntax
 */
export function stripMarkdown(content: string, preserveNewlines = false): string {
  if (!content) return '';

  let text = content;

  // Remove formatting newlines between HTML tags to prevent extra blank lines
  text = text.replace(/>\s*[\n\r]+\s*</g, '><');

  // Convert <ol> structure to include numbers before stripping tags
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, inner) => {
    let liCount = 1;
    return inner.replace(/<li[^>]*>/gi, () => `<li>${liCount++}. `);
  });

  // Step 1: If it contains HTML tags, extract plain text using DOMParser
  if (/<[a-z][\s\S]*>/i.test(text)) {
    try {
      if (preserveNewlines) {
        text = text.replace(/<\/p>\s*<\/li>/gi, '</li>');
        text = text.replace(/<\/div>\s*<\/li>/gi, '</li>');
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<\/p>/gi, '\n');
        text = text.replace(/<\/div>/gi, '\n');
        text = text.replace(/<\/h[1-6]>/gi, '\n');
        text = text.replace(/<\/li>/gi, '\n');
      }
      const doc = new DOMParser().parseFromString(text, 'text/html');
      text = doc.body.textContent || '';
    } catch {
      if (preserveNewlines) {
        text = text.replace(/<\/p>\s*<\/li>/gi, '</li>');
        text = text.replace(/<\/div>\s*<\/li>/gi, '</li>');
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<\/p>/gi, '\n');
        text = text.replace(/<\/div>/gi, '\n');
        text = text.replace(/<\/h[1-6]>/gi, '\n');
        text = text.replace(/<\/li>/gi, '\n');
      }
      // Fallback: remove all HTML tags using regex
      text = text.replace(/<[^>]+>/g, ' ');
    }
  }

  // Step 2: Remove Markdown headers (## Title -> Title)
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Step 3: Remove bold and italic (**text** / *text* -> text)
  text = text.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');

  // Step 4: Remove list markers (line start - / * / number. )
  if (!preserveNewlines) {
    text = text.replace(/^[\s]*[-*]\s+/gm, '');
    text = text.replace(/^\d+\.\s+/gm, '');
  }

  // Step 5: Remove blockquote markers (> )
  if (!preserveNewlines) {
    text = text.replace(/^>\s?/gm, '');
  }

  // Step 6: Remove images (![alt](url) -> empty)
  text = text.replace(/!\[.*?\]\(.*?\)/g, '');

  // Step 7: Remove links ([text](url) -> text)
  text = text.replace(/\[([^\]]+)\]\(.*?\)/g, '$1');

  // Step 8: Remove inline code (`code` -> code)
  text = text.replace(/`([^`]+)`/g, '$1');

  // Step 9: Remove code blocks (```...``` -> empty)
  text = text.replace(/```[\s\S]*?```/g, '');

  // Step 10: Merge spaces and newlines
  if (preserveNewlines) {
    text = text.replace(/[ \t]{2,}/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
  } else {
    text = text.replace(/\n{2,}/g, ' ');
    text = text.replace(/\n/g, ' ');
    text = text.replace(/\s{2,}/g, ' ');
  }

  return text.trim();
}

/**
 * Gets a plain text excerpt from content with a specific length.
 */
export function getExcerpt(content: string, maxLength = 80, preserveNewlines = false): string {
  const plain = stripMarkdown(content, preserveNewlines);
  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength) + '...';
}

/**
 * Truncates text to a specific length and adds ellipsis if needed.
 * @deprecated Use getExcerpt for markdown/html content
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

const TEMPLATE_WORDS = [
  "开心的事", "充实的事", "感谢的人", "改进的事", "今日思考",
  "开心", "充实", "感谢", "改进", "思考"
];

const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这", "那", "今天", "明天", "昨天", "现在", "我们", "什么", "可以", "这个", "那个", "觉得", "还是", "但是", "因为", "所以", "如果", "虽然", "不过", "然后", "怎么", "这么", "那么", "把", "被", "让", "给", "跟", "与", "或", "等", "啊", "哦", "嗯", "呢", "吧", "吗", "呀", "啦", "哇", "哎", "唉", "其实", "只是", "为了", "一些", "一样", "一直", "一下", "一起", "一点", "这种", "那种", "很多", "时候", "出来", "起来", "知道", "可能", "开始", "已经", "发现", "发生", "感觉", "需要", "应该", "希望", "喜欢", "非常", "比较", "特别", "真的", "太", "更", "最", "又", "再", "还", "也", "只", "才", "就", "却", "并", "而", "及", "或者", "并且", "而且", "不仅", "不但", "尽管", "即使", "哪怕", "由于", "因此", "假如", "只要", "只有", "无论", "不论", "以便", "以免", "关于", "对于", "至于", "除了", "此外", "另外", "之", "其", "以", "于", "向", "从", "自", "由", "因", "为", "叫", "使", "将", "比", "同", "得", "地", "所", "者", "们", "每", "各", "某", "本", "该", "此", "哪", "怎样", "多少", "几", "谁", "他", "她", "它", "你们", "他们", "她们", "它们", "大家", "别人", "人家", "大伙儿", "彼此", "互相", "各自", "有些", "有的", "一切", "全部", "所有", "任何", "每个", "各个", "今年", "明年", "去年", "过去", "未来", "以前", "以后", "后来", "最后", "最终", "起初", "首先", "其次", "再次", "接着", "随后", "于是", "终于", "实际上", "事实上", "结果", "总之", "例如", "比如", "可见", "显然", "自然", "固然", "诚然", "要是", "除非", "不管", "任凭", "因而", "以致", "致使", "从而", "免得", "省得", "甚至", "乃至", "以至", "不光", "不只", "更加", "越发", "反而", "反倒", "然而", "可是", "就是", "偏偏", "难道", "岂", "究竟", "到底", "索性", "干脆", "简直", "几乎", "似乎", "仿佛", "好像", "犹如", "如同", "恰似", "宛如", "一般", "似的", "的话"
]);

export const getCleanedContent = (content: string) => {
  let cleaned = content;
  
  // 1. 剔除模板标题（支持全角和半角冒号）
  TEMPLATE_WORDS.forEach(word => {
    const regex = new RegExp(`${word}[:：]?`, 'g');
    cleaned = cleaned.replace(regex, '');
  });

  // 2. 剔除 Markdown 标签及 HTML 标签
  cleaned = stripMarkdown(cleaned);

  // 3. 剔除多余的标点符号和特殊字符，仅保留中英文和数字
  cleaned = cleaned.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ');

  return cleaned;
};

export interface KeywordCount {
  text: string;
  value: number;
}

export const extractKeywords = (content: string): KeywordCount[] => {
  if (!content) return [];
  
  const cleaned = getCleanedContent(content);
  const wordCounts = new Map<string, number>();

  // 使用 Intl.Segmenter 进行中文分词 (现代浏览器和 Node.js 均支持)
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
    const segments = segmenter.segment(cleaned);

    for (const { segment, isWordLike } of segments) {
      if (isWordLike) {
        const word = segment.trim();
        // 过滤掉单字、停用词、纯数字
        if (word.length > 1 && !STOP_WORDS.has(word) && isNaN(Number(word))) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      }
    }
  } else {
    // 降级方案：使用正则匹配连续的 2 个以上中文字符
    const words = cleaned.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    for (const word of words) {
      if (!STOP_WORDS.has(word)) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }
  }

  // 转换为数组并按出现次数降序排序
  const result: KeywordCount[] = Array.from(wordCounts.entries())
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value);

  return result;
};
