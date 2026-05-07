import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function stripAllMarkdown(text: string): string {
  if (!text) return '';
  
  let htmlText = text;
  
  // Convert <ol> structure to include numbers before stripping tags
  htmlText = htmlText.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, inner) => {
    let liCount = 1;
    return inner.replace(/<li[^>]*>/gi, () => `<li>${liCount++}. `);
  });
  
  // Convert <ul> structure to include bullets before stripping tags
  htmlText = htmlText.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, inner) => {
    return inner.replace(/<li[^>]*>/gi, '<li>• ');
  });

  return htmlText
    // 块级标签转为换行（保留连续空白的结构）
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    // 强制换行标签转为换行
    .replace(/<br\s*\/?>/gi, '\n')
    // 去除所有剩余 HTML 标签
    .replace(/<[^>]+>/g, '')
    // 去除 Markdown 标题（如果内容混合了Markdown文本）
    .replace(/^#{1,6}\s+/gm, '')
    // 去除粗体/斜体
    .replace(/(\*{1,2}|_{1,2})(.*?)\1/g, '$2')
    // 去除行内代码
    .replace(/`([^`]+)`/g, '$1')
    // 去除代码块
    .replace(/```[\s\S]*?```/g, '')
    // 去除引用
    .replace(/^>\s*/gm, '')
    // 如果已经有由上面生成的列表符，可能被旧的 Markdown 去除逻辑波及，这里调整一下
    // 下面两行可能误删我们刚加的数字或符号，因此我们不要用它们去处理已经被加了项目符号的文本。
    // 但是考虑到有些文本本身带有这些，这里改为只去除行首单纯的符号，不影响我们加的内容，因为我们加的内容已经在HTML标签内去除了，变为行首。
    // 实际上我们在HTML前面加了 `1. `，它会被当成行首去除吗？
    // .replace(/^[\-\*\+]\s+/gm, '') 
    // .replace(/^\d+\.\s+/gm, '')
    // 这些反而去除了纯文本的符号，我们现在需要保留用户看到的序号！所以注释掉这两行。
    
    // 去除分割线
    .replace(/^[-\*]{3,}$/gm, '')
    // 清理连续的新行，将其压缩为一个新行（或两个，视需求而定。由于抱怨空行，我们压缩为最多一个或两个）
    // 为了使列表和标题看起来紧凑，我们可以将2个以上的换行压缩为1个
    // 或者用 \n\n 视需求
    .replace(/\n{2,}/g, '\n')
    // 去除 HTML 实体
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
