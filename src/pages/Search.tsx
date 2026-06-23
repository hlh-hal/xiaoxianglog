import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CalendarDays, ChevronLeft, X } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { diaryService, DiaryEntry } from '../services/diaryService';
import { parseDiaryDateKey } from '../utils/diaryDate';
import { getAnnualEchoSearchYear, matchesAnnualEchoSearch } from '../utils/annualEcho';
import { getMonthlyEchoSearchMonthKey, matchesMonthlyEchoSearch, monthKeyToLabel } from '../utils/monthlyEcho';

function cleanText(raw: string): string {
  if (!raw) return '';
  let text = raw;
  text = text.replace(/<\/(p|div|h[1-6]|li)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1');
  text = text.replace(/^[\s]*[-*]\s+/gm, '');
  text = text.replace(/^>\s?/gm, '');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export default function Search() {
  const [keyword, setKeyword] = useState(() => sessionStorage.getItem('search_keyword') ?? '');
  const [results, setResults] = useState<DiaryEntry[]>([]);
  const [allEntries, setAllEntries] = useState<DiaryEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const scrollRef = useRef<HTMLElement | null>(null);
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

  const groupedResults = useMemo(() => {
    const groups: { [key: string]: DiaryEntry[] } = {};
    results.forEach((entry) => {
      const monthKey = format(parseDiaryDateKey(entry.diaryDate), 'yyyy年M月');
      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(entry);
    });
    return groups;
  }, [results]);

  const annualEchoResult = useMemo(() => {
    if (!keyword.trim() || !matchesAnnualEchoSearch(keyword)) return null;
    const year = getAnnualEchoSearchYear(keyword);
    return {
      year,
      title: `${year} 年度回声`,
      subtitle: '打开这一年的年度报告',
    };
  }, [keyword]);

  const monthlyEchoResult = useMemo(() => {
    if (!keyword.trim() || !matchesMonthlyEchoSearch(keyword)) return null;
    const monthKey = getMonthlyEchoSearchMonthKey(keyword);
    return {
      monthKey,
      title: `${monthKeyToLabel(monthKey)}月之回响`,
      subtitle: '打开这个月的回声信',
    };
  }, [keyword]);

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => (
          part.toLowerCase() === highlight.toLowerCase()
            ? <mark key={i}>{part}</mark>
            : part
        ))}
      </>
    );
  };

  const saveSearchPosition = () => {
    sessionStorage.setItem('search_keyword', keyword);
    sessionStorage.setItem('search_scroll', String(scrollRef.current?.scrollTop || 0));
  };

  const handleResultClick = (entryId: string) => {
    saveSearchPosition();
    navigate(`/editor?id=${entryId}`);
  };

  const handleAnnualEchoClick = (year: number) => {
    saveSearchPosition();
    navigate(`/annual-echo?year=${year}`);
  };

  const handleMonthlyEchoClick = (monthKey: string) => {
    saveSearchPosition();
    navigate(`/monthly-echo?monthKey=${monthKey}`);
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

  useLayoutEffect(() => {
    if (results.length === 0 && !annualEchoResult && !monthlyEchoResult) return;
    const savedScroll = sessionStorage.getItem('search_scroll');
    if (!savedScroll) return;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = parseInt(savedScroll, 10);
      }
    });
    sessionStorage.removeItem('search_scroll');
  }, [annualEchoResult, monthlyEchoResult, results]);

  const hasNoResults = keyword.trim() && results.length === 0 && !annualEchoResult && !monthlyEchoResult && !isSearching;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface font-sans">
      <header className="app-safe-header sticky top-0 left-0 z-40 flex w-full shrink-0 items-center bg-surface px-4">
        <button
          onClick={handleBack}
          className="mr-2 flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-container-high"
          aria-label="返回"
        >
          <ChevronLeft className="h-6 w-6 text-on-surface" />
        </button>

        <div className="flex h-10 flex-1 items-center rounded-xl bg-surface-container-low px-3">
          <input
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索日记..."
            autoFocus={!sessionStorage.getItem('search_keyword')}
            className="flex-1 border-none bg-transparent text-[15px] text-on-surface outline-none ring-0 placeholder-outline"
          />
          {keyword && (
            <button
              onClick={handleClear}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container-high"
              aria-label="清空搜索"
            >
              <X className="h-4 w-4 text-outline" />
            </button>
          )}
        </div>
      </header>

      <main ref={scrollRef} className="app-page-scroll min-h-0 flex-1 overflow-y-auto pb-20">
        {hasNoResults ? (
          <div className="flex flex-col items-center justify-center pt-32">
            <p className="text-[14px] text-on-surface-variant">未找到包含「{keyword}」的日记</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pt-2">
            {monthlyEchoResult && (
              <div>
                <div className="py-2 text-center text-[12px] text-outline">月之回响</div>
                <button
                  type="button"
                  onClick={() => handleMonthlyEchoClick(monthlyEchoResult.monthKey)}
                  className="mx-4 flex w-[calc(100%-2rem)] cursor-pointer gap-4 rounded-[20px] bg-[#FFFDF7] p-4 text-left shadow-[0_2px_12px_rgba(68,103,51,0.08)] transition-transform active:scale-[0.98]"
                >
                  <div className="flex min-w-[44px] flex-col items-center justify-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#446733]/10">
                      <CalendarDays className="h-5 w-5 text-[#446733]" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium leading-6 text-on-surface">
                      {highlightText(monthlyEchoResult.title, keyword)}
                    </p>
                    <p className="mt-1 text-[13px] leading-6 text-on-surface-variant">
                      {monthlyEchoResult.subtitle}
                    </p>
                  </div>
                </button>
              </div>
            )}

            {annualEchoResult && (
              <div>
                <div className="py-2 text-center text-[12px] text-outline">年度回声</div>
                <button
                  type="button"
                  onClick={() => handleAnnualEchoClick(annualEchoResult.year)}
                  className="mx-4 flex w-[calc(100%-2rem)] cursor-pointer gap-4 rounded-[20px] bg-[#FFFDF7] p-4 text-left shadow-[0_2px_12px_rgba(68,103,51,0.08)] transition-transform active:scale-[0.98]"
                >
                  <div className="flex min-w-[44px] flex-col items-center justify-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#446733]/10">
                      <BookOpen className="h-5 w-5 text-[#446733]" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium leading-6 text-on-surface">
                      {highlightText(annualEchoResult.title, keyword)}
                    </p>
                    <p className="mt-1 text-[13px] leading-6 text-on-surface-variant">
                      {annualEchoResult.subtitle}
                    </p>
                  </div>
                </button>
              </div>
            )}

            {Object.entries(groupedResults).map(([month, entries]) => (
              <div key={month}>
                <div className="py-2 text-center text-[12px] text-outline">
                  {month}（{entries.length}篇）
                </div>
                <div className="flex flex-col gap-2.5">
                  {entries.map((entry) => {
                    const date = parseDiaryDateKey(entry.diaryDate);
                    const fullContent = entry.blocks && entry.blocks.length > 0
                      ? entry.blocks.map(block => (block.title ? `${block.title}：\n` : '') + block.content).join('\n')
                      : entry.content || '';

                    const cleanTitle = cleanText(entry.title || '');
                    const plainContent = cleanText(fullContent);
                    let displayExcerpt = plainContent;
                    if (cleanTitle && !plainContent.startsWith(cleanTitle)) {
                      displayExcerpt = `${cleanTitle} ${plainContent}`;
                    }
                    if (displayExcerpt.length > 80) {
                      displayExcerpt = `${displayExcerpt.slice(0, 80)}...`;
                    }

                    return (
                      <button
                        type="button"
                        key={entry.id}
                        onClick={() => handleResultClick(entry.id)}
                        className="mx-4 flex cursor-pointer gap-4 rounded-[20px] bg-surface-container-lowest p-4 text-left shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-transform active:scale-[0.98]"
                      >
                        <div className="flex min-w-[44px] flex-col items-center">
                          <span className="mb-1 text-[26px] font-semibold leading-none text-on-surface">
                            {format(date, 'd')}
                          </span>
                          <span className="text-[11px] leading-none text-outline">
                            {format(date, 'E', { locale: zhCN })}
                          </span>
                          <span className="mt-0.5 text-[11px] leading-none text-outline">
                            {format(date, 'MM月')}
                          </span>
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col justify-center">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-3 whitespace-pre-wrap text-[14px] font-normal leading-relaxed text-on-surface">
                              {highlightText(displayExcerpt, keyword)}
                            </p>
                            <span className="mt-0.5 shrink-0 text-[12px] text-outline">
                              {format(date, 'HH:mm')}
                            </span>
                          </div>
                        </div>
                      </button>
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
