import React, { useEffect, useState } from 'react';
import { Download, Monitor, Smartphone, X, CheckCircle2 } from 'lucide-react';
import { PlatformTarget } from '../utils/security';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAInstallButtonProps {
  activePlatform: PlatformTarget;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ activePlatform }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return;
      }
    }
    setShowGuideModal(true);
  };

  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Приложение установлено
      </span>
    );
  }

  const labelByPlatform: Record<PlatformTarget, string> = {
    macos: 'Установить на Mac',
    windows: 'Установить на Windows',
    android: 'Установить на Android',
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        {labelByPlatform[activePlatform]}
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 id="pwa-install-title" className="text-base font-bold text-slate-900 dark:text-white">
                Установка AniMac Studio (PWA / Оффлайн-клиент)
              </h3>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Закрыть инструкцию установки"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white mb-1">
                  <Monitor className="w-4 h-4 text-sky-500" />
                  macOS (Safari / Chrome / Edge)
                </div>
                <p className="text-xs leading-relaxed">
                  В Safari нажмите <strong>Поделиться → Добавить в Dock</strong>. В Chrome или Edge нажмите значок <strong>Установить приложение</strong> в правой части адресной строки.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white mb-1">
                  <Monitor className="w-4 h-4 text-indigo-500" />
                  Windows 10 / 11 (Desktop App)
                </div>
                <p className="text-xs leading-relaxed">
                  В Chrome или Microsoft Edge нажмите иконку <strong>Установить AniMac Studio</strong> в адресной строке — приложение появится в меню «Пуск» и на рабочем столе с поддержкой оффлайн-базы.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white mb-1">
                  <Smartphone className="w-4 h-4 text-emerald-500" />
                  Android / iOS (Мобильная версия)
                </div>
                <p className="text-xs leading-relaxed">
                  На Android в Chrome откройте меню <strong>⋮ → Установить приложение</strong> (создается WebAPK). На iOS в Safari нажмите <strong>Поделиться → На экран «Домой»</strong>.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
