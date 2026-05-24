import React from 'react';

interface AppToastProps {
  message: string | null | undefined;
  className?: string;
}

export function AppToast({ message, className = '' }: AppToastProps) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`app-toast fixed left-1/2 z-[9999] w-[min(calc(100vw-32px),420px)] -translate-x-1/2 text-center pointer-events-none ${className}`}
    >
      <div className="inline-block max-w-full break-words rounded-2xl bg-[#1C1C1E]/95 px-4 py-3 text-sm font-medium leading-relaxed text-white shadow-[0_10px_28px_rgba(0,0,0,0.22)] backdrop-blur-md dark:bg-[#F2F2F7]/95 dark:text-[#1C1C1E]">
        {message}
      </div>
    </div>
  );
}
