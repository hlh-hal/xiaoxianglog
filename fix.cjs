const fs = require('fs');
let text = fs.readFileSync('src/utils/importExport.ts', 'utf-8');

const replacement = `export const parseMarkdownFile = (text: string, filename?: string): ParsedEntry[] => {
  const lines = text.replace(/^\\uFEFF/, '').split(/\\r?\\n/);
  const entriesMap = new Map<string, string[]>();
  let currentDate: string | null = null;
  let pendingYear: string | null = null;
  
  // Try to get a fallback date from the filename if available
  let filenameDate: string | null = null;
  if (filename) {
    const nameExtracted = filename.replace(/\\.[^.]+$/, '');
    filenameDate = parseFlexibleDate(nameExtracted);
  }

  for (const line of lines) {
    const extractedDate = parseFlexibleDate(line);
    
    // Check if line represents standalone year (e.g. "**2026**" or "2026")
    const yearMatch = line.replace(/[*#]/g, '').trim().match(/^(\\d{4})$/);
    if (!extractedDate && yearMatch) {
      pendingYear = yearMatch[1];
      continue;
    }

    // Check if line represents MM-DD and we have a pending year
    const mdMatch = line.replace(/[*#]/g, '').trim().match(/^(\\d{1,2})[-\\/\\.](\\d{1,2})$/);
    let combinedDate: string | null = null;
    if (!extractedDate && mdMatch && pendingYear) {
      combinedDate = formatDate(pendingYear, mdMatch[1], mdMatch[2]);
    }

    const actualDate = extractedDate || combinedDate;

    if (actualDate) {
      currentDate = actualDate;
      if (extractedDate) {
         const match = extractedDate.match(/(\\d{4})/);
         if (match) pendingYear = match[1];
      }
      
      if (!entriesMap.has(currentDate)) {
        entriesMap.set(currentDate, []);
      } else {
        const existing = entriesMap.get(currentDate)!;
        if (existing.length > 0 && existing[existing.length - 1].trim() !== '') {
          existing.push('');
        }
      }
    } else if (currentDate !== null) {
      entriesMap.get(currentDate)!.push(line);
    } else {
      if (line.trim() === '') continue; // Skip empty lines before the first valid date

      // If we haven't found any valid date line yet, stick it in the fallback date.
      const fallback = filenameDate || '';
      currentDate = fallback;
      if (!entriesMap.has(currentDate)) {
        entriesMap.set(currentDate, [line]);
      } else {
        entriesMap.get(currentDate)!.push(line);
      }
    }
  }

  const entries: ParsedEntry[] = [];
  for (const [date, lines] of entriesMap.entries()) {
    entries.push(finalizeEntry({ date, lines, isFallback: date === '' }));
  }

  return entries;
};`;

const startIndex = text.indexOf('function isFuzzyDateLine');
const endIndex = text.indexOf('const getTodayStr = (): string => {');

if (startIndex !== -1 && endIndex !== -1) {
  text = text.substring(0, startIndex) + replacement + '\n\n' + text.substring(endIndex);
  fs.writeFileSync('src/utils/importExport.ts', text);
  console.log('Replaced successfully');
} else {
  console.log('Indices not found:', startIndex, endIndex);
}
