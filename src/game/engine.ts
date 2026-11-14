import { GameAudio } from './audio';
import { getFlavorForTier } from './flavors';
import {
  BASE_CAKE_WIDTH,
  CAKE_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAX_CAKE_WIDTH,
  WORLD_GROUND_Y,
  drawAtmosphere,
  drawAutoAlignBeam,
  drawCakeTier,
  drawCallouts,
  drawDebris,
  drawGround,
  drawParticles,
  drawPendulum,
  drawShieldAura,
} from './renderer';
import type {
  CakeFlavor,
  FallingDebris,
  FloatingCallout,
  GameSnapshot,
  GameState,
  HighScoreData,
  Particle,
  PowerUpCounts,
  PowerUpType,
  StackedTier,
} from './types';

const HIGH_SCORE_STORAGE_KEY = 'piggy_kart_stack_records_v1';

const PENDULUM_ANCHOR_X = LOGICAL_WIDTH / 2;
const PENDULUM_ANCHOR_Y = 58;
const ROPE_LENGTH = 114;
const GRAVITY = 3100;
const INITIAL_DROP_VY = 150;
const PERFECT_TOLERANCE = 6.5;
const MIN_OVERLAP_PX = 3.0;
const RESTORE_COMBO_STEP = 5;
const WIDTH_RESTORE_AMOUNT = 16;
const WIDEN_ITEM_AMOUNT = 42;

interface ActiveDropCake {
  x: number;
  topY: number;
  vy: number;
  width: number;
  angle: number;
  flavor: CakeFlavor;
  checkedLanding: boolean;
  autoAlignTargetX: number | null;
}

