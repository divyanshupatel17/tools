'use client';

import { useEffect, useRef, useState } from 'react';
import { BEST_SCORE_KEY } from '@/lib/landing/leaderboard';
import { publishRunnerScores } from '@/lib/landing/runner_store';
import { assetPath } from '@/lib/utils/asset_path';

const SPRITES = {
  idle: '/game/dino-idle.png',
  run1: '/game/dino-run-1.png',
  run2: '/game/dino-run-2.png',
  cactus: '/game/cactus.png',
  cactusSmall: '/game/cactus-small.png',
  bird: '/game/bird.png',
  cloud: '/game/cloud.png',
} as const;

type SpriteKey = keyof typeof SPRITES;
type Sprites = Record<SpriteKey, HTMLImageElement>;
type Phase = 'idle' | 'spawning' | 'running' | 'dying' | 'dead';

const GROUND_INSET = 34; // sand below the running line, where the hint text sits
const DINO_HEIGHT = 62;
const GRAVITY = 2100;
const JUMP_VELOCITY = -680;
const START_SPEED = 300;
const MAX_SPEED = 640;
const POINTS_PER_PIXEL = 0.05;

/** The dino drops in from above and jogs forward into its running mark. */
const SPAWN_HEIGHT = 190;
const SPAWN_RUN_UP = 56;
const DEATH_SPIN = Math.PI / 2;

interface Obstacle {
  x: number;
  width: number;
  height: number;
  /** Birds fly above the ground; cacti sit on it. */
  lift: number;
  sprite: SpriteKey;
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  speed: number;
}

function loadSprites(): Promise<Sprites> {
  const entries = Object.entries(SPRITES) as [SpriteKey, string][];
  return Promise.all(
    entries.map(
      ([key, src]) =>
        new Promise<[SpriteKey, HTMLImageElement]>((resolve, reject) => {
          const image = new Image();
          image.src = assetPath(src);
          image.onload = () => resolve([key, image]);
          image.onerror = () => reject(new Error(`Could not load ${src}`));
        }),
    ),
  ).then((loaded) => Object.fromEntries(loaded) as Sprites);
}

function scaledWidth(image: HTMLImageElement, height: number): number {
  return Math.round((image.width / image.height) * height);
}

