import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon, X, ChevronLeft } from 'lucide-react';
import { diaryService, DiaryEntry } from '../services/diaryService';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { parseDiaryDateKey } from '../utils/diaryDate';

function cleanText(raw: string): string {
  if (!raw) return '';
  let text = raw;
  // Replace block-level tags with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Remove markdown formatting
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1');
  text = text.replace(/^[\s]*[-*]\s+/gm, '');
  text = text.replace(/^>\s?/gm, '');
  text = text.replace(/`([^`]+)`/g, '$1');
  // Replace multiple spaces (but not newlines) with a single space
  text = text.replace(/[ \t]+/g, ' ');
  // Replace 3 or more newlines with 2 newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function excerpt(raw: string, max = 60): string {
  const plain = cleanText(raw);
  return plain.length > max ? plain.slice(0, max) + '...' : plain;
}

export default function Search() {
  const [keyword, setKeyword] = useState(() => {
    return sessionStorage.getItem('search_keyword') ?? '';
  });
  const [results, setResults] = useState<DiaryEntry[]>([]);
  const [allEntries, setAllEntries] = useState<DiaryEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const loadAll = async () => {
      const data = await diaryService.getActiveEntries();
      setAllEntries(data);
    };
    loadAll();
  }, []);

  useEffect(() => {
    const search = async () => {
      if (!keyword.trim()) {
        setResults(allEntries);
        return;
      }
      setIsSearching(true);
      const data = await diaryService.searchEntries(keyword.trim());
      setResults(data);
      setIsSearching(false);
    };

    const debounceTimer = setTimeout(search, 300);
    return () => clearTimeout(debounceTimer);
  }, [keyword, allEntries]);

  // Group results by month
  const groupedResults = useMemo(() => {
    const groups: { [key: string]: DiaryEntry[] } = {};
    results.forEach(entry => {
      const monthKey = format(parseDiaryDateKey(entry.diaryDate), 'yyyy年M月');
      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(entry);
    });
    return groups;
  }, [results]);

  // Highlight keyword function
  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase() ? (
            <mark key={i}>{part}</mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  const handleResultClick = (entryId: string) => {
    sessionStorage.setItem('search_keyword', keyword);
    sessionStorage.setItem('search_scroll', window.scrollY.toString());
    navigate(`/editor?id=${entryId}`);
  };

  const handleClear = () => {
    setKeyword('');
    sessionStorage.removeItem('search_keyword');
    sessionStorage.removeItem('search_scroll');
  };

  const handleBack = () => {
    sessionStorage.removeItem('search_keyword');
    sessionStorage.removeItem('search_scroll');
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  };

  // Restore scroll position after results are rendered
  useLayoutEffect(() => {
    if (results.length > 0) {
      const savedScroll = sessionStorage.getItem('search_scroll');
      if (savedScroll) {
        window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' });
        sessionStorage.removeItem('search_scroll');
      }
    }
  }, [results]);

  return (
    <div className="min-h-screen bg-surface font-sans">
      {/* AppBar */}
      <header className="app-safe-header sticky top-0 left-0 w-full z-40 flex items-center px-4 bg-surface">
        <button 
          onClick={handleBack}
          className="flex items-center justify-center w-10 h-10 mr-2 rounded-full hover:bg-surface-container-high transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-on-surface" />
        </button>
        
        <div className="flex-1 flex items-center bg-surface-container-low rounded-xl h-10 px-3">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索日记..."
            autoFocus={!sessionStorage.getItem('search_keyword')}
            className="flex-1 bg-transparent border-none outline-none ring-0 text-on-surface placeholder-outline text-[15px]"
          />
          {keyword && (
            <button 
              onClick={handleClear}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-surface-container-high"
            >
              <X className="w-4 h-4 text-outline" />
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="pb-20">
        {keyword.trim() && results.length === 0 && !isSearching ? (
          <div className="flex flex-col items-center justify-center pt-32">
            <p className="text-on-surface-variant text-[14px]">未找到包含「{keyword}」的日记</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pt-2">
            {Object.entries(groupedResults).map(([month, entries]) => (
              <div key={month}>
                <div className="text-center py-2 text-[12px] text-outline">
                  {month}（{entries.length}篇）
                </div>
                <div className="flex flex-col gap-2.5">
                  {entries.map(entry => {
                    const date = parseDiaryDateKey(entry.diaryDate);
                    
                    let fullContent = '';
                    if (entry.blocks && entry.blocks.length > 0) {
                      fullContent = entry.blocks.map(b => (b.title ? b.title + '：\n' : '') + b.content).join('\n');
                    } else {
                      fullContent = entry.content || '';
                    }
                    
                    let cleanTitle = cleanText(entry.title || '');
                    let plainContent = cleanText(fullContent);
                    
                    let displayExcerpt = plainContent;
                    if (cleanTitle && !plainContent.startsWith(cleanTitle)) {
                      displayExcerpt = cleanTitle + ' ' + plainContent;
                    }

                    if (displayExcerpt.length > 80) {
                      displayExcerpt = displayExcerpt.slice(0, 80) + '...';
                    }

                    return (
                      <div 
                        key={entry.id}
                        onClick={() => handleResultClick(entry.id)}
                        className="mx-4 bg-surface-container-lowest rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 flex gap-4 cursor-pointer active:scale-[0.98] transition-transform"
                      >
                        {/* Left Date Column */}
                        <div className="flex flex-col items-center min-w-[44px]">
                          <span className="text-[26px] font-semibold text-on-surface leading-none mb-1">
                            {format(date, 'd')}
                          </span>
                          <span className="text-[11px] text-outline leading-none">
                            {format(date, 'E', { locale: zhCN })}
                          </span>
                          <span className="text-[11px] text-outline leading-none mt-0.5">
                            {format(date, 'MM月')}
                          </span>
                        </div>

                        {/* Right Content Column */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[14px] font-normal text-on-surface line-clamp-3 leading-relaxed whitespace-pre-wrap">
                              {highlightText(displayExcerpt, keyword)}
                            </p>
                            <span className="text-[12px] text-outline shrink-0 mt-0.5">
                              {format(date, 'HH:mm')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
