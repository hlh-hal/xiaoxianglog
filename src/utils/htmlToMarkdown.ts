export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  let text = html;

  // 处理换行标签
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // 处理段落
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  
  // 处理列表项（先处理内容再加前缀）
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => {
    return '- ' + inner.replace(/<[^>]+>/g, '').trim() + '\n';
  });
  text = text.replace(/<\/?[uo]l[^>]*>/gi, '\n');
  
  // 处理加粗/斜体
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  
  // 处理标题
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, content) => {
    return '#'.repeat(Number(level)) + ' ' + content.replace(/<[^>]+>/g, '') + '\n';
  });
  
  // 剥离剩余 HTML 标签
  text = text.replace(/<[^>]+>/g, '');
  
  // 处理 HTML 实体
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&quot;/g, '"');
  
  // 压缩多余空行
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
}
