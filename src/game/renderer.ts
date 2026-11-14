import type { CakeFlavor, FallingDebris, FloatingCallout, Particle } from './types';

export const LOGICAL_WIDTH = 390;
export const LOGICAL_HEIGHT = 720;
export const WORLD_GROUND_Y = 628;
export const CAKE_HEIGHT = 38;
export const BASE_CAKE_WIDTH = 168;
export const MAX_CAKE_WIDTH = 204;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpColor(hexA: string, hexB: string, t: number): string {
  const k = clamp01(t);
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const r = Math.round(lerp(r1, r2, k));
  const g = Math.round(lerp(g1, g2, k));
  const b = Math.round(lerp(b1, b2, k));
  return `rgb(${r}, ${g}, ${b})`;
}

export function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  cameraY: number,
  elapsedTime: number
): void {
  const alt = Math.max(0, cameraY);

  let topColor = '#E6F4FF';
  let bottomColor = '#FFF5EC';

  if (alt < 450) {
    const t = alt / 450;
    topColor = lerpColor('#E6F4FF', '#CAE6FF', t);
    bottomColor = lerpColor('#FFF5EC', '#FFF9F0', t);
  } else if (alt < 1150) {
    const t = (alt - 450) / 700;
    topColor = lerpColor('#CAE6FF', '#818CF8', t);
    bottomColor = lerpColor('#FFF9F0', '#FDBA74', t);
  } else {
    const t = clamp01((alt - 1150) / 700);
    topColor = lerpColor('#818CF8', '#1E1B4B', t);
    bottomColor = lerpColor('#FDBA74', '#4C1D95', t);
  }

  const skyGrad = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
  skyGrad.addColorStop(0, topColor);
  skyGrad.addColorStop(1, bottomColor);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  if (alt > 950) {
    const starAlpha = clamp01((alt - 950) / 500) * 0.9;
    ctx.save();
    for (let i = 0; i < 30; i++) {
      const sx = ((i * 97 + 31) % (LOGICAL_WIDTH - 24)) + 12;
      const sy = ((i * 151 + 43) % (LOGICAL_HEIGHT - 160)) + 40;
      const twinkle = 0.45 + 0.55 * Math.sin(elapsedTime * 2.4 + i * 1.3);
      ctx.fillStyle = `rgba(255, 248, 224, ${starAlpha * twinkle})`;
      const r = i % 4 === 0 ? 2.1 : 1.3;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (alt < 550) {
    const beamAlpha = (1 - alt / 550) * 0.24;
    ctx.save();
    ctx.fillStyle = `rgba(255, 252, 236, ${beamAlpha})`;
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(175, 0);
    ctx.lineTo(310, LOGICAL_HEIGHT);
    ctx.lineTo(90, LOGICAL_HEIGHT);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (alt > 60) {
    const cloudVisibility = clamp01((alt - 60) / 220) * (1 - clamp01((alt - 1350) / 500) * 0.65);
    if (cloudVisibility > 0.02) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${0.62 * cloudVisibility})`;
      for (let i = 0; i < 5; i++) {
        const worldCloudY = 250 - i * 230;
        const screenY = ((worldCloudY + cameraY * 0.45) % (LOGICAL_HEIGHT + 180)) - 90;
        const drift = Math.sin(elapsedTime * 0.25 + i * 2) * 14;
        const cx = (i % 2 === 0 ? 78 : 308) + drift;
        drawCloud(ctx, cx, screenY, 1 + (i % 3) * 0.16);
      }
      ctx.restore();
    }
  }

  ctx.save();
  ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'right';
  const markColor = alt > 1250 ? 'rgba(255, 240, 245, 0.4)' : 'rgba(100, 74, 88, 0.28)';
  ctx.fillStyle = markColor;
  ctx.strokeStyle = markColor;
  ctx.lineWidth = 1;

  for (let tier = 5; tier <= 150; tier += 5) {
    const worldY = WORLD_GROUND_Y - tier * CAKE_HEIGHT;
    const screenY = worldY + cameraY;
    if (screenY > 65 && screenY < LOGICAL_HEIGHT - 80) {
      ctx.beginPath();
      ctx.moveTo(LOGICAL_WIDTH - 24, screenY);
      ctx.lineTo(LOGICAL_WIDTH - 8, screenY);
      ctx.stroke();
      ctx.fillText(`${tier}F`, LOGICAL_WIDTH - 28, screenY + 3.5);
    }
  }
  ctx.restore();
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.arc(-20, 6, 16, 0, Math.PI * 2);
  ctx.arc(22, 6, 17, 0, Math.PI * 2);
  ctx.arc(0, 8, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawGround(ctx: CanvasRenderingContext2D, cameraY: number): void {
  const groundScreenY = WORLD_GROUND_Y + cameraY;
  if (groundScreenY > LOGICAL_HEIGHT + 40) return;

  // Racetrack asphalt surface
  const roadGrad = ctx.createLinearGradient(0, groundScreenY, 0, LOGICAL_HEIGHT + 60);
  roadGrad.addColorStop(0, '#4A515E');
  roadGrad.addColorStop(0.18, '#3B414C');
  roadGrad.addColorStop(1, '#262A32');
  ctx.fillStyle = roadGrad;
  ctx.fillRect(0, groundScreenY, LOGICAL_WIDTH, LOGICAL_HEIGHT - groundScreenY + 80);

  // Red & white racetrack rumble curb strip along top edge
  const curbSegment = 24;
  for (let cx = 0; cx < LOGICAL_WIDTH; cx += curbSegment) {
    ctx.fillStyle = Math.floor(cx / curbSegment) % 2 === 0 ? '#EF4444' : '#FFFDF9';
    ctx.fillRect(cx, groundScreenY, curbSegment, 5);
  }

  // Dashed track center markings
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (let lx = 16; lx < LOGICAL_WIDTH; lx += 44) {
    ctx.fillRect(lx, groundScreenY + 36, 24, 3.5);
  }

  // Checkered starting grid pad centered at ground level
  const padWidth = 286;
  const padX = LOGICAL_WIDTH / 2 - padWidth / 2;
  const padY = groundScreenY - 7;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
  ctx.beginPath();
  ctx.ellipse(LOGICAL_WIDTH / 2, groundScreenY + 5, padWidth * 0.49, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F8FAFC';
  ctx.beginPath();
  ctx.roundRect(padX, padY, padWidth, 9, [4, 4, 1, 1]);
  ctx.fill();

  // Checkered racing flags pattern along the starting pad
  const checkSize = 8;
  const checkCount = Math.floor((padWidth - 16) / checkSize);
  const checkStart = padX + (padWidth - checkCount * checkSize) / 2;
  for (let i = 0; i < checkCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#1E293B' : '#FFFFFF';
    ctx.fillRect(checkStart + i * checkSize, padY + 2, checkSize, 3);
    ctx.fillStyle = i % 2 === 0 ? '#FFFFFF' : '#1E293B';
    ctx.fillRect(checkStart + i * checkSize, padY + 5, checkSize, 3);
  }
}

function drawRacingWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rimAccent: string
): void {
  // Chunky racing slick tire
  ctx.fillStyle = '#181B20';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#3B4252';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();

  // Colored racing rim
  ctx.fillStyle = '#F1F5F9';
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.56, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = rimAccent;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCakeTier(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  width: number,
  height: number,
  flavor: CakeFlavor,
  options: {
    cutLeft?: boolean;
    cutRight?: boolean;
    squashTime?: number;
    isPerfect?: boolean;
    drawGarnish?: boolean;
    angle?: number;
  } = {}
): void {
  if (width <= 0.5) return;

  const {
    cutLeft = false,
    cutRight = false,
    squashTime = 0,
    isPerfect = false,
    drawGarnish = true,
    angle = 0,
  } = options;

  let scaleX = 1;
  let scaleY = 1;
  if (squashTime > 0 && squashTime < 1) {
    const decay = Math.exp(-squashTime * 6.5);
    const wave = Math.sin(squashTime * Math.PI * 2.5);
    scaleY = 1 - 0.12 * decay * wave;
    scaleX = 1 + 0.07 * decay * wave;
  }

  ctx.save();
  const bottomY = topY + height;
  ctx.translate(centerX, bottomY);
  if (angle !== 0) {
    ctx.translate(0, -height / 2);
    ctx.rotate(angle);
    ctx.translate(0, height / 2);
  }
  ctx.scale(scaleX, scaleY);

  const left = -width / 2;
  const top = -height;
  const kartTop = top + 18;
  const kartBottom = -4.5;
  const kartH = kartBottom - kartTop;
  const rLeft = cutLeft ? 0 : Math.min(5, width * 0.2);
  const rRight = cutRight ? 0 : Math.min(7, width * 0.25);

  // Perfect golden aura flash
  if (isPerfect && squashTime > 0 && squashTime < 0.85) {
    const glowAlpha = (1 - squashTime / 0.85) * 0.48;
    ctx.fillStyle = `rgba(250, 204, 21, ${glowAlpha})`;
    ctx.beginPath();
    ctx.roundRect(left - 5, top - 3, width + 10, height + 6, 8);
    ctx.fill();
  }

  // Rear racing spoiler wing on left (if uncut & wide enough)
  if (!cutLeft && width >= 48) {
    ctx.fillStyle = flavor.spongeShade;
    ctx.fillRect(left + 3, kartTop - 6, 2.5, 6.5);
    ctx.beginPath();
    ctx.roundRect(left - 1, kartTop - 8, 10, 3.2, 1.2);
    ctx.fill();
  }

  // Adorable Pink Piggy Racer Driver sitting in the open cockpit!
  if (width >= 38) {
    const pigCenterY = kartTop - 5.5;
    const headW = Math.min(24, width * 0.34);
    const headH = 17;

    // Pink piggy ears poking up
    ctx.fillStyle = '#FF94B7';
    ctx.strokeStyle = '#6B2D40';
    ctx.lineWidth = 1;
    // Left ear
    ctx.beginPath();
    ctx.moveTo(-headW * 0.42, pigCenterY - headH * 0.32);
    ctx.lineTo(-headW * 0.32, pigCenterY - headH * 0.85);
    ctx.lineTo(-headW * 0.12, pigCenterY - headH * 0.44);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Right ear
    ctx.beginPath();
    ctx.moveTo(headW * 0.42, pigCenterY - headH * 0.32);
    ctx.lineTo(headW * 0.32, pigCenterY - headH * 0.85);
    ctx.lineTo(headW * 0.12, pigCenterY - headH * 0.44);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Chubby pink piggy head
    ctx.fillStyle = '#FFA7C4';
    ctx.beginPath();
    ctx.ellipse(0, pigCenterY, headW / 2, headH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6B2D40';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // Racing gear on piggy's head (goggles / helmet / crown / cap)
    if (flavor.garnish === 'crown') {
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.moveTo(-6, pigCenterY - headH * 0.42);
      ctx.lineTo(-7, pigCenterY - headH * 0.82);
      ctx.lineTo(-2.5, pigCenterY - headH * 0.56);
      ctx.lineTo(0, pigCenterY - headH * 0.88);
      ctx.lineTo(2.5, pigCenterY - headH * 0.56);
      ctx.lineTo(7, pigCenterY - headH * 0.82);
      ctx.lineTo(6, pigCenterY - headH * 0.42);
      ctx.closePath();
      ctx.fill();
    } else {
      // Sleek racing goggles strap & tinted lenses on forehead
      ctx.fillStyle = '#334155';
      ctx.fillRect(-headW * 0.46, pigCenterY - 5.2, headW * 0.92, 2.2);
      ctx.fillStyle = flavor.glazeColor;
      ctx.beginPath();
      ctx.roundRect(-6.5, pigCenterY - 6.6, 5.5, 4.2, 1.5);
      ctx.roundRect(1, pigCenterY - 6.6, 5.5, 4.2, 1.5);
      ctx.fill();
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Piggy eyes + rosy cheeks + snout facing slightly forward (right)
    ctx.fillStyle = '#3D252B';
    ctx.beginPath();
    ctx.arc(-3.2, pigCenterY - 0.6, 1.4, 0, Math.PI * 2);
    ctx.arc(4.2, pigCenterY - 0.6, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // Oval pink snout
    ctx.fillStyle = '#F46E97';
    ctx.beginPath();
    ctx.ellipse(2.2, pigCenterY + 2.6, 4.6, 3.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6B2D40';
    ctx.beginPath();
    ctx.arc(0.8, pigCenterY + 2.6, 0.85, 0, Math.PI * 2);
    ctx.arc(3.6, pigCenterY + 2.6, 0.85, 0, Math.PI * 2);
    ctx.fill();

    // Tiny steering wheel & pink hooves in front of piggy
    if (width >= 56) {
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(11, kartTop + 1);
      ctx.lineTo(14.5, kartTop - 4.5);
      ctx.stroke();

      ctx.fillStyle = '#FFA7C4';
      ctx.beginPath();
      ctx.arc(11.5, kartTop - 1.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Main racing kart chassis
  const bodyGrad = ctx.createLinearGradient(0, kartTop, 0, kartBottom);
  bodyGrad.addColorStop(0, flavor.dripHighlight);
  bodyGrad.addColorStop(0.25, flavor.spongeBody);
  bodyGrad.addColorStop(0.82, flavor.spongeBody);
  bodyGrad.addColorStop(1, flavor.spongeShade);

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(left, kartTop, width, kartH, [rLeft, rRight, cutRight ? 0 : 3, cutLeft ? 0 : 3]);
  ctx.fill();

  // Clip kart body details
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, kartTop, width, kartH, [rLeft, rRight, cutRight ? 0 : 3, cutLeft ? 0 : 3]);
  ctx.clip();

  // Racing stripe across lower flank
  ctx.fillStyle = flavor.creamColor;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(left, kartTop + kartH * 0.56, width, 2.5);
  ctx.globalAlpha = 1;

  // Front nose racing decal number badge
  if (drawGarnish && width >= 66) {
    ctx.fillStyle = '#FFFDF9';
    ctx.beginPath();
    ctx.roundRect(-11, kartTop + 2.5, 22, 10.5, 2.5);
    ctx.fill();
    ctx.font = '700 8px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1E293B';
    ctx.fillText(flavor.stampText, 0, kartTop + 8);
  }

  // Front headlight on right & exhaust/taillight on left if uncut
  if (!cutRight && width >= 26) {
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(left + width - 4.5, kartTop + 3.5, 4.5, 4.5);
  }
  if (!cutLeft && width >= 26) {
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(left, kartBottom - 5, 4.5, 3);
  }

  // Crisp sheared cut edge when trimmed
  if (cutLeft) {
    ctx.fillStyle = 'rgba(255, 245, 248, 0.82)';
    ctx.fillRect(left, kartTop, 2.5, kartH);
  }
  if (cutRight) {
    ctx.fillStyle = 'rgba(226, 232, 240, 0.78)';
    ctx.fillRect(left + width - 2.5, kartTop, 2.5, kartH);
  }

  ctx.restore();

  // Chassis outline
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.36)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.roundRect(left, kartTop, width, kartH, [rLeft, rRight, cutRight ? 0 : 3, cutLeft ? 0 : 3]);
  ctx.stroke();

  // Racing slick wheels along bottom edge
  const wheelY = -6;
  const wheelR = 6.2;
  if (width >= 64) {
    const axleOffset = Math.min(width * 0.3, width / 2 - 11);
    drawRacingWheel(ctx, -axleOffset, wheelY, wheelR, flavor.accentColor);
    drawRacingWheel(ctx, axleOffset, wheelY, wheelR, flavor.accentColor);
  } else if (width >= 26) {
    drawRacingWheel(ctx, 0, wheelY, Math.min(wheelR, width * 0.22), flavor.accentColor);
  }

  ctx.restore();
}

export function drawShieldAura(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  surfaceScreenY: number,
  width: number,
  elapsedTime: number
): void {
  const pulse = 0.72 + 0.28 * Math.sin(elapsedTime * 4.2);
  const shieldHalfW = Math.max(width * 0.62, 52);

  ctx.save();
  const grad = ctx.createLinearGradient(
    centerX - shieldHalfW,
    surfaceScreenY,
    centerX + shieldHalfW,
    surfaceScreenY
  );
  grad.addColorStop(0, 'rgba(16, 185, 129, 0)');
  grad.addColorStop(0.25, `rgba(52, 211, 153, ${0.42 * pulse})`);
  grad.addColorStop(0.5, `rgba(250, 204, 21, ${0.65 * pulse})`);
  grad.addColorStop(0.75, `rgba(52, 211, 153, ${0.42 * pulse})`);
  grad.addColorStop(1, 'rgba(16, 185, 129, 0)');

  ctx.strokeStyle = grad;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(centerX - shieldHalfW, surfaceScreenY + 2);
  ctx.quadraticCurveTo(centerX, surfaceScreenY - 14, centerX + shieldHalfW, surfaceScreenY + 2);
  ctx.stroke();

  ctx.fillStyle = `rgba(16, 185, 129, ${0.1 * pulse})`;
  ctx.beginPath();
  ctx.ellipse(centerX, surfaceScreenY - 2, shieldHalfW * 0.9, 10, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawAutoAlignBeam(
  ctx: CanvasRenderingContext2D,
  cakeCenterX: number,
  cakeBottomScreenY: number,
  targetX: number,
  targetScreenY: number
): void {
  if (targetScreenY <= cakeBottomScreenY) return;
  ctx.save();
  const beamGrad = ctx.createLinearGradient(0, cakeBottomScreenY, 0, targetScreenY);
  beamGrad.addColorStop(0, 'rgba(225, 29, 72, 0.45)');
  beamGrad.addColorStop(1, 'rgba(225, 29, 72, 0.12)');
  ctx.strokeStyle = beamGrad;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(cakeCenterX, cakeBottomScreenY);
  ctx.lineTo(targetX, targetScreenY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(225, 29, 72, 0.72)';
  ctx.beginPath();
  ctx.arc(targetX, targetScreenY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPendulum(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  hookX: number,
  hookY: number,
  theta: number,
  barWidth: number,
  flavor: CakeFlavor,
  isSwinging: boolean,
  shadowTargetScreenY: number | null
): void {
  if (isSwinging && shadowTargetScreenY !== null) {
    ctx.save();
    ctx.fillStyle = 'rgba(30, 41, 59, 0.14)';
    ctx.beginPath();
    ctx.ellipse(hookX, shadowTargetScreenY, barWidth * 0.44, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Pit lane gantry crane pulley
  ctx.save();
  ctx.fillStyle = '#1E293B';
  ctx.beginPath();
  ctx.arc(anchorX, anchorY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.arc(anchorX, anchorY, 3.8, 0, Math.PI * 2);
  ctx.fill();

  // Racing red hoist cable
  ctx.strokeStyle = '#E11D48';
  ctx.lineWidth = 2.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  ctx.lineTo(hookX, hookY);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(anchorX - 0.7, anchorY);
  ctx.lineTo(hookX - 0.7, hookY);
  ctx.stroke();

  // Pit tow hook block
  ctx.translate(hookX, hookY);
  ctx.rotate(-theta * 0.42);
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.roundRect(-5.5, -3.5, 11, 7, 2);
  ctx.fill();
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  if (isSwinging) {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-4, 3.5);
    ctx.lineTo(-14, 14);
    ctx.moveTo(4, 3.5);
    ctx.lineTo(14, 14);
    ctx.stroke();
  }
  ctx.restore();

  if (isSwinging) {
    drawCakeTier(ctx, hookX, hookY + 9, barWidth, CAKE_HEIGHT, flavor, {
      angle: -theta * 0.35,
      drawGarnish: true,
    });
  }
}

export function drawDebris(
  ctx: CanvasRenderingContext2D,
  debris: FallingDebris,
  cameraY: number
): void {
  const screenY = debris.y + cameraY;
  if (screenY - debris.height > LOGICAL_HEIGHT + 40) return;

  ctx.save();
  ctx.globalAlpha = clamp01(debris.alpha);
  drawCakeTier(
    ctx,
    debris.x,
    screenY - debris.height / 2,
    debris.width,
    debris.height,
    debris.flavor,
    {
      cutLeft: debris.side === 'right',
      cutRight: debris.side === 'left',
      drawGarnish: debris.side === 'full',
      angle: debris.angle,
    }
  );
  ctx.restore();
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  cameraY: number
): void {
  for (const p of particles) {
    const t = p.life / p.maxLife;
    const alpha = 1 - t * t;
    const screenY = p.y + cameraY;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, screenY);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;

    if (p.shape === 'star') {
      ctx.beginPath();
      const spikes = 4;
      const outer = p.radius * 1.55;
      const inner = p.radius * 0.45;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (i * Math.PI) / spikes;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    } else if (p.shape === 'crumb') {
      ctx.fillRect(-p.radius * 1.1, -p.radius * 0.55, p.radius * 2.2, p.radius * 1.1);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawCallouts(
  ctx: CanvasRenderingContext2D,
  callouts: FloatingCallout[],
  cameraY: number
): void {
  for (const c of callouts) {
    const progress = c.life / c.maxLife;
    const alpha = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8;
    const screenY = c.y + cameraY - progress * 34;

    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    ctx.textAlign = 'center';

    ctx.font = '700 18px "Fraunces", "Noto Sans TC", serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 251, 245, 0.94)';
    ctx.strokeText(c.text, c.x, screenY);
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, c.x, screenY);

    if (c.subtext) {
      ctx.font = '600 12px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeText(c.subtext, c.x, screenY + 17);
      ctx.fillStyle = '#334155';
      ctx.fillText(c.subtext, c.x, screenY + 17);
    }
    ctx.restore();
  }
}