export function DinoGame() {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const stored = Number(window.localStorage.getItem(BEST_SCORE_KEY) ?? 0);
    let bestScore = Number.isFinite(stored) ? stored : 0;
    publishRunnerScores({ score: 0, best: bestScore });

    let sprites: Sprites | null = null;
    let disposed = false;
    let raf = 0;
    let last = 0;
    let visible = true;

    let width = 0;
    let height = 0;
    let groundY = 0;
    let restX = 16;

    let state: Phase = 'idle';
    let dinoX = 0;
    let dinoY = 0;
    let tilt = 0;
    let velocity = 0;
    let speed = START_SPEED;
    let distance = 0;
    let points = 0;
    let obstacles: Obstacle[] = [];
    let clouds: Cloud[] = [];
    let nextObstacleIn = 380;

    function setPhaseBoth(next: Phase) {
      state = next;
      setPhase(next);
    }

    function resize() {
      const rect = frame!.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      groundY = height - GROUND_INSET;
      restX = width >= 640 ? Math.max(0, (width - 1240) / 2) + 40 : 16;
      if (state === 'idle' || state === 'dead') dinoX = restX;
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      context!.imageSmoothingEnabled = false;
    }

    function seedClouds() {
      clouds = Array.from({ length: 3 }, (_, index) => ({
        x: width * (0.2 + index * 0.3),
        y: 12 + index * 22,
        width: 70 + index * 18,
        speed: 14 + index * 6,
      }));
    }

    function spawn() {
      dinoX = Math.max(0, restX - SPAWN_RUN_UP);
      dinoY = SPAWN_HEIGHT;
      velocity = 0;
      tilt = 0;
      speed = START_SPEED;
      distance = 0;
      points = 0;
      obstacles = [];
      nextObstacleIn = 380;
      publishRunnerScores({ score: 0, best: bestScore });
      setPhaseBoth('spawning');
    }

    function addObstacle() {
      if (!sprites) return;
      const roll = Math.random();
      const flying = roll > 0.78 && speed > 380;

      if (flying) {
        const h = 32;
        obstacles.push({
          x: width + 40,
          width: scaledWidth(sprites.bird, h),
          height: h,
          lift: 34 + Math.random() * 22,
          sprite: 'bird',
        });
      } else {
        const small = roll < 0.4;
        const h = small ? 38 : 56;
        const sprite: SpriteKey = small ? 'cactusSmall' : 'cactus';
        obstacles.push({
          x: width + 40,
          width: scaledWidth(sprites[sprite], h),
          height: h,
          lift: 0,
          sprite,
        });
      }

      nextObstacleIn = 300 + Math.random() * 320;
    }

    function jump() {
      if (state === 'idle' || state === 'dead') {
        spawn();
        return;
      }
      if (state === 'running' && dinoY === 0) velocity = JUMP_VELOCITY;
    }

    function die() {
      velocity = -260;
      tilt = 0;
      setPhaseBoth('dying');
      if (points > bestScore) {
        bestScore = points;
        window.localStorage.setItem(BEST_SCORE_KEY, String(points));
      }
      publishRunnerScores({ score: points, best: bestScore });
    }

    function collide(dinoWidth: number) {
      // Forgiving box: the sprite has transparent margins the player never feels.
      const pad = 6;
      const left = dinoX + pad;
      const right = dinoX + dinoWidth - pad;
      const top = groundY - DINO_HEIGHT - dinoY + pad;
      const bottom = groundY - dinoY;

      return obstacles.some((obstacle) => {
        const obstacleTop = groundY - obstacle.height - obstacle.lift;
        return (
          obstacle.x + pad < right &&
          obstacle.x + obstacle.width - pad > left &&
          obstacleTop < bottom - pad &&
          obstacleTop + obstacle.height > top
        );
      });
    }

    function draw(now: number) {
      if (!sprites) return;
      context!.clearRect(0, 0, width, height);

      for (const cloud of clouds) {
        context!.globalAlpha = 0.55;
        context!.drawImage(
          sprites.cloud,
          cloud.x,
          cloud.y,
          cloud.width,
          (cloud.width / sprites.cloud.width) * sprites.cloud.height,
        );
        context!.globalAlpha = 1;
      }

      context!.strokeStyle = 'rgb(120 90 30 / 0.45)';
      context!.lineWidth = 2;
      context!.beginPath();
      context!.moveTo(0, groundY + 1);
      context!.lineTo(width, groundY + 1);
      context!.stroke();

      for (const obstacle of obstacles) {
        context!.drawImage(
          sprites[obstacle.sprite],
          obstacle.x,
          groundY - obstacle.height - obstacle.lift,
          obstacle.width,
          obstacle.height,
        );
      }

      const running = state === 'running' && dinoY === 0;
      const frameSprite = Math.floor(now / 110) % 2 === 0 ? sprites.run1 : sprites.run2;
      const dinoSprite = running ? frameSprite : sprites.idle;
      const dinoWidth = scaledWidth(dinoSprite, DINO_HEIGHT);
      const top = groundY - DINO_HEIGHT - dinoY;

      if (tilt === 0) {
        context!.drawImage(dinoSprite, dinoX, top, dinoWidth, DINO_HEIGHT);
        return;
      }

      // Death topple pivots on the dino's feet.
      context!.save();
      context!.translate(dinoX + dinoWidth / 2, groundY - dinoY);
      context!.rotate(tilt);
      context!.drawImage(dinoSprite, -dinoWidth / 2, -DINO_HEIGHT, dinoWidth, DINO_HEIGHT);
      context!.restore();
    }

    function tick(now: number) {
      raf = window.requestAnimationFrame(tick);
      if (!sprites || !visible) {
        last = now;
        return;
      }

      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;

      for (const cloud of clouds) {
        cloud.x -= cloud.speed * delta;
        if (cloud.x + cloud.width < 0) cloud.x = width + Math.random() * 120;
      }

      if (state === 'spawning') {
        velocity += GRAVITY * delta;
        dinoY = Math.max(0, dinoY - velocity * delta);
        dinoX = Math.min(restX, dinoX + SPAWN_RUN_UP * 1.6 * delta);
        if (dinoY === 0) {
          dinoX = restX;
          velocity = 0;
          setPhaseBoth('running');
        }
      } else if (state === 'running') {
        speed = Math.min(MAX_SPEED, speed + delta * 14);
        const step = speed * delta;
        distance += step;

        velocity += GRAVITY * delta;
        dinoY = Math.max(0, dinoY - velocity * delta);
        if (dinoY === 0) velocity = 0;

        nextObstacleIn -= step;
        if (nextObstacleIn <= 0) addObstacle();

        for (const obstacle of obstacles) obstacle.x -= step;
        obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -20);

        const next = Math.floor(distance * POINTS_PER_PIXEL);
        if (next !== points) {
          points = next;
          publishRunnerScores({ score: points, best: bestScore });
        }

        if (collide(scaledWidth(sprites.idle, DINO_HEIGHT))) die();
      } else if (state === 'dying') {
        velocity += GRAVITY * delta;
        dinoY = Math.max(0, dinoY - velocity * delta);
        tilt = Math.min(DEATH_SPIN, tilt + delta * 5);
        if (dinoY === 0 && tilt >= DEATH_SPIN) setPhaseBoth('dead');
      }

      draw(now);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' && event.code !== 'ArrowUp') return;
      if (!visible) return;

      const target = event.target;
      // Never steal the key from a field the visitor is typing in.
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName))
      ) {
        return;
      }

      event.preventDefault();
      jump();
    }

    const onPointerDown = () => jump();

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = (entry?.intersectionRatio ?? 0) > 0.35;
      },
      { threshold: [0, 0.35, 0.6] },
    );
    observer.observe(frame);

    const resizeObserver = new ResizeObserver(() => {
      resize();
      seedClouds();
    });
    resizeObserver.observe(frame);

    resize();
    seedClouds();
    dinoX = restX;

    loadSprites().then((loaded) => {
      if (disposed) return;
      sprites = loaded;
      // Paint the idle scene straight away; the loop itself parks while off-screen.
      draw(performance.now());
    });

    window.addEventListener('keydown', onKeyDown);
    frame.addEventListener('pointerdown', onPointerDown);
    last = performance.now();
    raf = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      frame.removeEventListener('pointerdown', onPointerDown);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  const hint =
    phase === 'running' || phase === 'spawning'
      ? 'Press SPACE or ↑ to Jump'
      : phase === 'dying' || phase === 'dead'
        ? 'Press SPACE or ↑ to Play again'
        : 'Press SPACE or ↑ to Play';

  return (
    <div
      ref={frameRef}
      role="application"
      aria-label="Dino runner. Press space or the up arrow to jump."
      className="relative h-[210px] w-full touch-manipulation select-none sm:h-[250px]"
    >
      <canvas ref={canvasRef} aria-hidden className="pixelated absolute inset-0 size-full" />
      <p
        aria-live="polite"
        className="text-ink/55 absolute inset-x-0 bottom-2 text-center font-mono text-[11px] tracking-wide"
      >
        {hint}
      </p>
    </div>
  );
}
