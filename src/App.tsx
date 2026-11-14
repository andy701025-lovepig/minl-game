import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Maximize2,
  Music,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import desktopBackdropUrl from './assets/images/piggy_kart_backdrop_1794638176603.jpg';
import titleArtUrl from './assets/images/piggy_kart_title_art_1794638177630.jpg';
import { GameAudio } from './game/audio';
import { CakeStackEngine } from './game/engine';
import type { GameSnapshot, HighScoreData, PowerUpType } from './game/types';

const DESKTOP_BACKDROP_SRC = desktopBackdropUrl;
const TITLE_ART_SRC = titleArtUrl;

const INITIAL_SNAPSHOT: GameSnapshot = {
  state: 'TITLE_MENU',
  score: 0,
  height: 0,
  combo: 0,
  maxCombo: 0,
  widthPercent: 100,
  canWiden: true,
  isDropping: false,
  currentFlavorName: '01 草莓紅渦輪豬車',
  isNewRecord: false,
  powerUps: { autoAlign: 2, widen: 2, shield: 2 },
  shieldActive: false,
};

export default function App() {
  const stageRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CakeStackEngine | null>(null);
  const audioRef = useRef<GameAudio | null>(null);

  const [snapshot, setSnapshot] = useState<GameSnapshot>(INITIAL_SNAPSHOT);
  const [highScores, setHighScores] = useState<HighScoreData>({
    bestScore: 0,
    bestHeight: 0,
    bestCombo: 0,
  });
  const [muted, setMuted] = useState<boolean>(false);
  const [bgmEnabled, setBgmEnabled] = useState<boolean>(true);
  const [desktopBackdropFailed, setDesktopBackdropFailed] = useState<boolean>(false);
  const [titleArtFailed, setTitleArtFailed] = useState<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas) return;

    const audio = new GameAudio();
    audioRef.current = audio;
    setMuted(audio.isMuted());
    setBgmEnabled(audio.isBgmEnabled());

    const engine = new CakeStackEngine(canvas, audio, (next, scores) => {
      setSnapshot(next);
      setHighScores(scores);
    });
    engineRef.current = engine;
    engine.startLoop();

    const handleResize = () => {
      engine.resize();
    };
    const handleBlur = () => {
      engine.pause();
    };

    const resizeObserver = stage
      ? new ResizeObserver(() => {
          engine.resize();
        })
      : null;
    if (stage && resizeObserver) {
      resizeObserver.observe(stage);
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('blur', handleBlur);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('blur', handleBlur);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const handleStartGame = useCallback(() => {
    engineRef.current?.startNewGame();
  }, []);

  const handleToggleMute = useCallback((e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    if (!audioRef.current) return;
    const nextMuted = audioRef.current.toggleMute();
    setMuted(nextMuted);
  }, []);

  const handleToggleBgm = useCallback((e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    if (!audioRef.current) return;
    const nextBgm = audioRef.current.toggleBgm();
    setBgmEnabled(nextBgm);
  }, []);

  const handleTogglePause = useCallback((e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    engineRef.current?.togglePause();
  }, []);

  const handleReturnTitle = useCallback((e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    engineRef.current?.returnToTitle();
  }, []);

  const handleUsePowerUp = useCallback((type: PowerUpType, e: React.SyntheticEvent) => {
    e.stopPropagation();
    engineRef.current?.usePowerUp(type);
  }, []);

  const handleStagePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if ((e.target as HTMLElement).closest('button')) return;
      if (snapshot.state === 'PLAYING') {
        engineRef.current?.dropCake();
      }
    },
    [snapshot.state]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        if (snapshot.state === 'TITLE_MENU' || snapshot.state === 'GAME_OVER') {
          e.preventDefault();
          engineRef.current?.startNewGame();
        } else if (snapshot.state === 'PLAYING') {
          e.preventDefault();
          engineRef.current?.dropCake();
        }
      } else if (e.code === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (snapshot.state === 'PLAYING' || snapshot.state === 'PAUSED') {
          e.preventDefault();
          engineRef.current?.togglePause();
        }
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === '1' && snapshot.state === 'PLAYING') {
        engineRef.current?.usePowerUp('autoAlign');
      } else if (e.key === '2' && snapshot.state === 'PLAYING') {
        engineRef.current?.usePowerUp('widen');
      } else if (e.key === '3' && snapshot.state === 'PLAYING') {
        engineRef.current?.usePowerUp('shield');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [snapshot.state, handleToggleMute]);

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#F5E6EA]">
      {/* Desktop ambient karting paddock backdrop */}
      {!desktopBackdropFailed && (
        <img
          src={DESKTOP_BACKDROP_SRC}
          alt="田園賽車整備區背景"
          referrerPolicy="no-referrer"
          onError={() => setDesktopBackdropFailed(true)}
          className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-55 sm:block"
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-gradient-to-b from-[#FFF6F8]/55 via-[#FCE8EE]/40 to-[#D9B8C2]/55 sm:block"
      />

      {/* Portrait Mobile Game Frame (Full-screen on mobile, centered 390:720 frame on desktop) */}
      <main
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        className="relative h-[100dvh] w-full overflow-hidden bg-[#E6F4FF] touch-none select-none sm:h-[min(92dvh,832px)] sm:w-auto sm:aspect-[390/720] sm:rounded-[28px] sm:border-[6px] sm:border-[#F2CDD7] sm:shadow-[0_24px_60px_rgba(92,38,56,0.24)]"
      >
        {/* Isolated 60fps Canvas */}
        <canvas
          ref={canvasRef}
          aria-label="豬豬賽車疊疊樂遊戲畫布"
          className="block h-full w-full cursor-pointer"
        />

        {/* Top Perimeter HUD (Low-occlusion, pointer-events-none wrapper) */}
        {snapshot.state !== 'TITLE_MENU' && (
          <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-3.5 pt-[max(0.65rem,env(safe-area-inset-top))]">
            <div className="flex flex-col">
              <div className="flex items-baseline gap-2 text-[#3D252B]">
                <span className="font-display text-3xl font-bold leading-none tabular-nums drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]">
                  {snapshot.height}
                </span>
                <span className="text-xs font-semibold text-[#7A4B59]">台</span>
                <span aria-hidden="true" className="text-[#D4A6B4]">·</span>
                <span className="text-sm font-bold tabular-nums text-[#59333E]">
                  {snapshot.score} 分
                </span>
              </div>

              <div className="mt-1 flex items-center gap-2 text-xs font-medium text-[#7A4B59]">
                <span className="truncate max-w-[130px]">{snapshot.currentFlavorName}</span>
                {snapshot.combo >= 2 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-bold tabular-nums text-[#E11D48]">
                      連擊 ×{snapshot.combo}
                    </span>
                  </>
                )}
                {snapshot.shieldActive && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-0.5 font-bold text-[#047857]">
                      <Shield className="h-3 w-3" />
                      防護中
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleToggleBgm}
                aria-label={bgmEnabled ? '關閉背景音樂' : '開啟背景音樂'}
                title={bgmEnabled ? '背景音樂：開' : '背景音樂：關'}
                className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border shadow-sm transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-[#E11D48] ${
                  bgmEnabled && !muted
                    ? 'border-[#F2CDD7] bg-white/95 text-[#E11D48] hover:bg-white'
                    : 'border-[#E8D5DB] bg-rose-50/85 text-rose-300 hover:bg-white'
                }`}
              >
                <Music className="h-4.5 w-4.5" />
              </button>

              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleToggleMute}
                aria-label={muted ? '開啟聲音' : '全部靜音'}
                title={muted ? '全部靜音中' : '聲音：開'}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[#F2CDD7] bg-white/95 text-[#59333E] shadow-sm transition-transform duration-150 hover:bg-white active:scale-95 focus-visible:outline-2 focus-visible:outline-[#E11D48]"
              >
                {muted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
              </button>

              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleTogglePause}
                aria-label={snapshot.state === 'PAUSED' ? '繼續遊戲' : '暫停遊戲'}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#F2CDD7] bg-white/95 px-3.5 text-xs font-bold text-[#3D252B] shadow-sm transition-transform duration-150 hover:bg-white active:scale-95 focus-visible:outline-2 focus-visible:outline-[#E11D48] whitespace-nowrap shrink-0"
              >
                {snapshot.state === 'PAUSED' ? (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>繼續</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4" />
                    <span>暫停</span>
                  </>
                )}
              </button>
            </div>
          </header>
        )}

        {/* First-drop subtle prompt during early play */}
        {snapshot.state === 'PLAYING' && snapshot.height === 0 && !snapshot.isDropping && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[26%] z-10 flex justify-center px-6">
            <p className="text-center text-sm font-semibold tracking-wide text-[#3D252B]/90 drop-shadow-[0_1px_2px_rgba(255,255,255,0.95)]">
              點擊畫面任意處，讓豬豬賽車停上起跑線開始疊高
            </p>
          </div>
        )}

        {/* Bottom Thumb-Zone Power-Up Dock */}
        {snapshot.state === 'PLAYING' && (
          <nav
            aria-label="遊戲道具欄"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2.5 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            {/* 1. Auto-Align */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleUsePowerUp('autoAlign', e)}
              disabled={snapshot.powerUps.autoAlign <= 0 || snapshot.isDropping}
              className="pointer-events-auto flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[#F2CDD7] bg-white/95 px-2.5 py-2 text-[#3D252B] shadow-md transition-all duration-150 hover:bg-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
            >
              <Crosshair className="h-4 w-4 shrink-0 text-[#E11D48]" />
              <span className="text-xs font-bold">自動對齊</span>
              <span className="text-xs font-bold tabular-nums text-[#E11D48]">
                ×{snapshot.powerUps.autoAlign}
              </span>
            </button>

            {/* 2. Widen */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleUsePowerUp('widen', e)}
              disabled={snapshot.powerUps.widen <= 0 || !snapshot.canWiden}
              className="pointer-events-auto flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[#F2CDD7] bg-white/95 px-2.5 py-2 text-[#3D252B] shadow-md transition-all duration-150 hover:bg-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
            >
              <Maximize2 className="h-4 w-4 shrink-0 text-[#D97706]" />
              <span className="text-xs font-bold">增加寬度</span>
              <span className="text-xs font-bold tabular-nums text-[#D97706]">
                ×{snapshot.powerUps.widen}
              </span>
            </button>

            {/* 3. Shield */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleUsePowerUp('shield', e)}
              disabled={snapshot.powerUps.shield <= 0 || snapshot.shieldActive}
              className={`pointer-events-auto flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-2 shadow-md transition-all duration-150 active:scale-95 disabled:cursor-not-allowed whitespace-nowrap ${
                snapshot.shieldActive
                  ? 'border-[#10B981] bg-[#ECFDF5] text-[#065F46]'
                  : 'border-[#F2CDD7] bg-white/95 text-[#3D252B] hover:bg-white disabled:opacity-45'
              }`}
            >
              <Shield className="h-4 w-4 shrink-0 text-[#059669]" />
              <span className="text-xs font-bold">
                {snapshot.shieldActive ? '已啟用' : '防護盾'}
              </span>
              {!snapshot.shieldActive && (
                <span className="text-xs font-bold tabular-nums text-[#059669]">
                  ×{snapshot.powerUps.shield}
                </span>
              )}
            </button>
          </nav>
        )}

        {/* Title Screen Overlay */}
        {snapshot.state === 'TITLE_MENU' && (
          <section
            aria-label="遊戲主畫面"
            className="absolute inset-0 z-30 flex flex-col justify-between overflow-hidden"
          >
            {!titleArtFailed && (
              <img
                src={TITLE_ART_SRC}
                alt="田園賽道整備區插畫"
                referrerPolicy="no-referrer"
                onError={() => setTitleArtFailed(true)}
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-34"
              />
            )}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#FFF8FA]/92 via-[#FFF8FA]/55 to-[#FFF8FA]/88"
            />

            {/* Top Audio & Music Toggles */}
            <div className="relative z-10 flex justify-end gap-1.5 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button
                type="button"
                onClick={handleToggleBgm}
                aria-label={bgmEnabled ? '關閉背景音樂' : '開啟背景音樂'}
                className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border shadow-sm transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-[#E11D48] ${
                  bgmEnabled && !muted
                    ? 'border-[#F2CDD7] bg-white/95 text-[#E11D48] hover:bg-white'
                    : 'border-[#E8D5DB] bg-rose-50/85 text-rose-300 hover:bg-white'
                }`}
              >
                <Music className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? '開啟聲音' : '全部靜音'}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[#F2CDD7] bg-white/95 text-[#59333E] shadow-sm transition-transform duration-150 hover:bg-white active:scale-95 focus-visible:outline-2 focus-visible:outline-[#E11D48]"
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            </div>

            {/* Bespoke SVG Piggy Kart Title Lockup */}
            <div className="relative z-10 flex flex-col items-center px-6 pt-2 text-center">
              <svg
                width="86"
                height="60"
                viewBox="0 0 86 60"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                className="mb-3"
              >
                <ellipse cx="43" cy="54" rx="33" ry="4" fill="#E5C1CC" />
                {/* Bottom Mint Kart */}
                <rect x="13" y="38" width="60" height="10" rx="3.5" fill="#34B388" stroke="#1E293B" strokeWidth="1.4" />
                <circle cx="24" cy="49" r="4.5" fill="#181B20" />
                <circle cx="24" cy="49" r="2" fill="#F1F5F9" />
                <circle cx="62" cy="49" r="4.5" fill="#181B20" />
                <circle cx="62" cy="49" r="2" fill="#F1F5F9" />
                {/* Top Red Piggy Kart */}
                {/* Piggy Ears */}
                <path d="M34 11L36 6L40 10Z" fill="#FF94B7" stroke="#6B2D40" strokeWidth="1.1" />
                <path d="M52 11L50 6L46 10Z" fill="#FF94B7" stroke="#6B2D40" strokeWidth="1.1" />
                {/* Piggy Head */}
                <ellipse cx="43" cy="16" rx="10" ry="7.5" fill="#FFA7C4" stroke="#6B2D40" strokeWidth="1.2" />
                {/* Racing Goggles */}
                <rect x="34" y="12.2" width="18" height="2" fill="#334155" />
                <rect x="36.5" y="11" width="5" height="3.8" rx="1.2" fill="#38BDF8" stroke="#1E293B" strokeWidth="0.8" />
                <rect x="44.5" y="11" width="5" height="3.8" rx="1.2" fill="#38BDF8" stroke="#1E293B" strokeWidth="0.8" />
                {/* Snout */}
                <ellipse cx="44" cy="18.2" rx="4" ry="2.6" fill="#F46E97" />
                <circle cx="42.8" cy="18.2" r="0.7" fill="#6B2D40" />
                <circle cx="45.2" cy="18.2" r="0.7" fill="#6B2D40" />
                {/* Red Kart Body */}
                <rect x="16" y="21" width="54" height="11" rx="4" fill="#E13D48" stroke="#1E293B" strokeWidth="1.4" />
                <rect x="34" y="23" width="18" height="7" rx="1.5" fill="#FFFDF9" />
                <text x="43" y="28.2" textAnchor="middle" fill="#1E293B" fontSize="5.8" fontWeight="700" fontFamily="sans-serif">01</text>
                <circle cx="26" cy="32.5" r="4.2" fill="#181B20" />
                <circle cx="26" cy="32.5" r="1.8" fill="#F1F5F9" />
                <circle cx="60" cy="32.5" r="4.2" fill="#181B20" />
                <circle cx="60" cy="32.5" r="1.8" fill="#F1F5F9" />
              </svg>

              <h1 className="font-display text-[clamp(2rem,7vw,2.5rem)] font-bold leading-tight tracking-tight text-[#3D252B] text-balance">
                豬豬賽車疊疊樂
              </h1>
              <p className="mt-1 font-display text-sm font-semibold tracking-wider text-[#E11D48]">
                Piggy Kart Stack
              </p>

              {/* Unboxed Personal Best Metadata */}
              {highScores.bestHeight > 0 && (
                <div className="mt-4 flex items-center justify-center gap-2.5 text-xs font-medium text-[#7A4B59] tabular-nums">
                  <span>最佳 {highScores.bestHeight} 台</span>
                  <span aria-hidden="true">·</span>
                  <span>最高 {highScores.bestScore} 分</span>
                  {highScores.bestCombo > 1 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>連擊 ×{highScores.bestCombo}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Start CTA & Single Control Hint */}
            <div className="relative z-10 flex flex-col items-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={handleStartGame}
                className="w-full max-w-[260px] min-h-[52px] rounded-2xl bg-[#E11D48] px-6 py-3.5 text-base font-bold text-white shadow-[0_6px_0_#9F1239,0_12px_24px_rgba(225,29,72,0.28)] transition-all duration-150 hover:bg-[#BE123C] active:translate-y-1 active:shadow-[0_2px_0_#9F1239] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3D252B] whitespace-nowrap"
              >
                開始疊豬豬賽車
              </button>

              <p className="mt-4 text-center text-xs font-medium text-[#7A4B59] whitespace-nowrap">
                點擊螢幕或按空白鍵放下豬豬賽車 · P 暫停
              </p>
            </div>
          </section>
        )}

        {/* Pause Modal */}
        {snapshot.state === 'PAUSED' && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-title"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute inset-0 z-30 flex items-center justify-center bg-[#3D252B]/45 px-6"
          >
            <div className="w-full max-w-[300px] rounded-2xl border border-[#F2CDD7] bg-[#FFF8FA] p-6 text-center shadow-xl">
              <h2 id="pause-title" className="font-display text-2xl font-bold text-[#3D252B]">
                比賽暫停
              </h2>
              <p className="mt-1.5 text-sm font-medium text-[#7A4B59] tabular-nums">
                目前高度 {snapshot.height} 台 · {snapshot.score} 分
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#E11D48] px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_0_#9F1239] transition-all duration-150 hover:bg-[#BE123C] active:translate-y-0.5 active:shadow-[0_2px_0_#9F1239] whitespace-nowrap"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>繼續比賽</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartGame}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#F2CDD7] bg-white px-5 py-2.5 text-sm font-semibold text-[#59333E] transition-colors duration-150 hover:bg-rose-50 whitespace-nowrap"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>重新開始</span>
                </button>

                <button
                  type="button"
                  onClick={handleReturnTitle}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl px-5 py-2 text-sm font-medium text-[#7A4B59] transition-colors duration-150 hover:text-[#3D252B] whitespace-nowrap"
                >
                  回到主畫面
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Game Over Modal */}
        {snapshot.state === 'GAME_OVER' && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gameover-title"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute inset-0 z-30 flex items-center justify-center bg-[#3D252B]/50 px-6"
          >
            <div className="w-full max-w-[312px] rounded-2xl border border-[#F2CDD7] bg-[#FFF8FA] p-6 text-center shadow-xl">
              {snapshot.isNewRecord && (
                <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#E11D48]">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>刷新個人最佳紀錄</span>
                </div>
              )}

              <h2 id="gameover-title" className="font-display text-2xl font-bold text-[#3D252B]">
                豬豬車塔完成！
              </h2>
              <p className="mt-1 text-xs font-medium text-[#7A4B59]">
                本局賽道疊高結算
              </p>

              {/* Clean 3-column tabular readout */}
              <div className="mt-5 grid grid-cols-3 border-y border-[#F2DCE2] py-4">
                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-medium text-[#7A4B59]">堆疊台數</span>
                  <span className="mt-1 font-display text-2xl font-bold text-[#3D252B] tabular-nums">
                    {snapshot.height}
                  </span>
                </div>
                <div className="flex flex-col items-center border-x border-[#F2DCE2]">
                  <span className="text-[11px] font-medium text-[#7A4B59]">總分</span>
                  <span className="mt-1 font-display text-2xl font-bold text-[#E11D48] tabular-nums">
                    {snapshot.score}
                  </span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-medium text-[#7A4B59]">最高連擊</span>
                  <span className="mt-1 font-display text-2xl font-bold text-[#D97706] tabular-nums">
                    {snapshot.maxCombo}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-[#7A4B59] tabular-nums">
                <span>歷史最高 {highScores.bestHeight} 台</span>
                <span aria-hidden="true">·</span>
                <span>{highScores.bestScore} 分</span>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleStartGame}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#E11D48] px-5 py-3 text-base font-bold text-white shadow-[0_4px_0_#9F1239] transition-all duration-150 hover:bg-[#BE123C] active:translate-y-0.5 active:shadow-[0_2px_0_#9F1239] whitespace-nowrap"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>再玩一次</span>
                </button>

                <button
                  type="button"
                  onClick={handleReturnTitle}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl px-5 py-2 text-sm font-medium text-[#7A4B59] transition-colors duration-150 hover:text-[#3D252B] whitespace-nowrap"
                >
                  回到主畫面
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
