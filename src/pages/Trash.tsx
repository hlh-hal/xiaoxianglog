import React, { useState, useEffect } from 'react';
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { diaryService, DiaryEntry } from '../services/diaryService';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { stripAllMarkdown } from '../lib/utils';
import { parseDiaryDateKey } from '../utils/diaryDate';

export default function Trash() {
  const navigate = useNavigate();
  const location = useLocation();
  const { returnToDrawer } = useOutletContext<any>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const [items, setItems] = useState<DiaryEntry[]>([]);

  useEffect(() => {
    loadTrashItems();
  }, []);

  const loadTrashItems = async () => {
    const trashedEntries = await diaryService.getTrashEntries();
    setItems(trashedEntries);
  };

  const handleRestore = async (id: string) => {
    await diaryService.restoreEntry(id);
    await loadTrashItems();
    setSelectedId(null);
  };

  const handlePermanentDelete = async (id: string) => {
    await diaryService.permanentlyDeleteEntry(id);
    await loadTrashItems();
    setShowDeleteConfirm(null);
    setSelectedId(null);
  };

  const handleClear = async () => {
    await diaryService.clearTrash();
    await loadTrashItems();
    setShowClearConfirm(false);
  };

  const goBack = () => {
    if (location.state?.fromDrawer && returnToDrawer) {
      returnToDrawer();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface pb-12 animate-in fade-in slide-in-from-right-8 duration-300 ease-out">
      <header 
        className="app-safe-header sticky top-0 z-40 flex items-center justify-between px-4 w-full transition-colors duration-300 bg-[#FAF9F5] dark:bg-[#1C1C1E]"
      >
        <button 
          onClick={goBack}
          className="flex items-center justify-center rounded-[12px] transition-colors duration-300 bg-transparent active:bg-[rgba(0,0,0,0.06)] dark:active:bg-[rgba(255,255,255,0.08)] text-[#1C1C1E] dark:text-[#F2F2F7] shrink-0 relative z-10"
          style={{ width: '40px', height: '40px' }}
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 
          className="absolute left-1/2 -translate-x-1/2 m-0 text-[20px] font-[700] text-[#1C1C1E] dark:text-[#F2F2F7] transition-colors duration-300"
          style={{ fontFamily: 'inherit' }}
        >
          回收站
        </h1>
        <div className="shrink-0 flex items-center justify-end" style={{ width: '40px', height: '40px' }}>
          {items.length > 0 && (
            <button 
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center justify-center rounded-[12px] transition-colors duration-300 bg-transparent active:bg-[rgba(0,0,0,0.06)] dark:active:bg-[rgba(255,255,255,0.08)] text-[#446733] font-medium text-[15px] px-2 h-full whitespace-nowrap"
              style={{ fontFamily: 'inherit' }}
            >
              清空
            </button>
          )}
        </div>
      </header>

      <main className="app-reading-container pt-6">
        {items.length > 0 ? (
          <>
            <header className="mb-8">
              <p className="text-sm text-on-surface-variant/70 leading-relaxed font-light">
                这里保存已删除和放弃编辑的日志
              </p>
            </header>

            <div className="space-y-4">
              {items.map((item) => {
                const isDeleted = item.trashReason === 'deleted';
                const statusText = isDeleted ? '已删除' : '放弃编辑';
                const dateText = item.diaryDate ? format(parseDiaryDateKey(item.diaryDate), 'yyyy年MM月dd日', { locale: zhCN }) : '未知日期';
                
                return (
                  <div 
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className="p-5 bg-surface-container-low rounded-lg cursor-pointer hover:bg-surface-container transition-colors duration-300"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-1 h-4 bg-primary rounded-full"></div>
                        <span className="text-[15px] font-medium text-on-surface tracking-tight">{dateText}</span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium tracking-wider ${isDeleted ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {statusText}
                      </span>
                    </div>
                    <div 
                      className="text-on-surface-variant text-[14px] leading-[1.6] font-light mt-2 whitespace-pre-wrap break-words"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 6,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {stripAllMarkdown(item.content) || item.title || '无内容'}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center pt-32">
            <p className="text-gray-400 text-sm font-light">回收站是空的</p>
          </div>
        )}
      </main>

      {/* Action Menu Modal */}
      {selectedId && !showDeleteConfirm && (
        <div 
          className="fixed inset-0 z-[100] bg-on-surface/10 backdrop-blur-[2px] flex items-center justify-center p-8"
          onClick={() => setSelectedId(null)}
        >
          <div 
            className="w-full max-w-[280px] bg-surface-container-lowest rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden transition-all duration-300"
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => handleRestore(selectedId)}
              className="w-full px-6 py-4 flex items-center justify-between active:bg-surface-container-low transition-colors border-b border-surface-container"
            >
              <span className="text-on-surface text-[17px] font-medium">恢复日志</span>
              <RotateCcw className="text-on-surface-variant w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowDeleteConfirm(selectedId)}
              className="w-full px-6 py-4 flex items-center justify-between active:bg-surface-container-low transition-colors"
            >
              <span className="text-red-500 text-[17px] font-medium">永久删除</span>
              <Trash2 className="text-red-500 w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div 
          className="fixed inset-0 z-[110] bg-on-surface/20 backdrop-blur-[2px] flex items-center justify-center p-8"
          onClick={() => setShowDeleteConfirm(null)}
        >
          <div 
            className="w-full max-w-[300px] bg-surface-container-lowest rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] overflow-hidden transition-all duration-300 p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium text-on-surface mb-2">确认永久删除？</h3>
            <p className="text-sm text-on-surface-variant mb-6">此操作不可恢复，该日志将被永久删除。</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors"
              >
                取消
              </button>
              <button 
                onClick={() => handlePermanentDelete(showDeleteConfirm)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirm Modal */}
      {showClearConfirm && (
        <div 
          className="fixed inset-0 z-[110] bg-on-surface/20 backdrop-blur-[2px] flex items-center justify-center p-8"
          onClick={() => setShowClearConfirm(false)}
        >
          <div 
            className="w-full max-w-[300px] bg-surface-container-lowest rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] overflow-hidden transition-all duration-300 p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium text-on-surface mb-2">确认清空？</h3>
            <p className="text-sm text-on-surface-variant mb-6">确认清空所有回收站内容？此操作不可恢复。</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleClear}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