export class CakeStackEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audio: GameAudio;
  private onSnapshot: (snapshot: GameSnapshot, highScores: HighScoreData) => void;

  private rafId: number | null = null;
  private lastFrameMs: number = 0;
  private elapsedTime: number = 0;
  private hitstopRemaining: number = 0;

  private state: GameState = 'TITLE_MENU';
  private tiers: StackedTier[] = [];
  private debris: FallingDebris[] = [];
  private particles: Particle[] = [];
  private callouts: FloatingCallout[] = [];

  private score: number = 0;
  private combo: number = 0;
  private maxCombo: number = 0;
  private currentWidth: number = BASE_CAKE_WIDTH;
  private currentFlavor: CakeFlavor = getFlavorForTier(0);
  private isNewRecord: boolean = false;

  // Power-ups & Shield
  private powerUps: PowerUpCounts = { autoAlign: 2, widen: 2, shield: 2 };
  private shieldActive: boolean = false;

  // Pendulum state
  private pendulumPhase: number = 0;
  private pendulumTheta: number = 0;
  private pendingCake: ActiveDropCake | null = null;
  private respawnDelay: number = 0;

  // Camera & shake
  private cameraY: number = 0;
  private targetCameraY: number = 0;
  private shakeTimer: number = 0;
  private shakeIntensity: number = 0;

  // High scores
  private highScores: HighScoreData = { bestScore: 0, bestHeight: 0, bestCombo: 0 };

  constructor(
    canvas: HTMLCanvasElement,
    audio: GameAudio,
    onSnapshot: (snapshot: GameSnapshot, highScores: HighScoreData) => void
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context unavailable');
    }
    this.ctx = context;
    this.audio = audio;
    this.onSnapshot = onSnapshot;

    this.highScores = this.loadHighScores();
    this.setupTitleShowcase();
    this.resize();
  }

  public getHighScores(): HighScoreData {
    return { ...this.highScores };
  }

  private loadHighScores(): HighScoreData {
    try {
      const raw = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
      if (!raw) return { bestScore: 0, bestHeight: 0, bestCombo: 0 };
      const parsed = JSON.parse(raw) as Partial<HighScoreData>;
      return {
        bestScore: Number(parsed.bestScore) || 0,
        bestHeight: Number(parsed.bestHeight) || 0,
        bestCombo: Number(parsed.bestCombo) || 0,
      };
    } catch {
      return { bestScore: 0, bestHeight: 0, bestCombo: 0 };
    }
  }

  private saveHighScores(): boolean {
    let recordBroken = false;
    const next: HighScoreData = { ...this.highScores };

    if (this.score > next.bestScore) {
      next.bestScore = this.score;
      recordBroken = true;
    }
    if (this.tiers.length > next.bestHeight) {
      next.bestHeight = this.tiers.length;
      recordBroken = true;
    }
    if (this.maxCombo > next.bestCombo) {
      next.bestCombo = this.maxCombo;
    }

    this.highScores = next;
    try {
      localStorage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
    return recordBroken;
  }

  public resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const cssWidth = rect?.width || LOGICAL_WIDTH;
    const cssHeight = rect?.height || LOGICAL_HEIGHT;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  }

  public startLoop(): void {
    if (this.rafId !== null) return;
    this.lastFrameMs = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastFrameMs) / 1000;
      this.lastFrameMs = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);

      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.audio.stopBgm();
  }

  private setupTitleShowcase(): void {
    this.state = 'TITLE_MENU';
    this.tiers = [
      {
        id: 1,
        x: LOGICAL_WIDTH / 2,
        topY: WORLD_GROUND_Y - CAKE_HEIGHT,
        width: BASE_CAKE_WIDTH,
        height: CAKE_HEIGHT,
        flavor: getFlavorForTier(0),
        isPerfect: false,
        wasRestored: false,
        squashTime: 1,
        cutLeft: false,
        cutRight: false,
      },
      {
        id: 2,
        x: LOGICAL_WIDTH / 2 - 4,
        topY: WORLD_GROUND_Y - CAKE_HEIGHT * 2,
        width: BASE_CAKE_WIDTH - 10,
        height: CAKE_HEIGHT,
        flavor: getFlavorForTier(2),
        isPerfect: false,
        wasRestored: false,
        squashTime: 1,
        cutLeft: false,
        cutRight: false,
      },
      {
        id: 3,
        x: LOGICAL_WIDTH / 2 + 2,
        topY: WORLD_GROUND_Y - CAKE_HEIGHT * 3,
        width: BASE_CAKE_WIDTH - 22,
        height: CAKE_HEIGHT,
        flavor: getFlavorForTier(4),
        isPerfect: true,
        wasRestored: false,
        squashTime: 1,
        cutLeft: false,
        cutRight: false,
      },
    ];
    this.debris = [];
    this.particles = [];
    this.callouts = [];
    this.pendingCake = null;
    this.cameraY = 0;
    this.targetCameraY = 0;
    this.currentWidth = BASE_CAKE_WIDTH - 22;
    this.currentFlavor = getFlavorForTier(6);
    this.pendulumPhase = 0;
    this.shieldActive = false;
    this.powerUps = { autoAlign: 2, widen: 2, shield: 2 };
    this.emitSnapshot();
  }

  public startNewGame(): void {
    this.audio.unlock();
    this.audio.playClick();
    this.audio.startBgm();

    this.state = 'PLAYING';
    this.tiers = [];
    this.debris = [];
    this.particles = [];
    this.callouts = [];
    this.pendingCake = null;
    this.respawnDelay = 0;

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.currentWidth = BASE_CAKE_WIDTH;
    this.currentFlavor = getFlavorForTier(0);
    this.isNewRecord = false;
    this.powerUps = { autoAlign: 2, widen: 2, shield: 2 };
    this.shieldActive = false;

    this.cameraY = 0;
    this.targetCameraY = 0;
    this.shakeTimer = 0;
    this.shakeIntensity = 0;
    this.hitstopRemaining = 0;
    this.pendulumPhase = -Math.PI / 4;
    this.pendulumTheta = 0;

    this.emitSnapshot();
  }

  public returnToTitle(): void {
    this.audio.playClick();
    this.audio.stopBgm();
    this.setupTitleShowcase();
  }

  public pause(): void {
    if (this.state !== 'PLAYING') return;
    this.state = 'PAUSED';
    this.audio.pauseBgm();
    this.emitSnapshot();
  }

  public resume(): void {
    if (this.state !== 'PAUSED') return;
    this.audio.unlock();
    this.audio.playClick();
    this.audio.startBgm();
    this.state = 'PLAYING';
    this.lastFrameMs = performance.now();
    this.emitSnapshot();
  }

  public togglePause(): void {
    if (this.state === 'PLAYING') {
      this.pause();
    } else if (this.state === 'PAUSED') {
      this.resume();
    }
  }

  public dropCake(): void {
    if (this.state !== 'PLAYING') return;
    if (this.pendingCake !== null || this.respawnDelay > 0) return;

    this.audio.unlock();
    this.audio.playRelease();

    const hookPos = this.getHookScreenPos(this.pendulumTheta);
    const cakeScreenTopY = hookPos.y + 9;

    this.pendingCake = {
      x: hookPos.x,
      topY: cakeScreenTopY - this.cameraY,
      vy: INITIAL_DROP_VY,
      width: this.currentWidth,
      angle: -this.pendulumTheta * 0.35,
      flavor: this.currentFlavor,
      checkedLanding: false,
      autoAlignTargetX: null,
    };
    this.emitSnapshot();
  }

  public usePowerUp(type: PowerUpType): void {
    if (this.state !== 'PLAYING') return;

    this.audio.unlock();

    if (type === 'autoAlign') {
      if (this.powerUps.autoAlign <= 0 || this.pendingCake !== null || this.respawnDelay > 0) {
        return;
      }
      this.powerUps.autoAlign -= 1;
      this.audio.playPowerUp();

      const targetX =
        this.tiers.length === 0 ? LOGICAL_WIDTH / 2 : this.tiers[this.tiers.length - 1].x;
      const hookPos = this.getHookScreenPos(this.pendulumTheta);
      const cakeScreenTopY = hookPos.y + 9;

      this.pendingCake = {
        x: hookPos.x,
        topY: cakeScreenTopY - this.cameraY,
        vy: INITIAL_DROP_VY * 1.15,
        width: this.currentWidth,
        angle: -this.pendulumTheta * 0.35,
        flavor: this.currentFlavor,
        checkedLanding: false,
        autoAlignTargetX: targetX,
      };
      this.spawnCallout(hookPos.x, cakeScreenTopY - this.cameraY - 10, '自動對齊！', undefined, '#E11D48');
      this.emitSnapshot();
      return;
    }

    if (type === 'widen') {
      if (this.powerUps.widen <= 0 || this.currentWidth >= MAX_CAKE_WIDTH) {
        return;
      }
      this.powerUps.widen -= 1;
      this.audio.playPowerUp();

      const nextWidth = Math.min(MAX_CAKE_WIDTH, this.currentWidth + WIDEN_ITEM_AMOUNT);
      this.currentWidth = nextWidth;

      if (this.pendingCake && !this.pendingCake.checkedLanding) {
        this.pendingCake.width = nextWidth;
      }

      if (this.tiers.length > 0) {
        const topTier = this.tiers[this.tiers.length - 1];
        topTier.width = Math.min(MAX_CAKE_WIDTH, topTier.width + WIDEN_ITEM_AMOUNT);
        topTier.x = Math.max(
          topTier.width / 2 + 12,
          Math.min(LOGICAL_WIDTH - topTier.width / 2 - 12, topTier.x)
        );
        topTier.cutLeft = false;
        topTier.cutRight = false;
        topTier.squashTime = 0;

        this.spawnLandingParticles(topTier.x, topTier.topY, topTier.flavor, true);
        this.spawnCallout(topTier.x, topTier.topY - 14, '寬度增加！', undefined, '#E11D48');
      } else {
        this.spawnCallout(LOGICAL_WIDTH / 2, WORLD_GROUND_Y - 60, '寬度增加！', undefined, '#E11D48');
      }

      this.emitSnapshot();
      return;
    }

    if (type === 'shield') {
      if (this.powerUps.shield <= 0 || this.shieldActive) {
        return;
      }
      this.powerUps.shield -= 1;
      this.shieldActive = true;
      this.audio.playPowerUp();

      const anchorX =
        this.tiers.length > 0 ? this.tiers[this.tiers.length - 1].x : LOGICAL_WIDTH / 2;
      const anchorY =
        this.tiers.length > 0 ? this.tiers[this.tiers.length - 1].topY : WORLD_GROUND_Y;

      this.spawnShieldParticles(anchorX, anchorY);
      this.spawnCallout(anchorX, anchorY - 18, '防護盾啟動！', '防止失誤墜落', '#047857');
      this.emitSnapshot();
    }
  }

  private getPendulumParams(): { omega: number; maxAngle: number } {
    const height = this.tiers.length;
    const omega = 2.2 + 1.95 * (1 - Math.exp(-height / 24));
    const maxAngle = 0.62 + 0.24 * (1 - Math.exp(-height / 18));
    return { omega, maxAngle };
  }

  private getHookScreenPos(theta: number): { x: number; y: number } {
    return {
      x: PENDULUM_ANCHOR_X + Math.sin(theta) * ROPE_LENGTH,
      y: PENDULUM_ANCHOR_Y + Math.cos(theta) * ROPE_LENGTH,
    };
  }

  private update(dt: number): void {
    if (this.state === 'PAUSED') return;

    this.elapsedTime += dt;

    if (this.hitstopRemaining > 0) {
      this.hitstopRemaining = Math.max(0, this.hitstopRemaining - dt);
      return;
    }

    if (this.state === 'TITLE_MENU') {
      this.pendulumPhase += dt * 1.65;
      this.pendulumTheta = 0.42 * Math.sin(this.pendulumPhase);
    } else if (this.state === 'PLAYING') {
      const { omega, maxAngle } = this.getPendulumParams();
      this.pendulumPhase += dt * omega;
      this.pendulumTheta = maxAngle * Math.sin(this.pendulumPhase);

      if (this.respawnDelay > 0) {
        this.respawnDelay = Math.max(0, this.respawnDelay - dt);
      }
    }

    if (this.pendingCake) {
      const cake = this.pendingCake;
      cake.vy += GRAVITY * dt;
      cake.topY += cake.vy * dt;
      cake.angle *= Math.exp(-14 * dt);

      if (cake.autoAlignTargetX !== null && !cake.checkedLanding) {
        cake.x += (cake.autoAlignTargetX - cake.x) * Math.min(1, dt * 18);
      }

      const targetSurfaceY =
        this.tiers.length === 0 ? WORLD_GROUND_Y : this.tiers[this.tiers.length - 1].topY;
      const cakeBottomY = cake.topY + CAKE_HEIGHT;

      if (!cake.checkedLanding && cakeBottomY >= targetSurfaceY) {
        cake.checkedLanding = true;
        if (cake.autoAlignTargetX !== null) {
          cake.x = cake.autoAlignTargetX;
        }
        this.resolveCakeLanding(cake, targetSurfaceY);
      } else if (cake.checkedLanding && cake.topY + this.cameraY > LOGICAL_HEIGHT + 90) {
        this.pendingCake = null;
        this.finishGame();
      }
    }

    for (const tier of this.tiers) {
      if (tier.squashTime < 1) {
        tier.squashTime = Math.min(1, tier.squashTime + dt * 3.8);
      }
    }

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vy += GRAVITY * 0.85 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.angle += d.angularVel * dt;
      if (d.y + this.cameraY > LOGICAL_HEIGHT + 120) {
        this.debris.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotSpeed * dt;
    }

    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.life += dt;
      if (c.life >= c.maxLife) {
        this.callouts.splice(i, 1);
      }
    }

    this.cameraY += (this.targetCameraY - this.cameraY) * Math.min(1, dt * 6.5);

    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }
  }

  private resolveCakeLanding(cake: ActiveDropCake, surfaceY: number): void {
    // Tier 1 establishes the foundation on the wide velvet bullion tray
    if (this.tiers.length === 0) {
      const plateHalfSpan = 132;
      const clampedX = Math.max(
        LOGICAL_WIDTH / 2 - plateHalfSpan + cake.width / 2,
        Math.min(LOGICAL_WIDTH / 2 + plateHalfSpan - cake.width / 2, cake.x)
      );

      const newTier: StackedTier = {
        id: 1,
        x: clampedX,
        topY: surfaceY - CAKE_HEIGHT,
        width: cake.width,
        height: CAKE_HEIGHT,
        flavor: cake.flavor,
        isPerfect: cake.autoAlignTargetX !== null,
        wasRestored: false,
        squashTime: 0,
        cutLeft: false,
        cutRight: false,
      };
      this.tiers.push(newTier);
      this.score += 1;
      this.audio.playLand(0, cake.autoAlignTargetX !== null);
      this.hitstopRemaining = 0.025;
      this.triggerShake(0.14, 2.5);
      this.spawnLandingParticles(clampedX, surfaceY, cake.flavor, cake.autoAlignTargetX !== null);

      this.pendingCake = null;
      this.prepareNextCake();
      this.emitSnapshot();
      return;
    }

    const prevTop = this.tiers[this.tiers.length - 1];
    const deltaX = cake.x - prevTop.x;
    const absDelta = Math.abs(deltaX);

    const dropLeft = cake.x - cake.width / 2;
    const dropRight = cake.x + cake.width / 2;
    const topLeft = prevTop.x - prevTop.width / 2;
    const topRight = prevTop.x + prevTop.width / 2;

    const overlapLeft = Math.max(dropLeft, topLeft);
    const overlapRight = Math.min(dropRight, topRight);
    const overlapWidth = overlapRight - overlapLeft;

    // Complete miss check
    if (overlapWidth < MIN_OVERLAP_PX) {
      // Shield rescues the player and safely locks the bar onto the stack!
      if (this.shieldActive) {
        this.shieldActive = false;
        this.combo = 0;
        this.score += 1;

        const rescuedTier: StackedTier = {
          id: this.tiers.length + 1,
          x: prevTop.x,
          topY: surfaceY - CAKE_HEIGHT,
          width: prevTop.width,
          height: CAKE_HEIGHT,
          flavor: cake.flavor,
          isPerfect: false,
          wasRestored: false,
          squashTime: 0,
          cutLeft: prevTop.cutLeft,
          cutRight: prevTop.cutRight,
        };
        this.tiers.push(rescuedTier);
        this.currentWidth = prevTop.width;

        this.audio.playShieldSave();
        this.hitstopRemaining = 0.045;
        this.triggerShake(0.22, 5.5);
        this.spawnShieldParticles(prevTop.x, rescuedTier.topY);
        this.spawnCallout(prevTop.x, rescuedTier.topY - 14, '護盾救援成功！', '寬度完整保留', '#047857');

        this.maybeAwardMilestonePowerUp(rescuedTier.x, rescuedTier.topY);
        this.pendingCake = null;
        this.updateCameraTarget();
        this.prepareNextCake();
        this.emitSnapshot();
        return;
      }

      // No shield -> bar falls off screen & game over
      this.combo = 0;
      this.audio.playMiss();
      this.triggerShake(0.26, 8);
      this.debris.push({
        x: cake.x,
        y: surfaceY - CAKE_HEIGHT / 2,
        vx: deltaX >= 0 ? 75 : -75,
        vy: -30,
        width: cake.width,
        height: CAKE_HEIGHT,
        angle: cake.angle,
        angularVel: deltaX >= 0 ? 3.4 : -3.4,
        flavor: cake.flavor,
        side: 'full',
        alpha: 1,
      });
      this.spawnCallout(cake.x, surfaceY - 24, 'MISS!', undefined, '#D9435E');
      cake.topY = surfaceY - CAKE_HEIGHT;
      cake.vy = 260;
      this.emitSnapshot();
      return;
    }

    // Check Perfect alignment
    if (absDelta <= PERFECT_TOLERANCE) {
      this.combo += 1;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }

      let finalWidth = Math.max(prevTop.width, this.currentWidth);
      finalWidth = Math.min(finalWidth, prevTop.width); // Snap cleanly to top width unless restored
      let restored = false;

      if (this.combo % RESTORE_COMBO_STEP === 0 && finalWidth < BASE_CAKE_WIDTH) {
        finalWidth = Math.min(BASE_CAKE_WIDTH, finalWidth + WIDTH_RESTORE_AMOUNT);
        restored = true;
      }

      const bonus = Math.min(this.combo, 5);
      this.score += 1 + bonus;

      const newTier: StackedTier = {
        id: this.tiers.length + 1,
        x: prevTop.x,
        topY: surfaceY - CAKE_HEIGHT,
        width: finalWidth,
        height: CAKE_HEIGHT,
        flavor: cake.flavor,
        isPerfect: true,
        wasRestored: restored,
        squashTime: 0,
        cutLeft: prevTop.cutLeft && !restored,
        cutRight: prevTop.cutRight && !restored,
      };

      this.tiers.push(newTier);
      this.currentWidth = finalWidth;

      this.audio.playLand(this.combo, true);
      if (restored) {
        this.audio.playRestore();
        this.spawnCallout(
          prevTop.x,
          newTier.topY - 12,
          `PERFECT ×${this.combo}`,
          '賽車寬度恢復！',
          '#E11D48'
        );
      } else {
        this.spawnCallout(
          prevTop.x,
          newTier.topY - 12,
          this.combo > 1 ? `PERFECT ×${this.combo}` : 'PERFECT!',
          `+${1 + bonus}`,
          '#E11D48'
        );
      }

      this.hitstopRemaining = 0.04;
      this.triggerShake(0.16, 3.2);
      this.spawnLandingParticles(prevTop.x, surfaceY, cake.flavor, true);
      this.maybeAwardMilestonePowerUp(newTier.x, newTier.topY);
    } else {
      // Partial overlap -> keep overlapping core, slice off overhang
      this.combo = 0;
      this.score += 1;

      const keptCenterX = overlapLeft + overlapWidth / 2;
      const cutRightSide = deltaX > 0;

      const newTier: StackedTier = {
        id: this.tiers.length + 1,
        x: keptCenterX,
        topY: surfaceY - CAKE_HEIGHT,
        width: overlapWidth,
        height: CAKE_HEIGHT,
        flavor: cake.flavor,
        isPerfect: false,
        wasRestored: false,
        squashTime: 0,
        cutLeft: !cutRightSide || prevTop.cutLeft,
        cutRight: cutRightSide || prevTop.cutRight,
      };
      this.tiers.push(newTier);
      this.currentWidth = overlapWidth;

      const trimWidth = cake.width - overlapWidth;
      const trimCenterX = cutRightSide
        ? overlapRight + trimWidth / 2
        : overlapLeft - trimWidth / 2;
      const seamX = cutRightSide ? overlapRight : overlapLeft;

      this.debris.push({
        x: trimCenterX,
        y: surfaceY - CAKE_HEIGHT / 2,
        vx: cutRightSide ? 85 : -85,
        vy: -55,
        width: trimWidth,
        height: CAKE_HEIGHT,
        angle: 0,
        angularVel: cutRightSide ? 4.2 : -4.2,
        flavor: cake.flavor,
        side: cutRightSide ? 'right' : 'left',
        alpha: 1,
      });

      this.audio.playLand(0, false);
      this.audio.playSlice();
      this.hitstopRemaining = 0.032;
      this.triggerShake(0.18, 4.5);
      this.spawnSliceParticles(seamX, surfaceY - CAKE_HEIGHT / 2, cake.flavor, cutRightSide ? 1 : -1);
      this.maybeAwardMilestonePowerUp(newTier.x, newTier.topY);
    }

    this.pendingCake = null;
    this.updateCameraTarget();
    this.prepareNextCake();
    this.emitSnapshot();
  }

  private maybeAwardMilestonePowerUp(x: number, y: number): void {
    const height = this.tiers.length;
    if (height > 0 && height % 8 === 0) {
      const cycle = Math.floor(height / 8) % 3;
      if (cycle === 1) {
        this.powerUps.autoAlign += 1;
        this.spawnCallout(x, y - 38, '+1 自動對齊', `${height} 層補給`, '#E11D48');
      } else if (cycle === 2) {
        this.powerUps.widen += 1;
        this.spawnCallout(x, y - 38, '+1 增加寬度', `${height} 層補給`, '#E11D48');
      } else {
        this.powerUps.shield += 1;
        this.spawnCallout(x, y - 38, '+1 防護盾', `${height} 層補給`, '#047857');
      }
    }
  }

  private prepareNextCake(): void {
    this.currentFlavor = getFlavorForTier(this.tiers.length);
    this.respawnDelay = 0.14;
  }

  private updateCameraTarget(): void {
    if (this.tiers.length === 0) {
      this.targetCameraY = 0;
      return;
    }
    const topY = this.tiers[this.tiers.length - 1].topY;
    const desiredScreenTopY = 440;
    if (topY < desiredScreenTopY) {
      this.targetCameraY = desiredScreenTopY - topY;
    }
  }

  private finishGame(): void {
    this.state = 'GAME_OVER';
    this.audio.pauseBgm();
    this.isNewRecord = this.saveHighScores();
    this.emitSnapshot();
  }

  private triggerShake(duration: number, intensity: number): void {
    this.shakeTimer = Math.max(this.shakeTimer, duration);
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  private spawnLandingParticles(
    x: number,
    y: number,
    flavor: CakeFlavor,
    isPerfect: boolean
  ): void {
    const count = isPerfect ? 18 : 9;
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * this.currentWidth * 0.9;
      this.particles.push({
        x: x + spread,
        y: y - 4,
        vx: (Math.random() - 0.5) * (isPerfect ? 180 : 110),
        vy: -50 - Math.random() * (isPerfect ? 160 : 80),
        radius: isPerfect ? 3 + Math.random() * 3.5 : 2 + Math.random() * 2,
        color: isPerfect
          ? i % 2 === 0
            ? '#FBBF24'
            : '#FFFDF2'
          : i % 2 === 0
            ? flavor.dripHighlight
            : flavor.spongeBody,
        life: 0,
        maxLife: isPerfect ? 0.65 + Math.random() * 0.25 : 0.4 + Math.random() * 0.2,
        shape: isPerfect || i % 2 === 0 ? 'star' : 'circle',
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 6,
      });
    }
  }

  private spawnShieldParticles(x: number, y: number): void {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      this.particles.push({
        x: x + Math.cos(angle) * 28,
        y: y + Math.sin(angle) * 10,
        vx: Math.cos(angle) * 95,
        vy: Math.sin(angle) * 60 - 70,
        radius: 3 + Math.random() * 2.5,
        color: i % 2 === 0 ? '#10B981' : '#FDE047',
        life: 0,
        maxLife: 0.6 + Math.random() * 0.2,
        shape: i % 2 === 0 ? 'star' : 'circle',
        rotation: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 6,
      });
    }
  }

  private spawnSliceParticles(
    seamX: number,
    seamY: number,
    flavor: CakeFlavor,
    dir: number
  ): void {
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        x: seamX,
        y: seamY + (Math.random() - 0.5) * CAKE_HEIGHT * 0.7,
        vx: dir * (40 + Math.random() * 120) + (Math.random() - 0.5) * 40,
        vy: -80 - Math.random() * 120,
        radius: 2.2 + Math.random() * 2.5,
        color:
          i % 3 === 0 ? flavor.creamColor : i % 3 === 1 ? flavor.glazeColor : flavor.spongeBody,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.25,
        shape: 'crumb',
        rotation: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 10,
      });
    }
  }

  private spawnCallout(
    x: number,
    y: number,
    text: string,
    subtext: string | undefined,
    color: string
  ): void {
    const clampedX = Math.max(82, Math.min(LOGICAL_WIDTH - 82, x));
    this.callouts.push({
      x: clampedX,
      y,
      text,
      subtext,
      color,
      life: 0,
      maxLife: 0.95,
    });
  }

  private emitSnapshot(): void {
    this.onSnapshot(
      {
        state: this.state,
        score: this.score,
        height: this.tiers.length,
        combo: this.combo,
        maxCombo: this.maxCombo,
        widthPercent: Math.round((this.currentWidth / BASE_CAKE_WIDTH) * 100),
        canWiden: this.currentWidth < MAX_CAKE_WIDTH,
        isDropping: this.pendingCake !== null || this.respawnDelay > 0,
        currentFlavorName: this.currentFlavor.nameZh,
        isNewRecord: this.isNewRecord,
        powerUps: { ...this.powerUps },
        shieldActive: this.shieldActive,
      },
      { ...this.highScores }
    );
  }

  private render(): void {
    const ctx = this.ctx;
    const scaleX = this.canvas.width / LOGICAL_WIDTH;
    const scaleY = this.canvas.height / LOGICAL_HEIGHT;

    ctx.save();
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0) {
      const mag = this.shakeIntensity * (this.shakeTimer / 0.26);
      shakeX = (Math.random() - 0.5) * mag * 2;
      shakeY = (Math.random() - 0.5) * mag * 1.4;
      ctx.translate(shakeX, shakeY);
    }

    drawAtmosphere(ctx, this.cameraY, this.elapsedTime);
    drawGround(ctx, this.cameraY);

    for (const tier of this.tiers) {
      const screenTopY = tier.topY + this.cameraY;
      if (screenTopY > LOGICAL_HEIGHT + 50 || screenTopY + tier.height < -60) {
        continue;
      }
      drawCakeTier(ctx, tier.x, screenTopY, tier.width, tier.height, tier.flavor, {
        cutLeft: tier.cutLeft,
        cutRight: tier.cutRight,
        squashTime: tier.squashTime,
        isPerfect: tier.isPerfect,
        drawGarnish: true,
      });
    }

    // Draw protective shield aura above landing surface when armed
    if (this.shieldActive && (this.state === 'PLAYING' || this.state === 'PAUSED')) {
      const targetX =
        this.tiers.length > 0 ? this.tiers[this.tiers.length - 1].x : LOGICAL_WIDTH / 2;
      const targetWorldY =
        this.tiers.length > 0 ? this.tiers[this.tiers.length - 1].topY : WORLD_GROUND_Y;
      const targetW =
        this.tiers.length > 0 ? this.tiers[this.tiers.length - 1].width : this.currentWidth;
      drawShieldAura(ctx, targetX, targetWorldY + this.cameraY, targetW, this.elapsedTime);
    }

    if (this.pendingCake && !this.pendingCake.checkedLanding) {
      if (this.pendingCake.autoAlignTargetX !== null) {
        const targetScreenY =
          (this.tiers.length === 0 ? WORLD_GROUND_Y : this.tiers[this.tiers.length - 1].topY) +
          this.cameraY;
        drawAutoAlignBeam(
          ctx,
          this.pendingCake.x,
          this.pendingCake.topY + CAKE_HEIGHT + this.cameraY,
          this.pendingCake.autoAlignTargetX,
          targetScreenY
        );
      }

      drawCakeTier(
        ctx,
        this.pendingCake.x,
        this.pendingCake.topY + this.cameraY,
        this.pendingCake.width,
        CAKE_HEIGHT,
        this.pendingCake.flavor,
        {
          angle: this.pendingCake.angle,
          drawGarnish: true,
        }
      );
    }

    for (const d of this.debris) {
      drawDebris(ctx, d, this.cameraY);
    }

    const hookPos = this.getHookScreenPos(this.pendulumTheta);
    const isSwingingCakeVisible =
      this.state === 'TITLE_MENU' ||
      (this.state === 'PLAYING' && this.pendingCake === null && this.respawnDelay <= 0) ||
      (this.state === 'PAUSED' && this.pendingCake === null && this.respawnDelay <= 0);

    const shadowScreenY =
      this.state === 'PLAYING' && isSwingingCakeVisible
        ? (this.tiers.length === 0 ? WORLD_GROUND_Y : this.tiers[this.tiers.length - 1].topY) +
          this.cameraY
        : null;

    drawPendulum(
      ctx,
      PENDULUM_ANCHOR_X,
      PENDULUM_ANCHOR_Y,
      hookPos.x,
      hookPos.y,
      this.pendulumTheta,
      this.currentWidth,
      this.currentFlavor,
      isSwingingCakeVisible,
      shadowScreenY
    );

    drawParticles(ctx, this.particles, this.cameraY);
    drawCallouts(ctx, this.callouts, this.cameraY);

    ctx.restore();
  }
}
