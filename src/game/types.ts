export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type PowerUpType = 'autoAlign' | 'widen' | 'shield';

export interface PowerUpCounts {
  autoAlign: number;
  widen: number;
  shield: number;
}

export type KartGearStyle =
  | 'goggles'
  | 'helmet'
  | 'visor'
  | 'bandana'
  | 'crown'
  | 'cap'
  | 'turbo';

export interface CakeFlavor {
  id: string;
  nameZh: string;
  stampText: string; // Racing number
  spongeTop: string; // Kart nose / upper paint
  spongeBody: string; // Kart chassis paint
  spongeShade: string; // Kart underbody / spoiler shadow
  creamColor: string; // Racing stripe / decal bg
  glazeColor: string; // Goggles / visor tint
  dripHighlight: string; // Specular body highlight
  accentColor: string; // Rim & helmet accent
  garnish: KartGearStyle;
}

export interface StackedTier {
  id: number;
  x: number;
  topY: number;
  width: number;
  height: number;
  flavor: CakeFlavor;
  isPerfect: boolean;
  wasRestored: boolean;
  squashTime: number;
  cutLeft: boolean;
  cutRight: boolean;
}

export interface FallingDebris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  angle: number;
  angularVel: number;
  flavor: CakeFlavor;
  side: 'left' | 'right' | 'full';
  alpha: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
  shape: 'circle' | 'star' | 'crumb';
  rotation: number;
  rotSpeed: number;
}

export interface FloatingCallout {
  x: number;
  y: number;
  text: string;
  subtext?: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface GameSnapshot {
  state: GameState;
  score: number;
  height: number;
  combo: number;
  maxCombo: number;
  widthPercent: number;
  canWiden: boolean;
  isDropping: boolean;
  currentFlavorName: string;
  isNewRecord: boolean;
  powerUps: PowerUpCounts;
  shieldActive: boolean;
}

export interface HighScoreData {
  bestScore: number;
  bestHeight: number;
  bestCombo: number;
}
