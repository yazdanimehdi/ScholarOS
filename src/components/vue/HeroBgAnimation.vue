<template>
  <div ref="containerRef" class="absolute inset-0" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { HeroAnimationPreset } from '../../lib/types';

const props = defineProps<{
  preset: HeroAnimationPreset;
  customScript?: string;
  lightBgColor: string;
  darkBgColor: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
let cleanup: (() => void) | null = null;
let themeObserver: MutationObserver | null = null;

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

function getBgColor(): string {
  return isDark() ? props.darkBgColor : props.lightBgColor;
}

function watchTheme(onThemeChange: () => void) {
  themeObserver = new MutationObserver(() => {
    onThemeChange();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

async function initParticles(gsap: any, container: HTMLElement) {
  container.style.backgroundColor = getBgColor();
  watchTheme(() => {
    container.style.backgroundColor = getBgColor();
  });

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  let animId: number;
  let particles: { x: number; y: number; vx: number; vy: number; r: number; opacity: number }[] = [];

  function resize() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const count = 60;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.2,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dark = isDark();
    const color = dark ? '255,255,255' : '0,0,0';

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color},${p.opacity})`;
      ctx.fill();
    }

    // Draw connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(${color},${(1 - dist / 120) * 0.15})`;
          ctx.stroke();
        }
      }
    }

    animId = requestAnimationFrame(draw);
  }
  draw();

  return () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('resize', resize);
  };
}

async function initGradientMorph(gsap: any, container: HTMLElement) {
  container.style.overflow = 'hidden';

  function applyGradient() {
    const dark = isDark();
    const colors = dark ? ['#0d1117', '#161b22', '#1a2332', '#0d1117'] : ['#eff3fb', '#dae3f5', '#f9fafb', '#eff3fb'];
    container.style.background = `linear-gradient(135deg, ${colors[0]}, ${colors[1]}, ${colors[2]}, ${colors[3]})`;
    container.style.backgroundSize = '400% 400%';
  }
  applyGradient();
  watchTheme(applyGradient);

  const tl = gsap.timeline({ repeat: -1, yoyo: true });
  tl.to(container, {
    backgroundPosition: '100% 100%',
    duration: 8,
    ease: 'sine.inOut',
  });

  return () => {
    tl.kill();
  };
}

async function initGeometric(gsap: any, container: HTMLElement) {
  container.style.backgroundColor = getBgColor();
  container.style.overflow = 'hidden';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  svg.setAttribute('viewBox', '0 0 800 400');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  container.appendChild(svg);

  const shapes: SVGElement[] = [];
  for (let i = 0; i < 12; i++) {
    const shape = document.createElementNS(
      'http://www.w3.org/2000/svg',
      i % 3 === 0 ? 'circle' : i % 3 === 1 ? 'rect' : 'polygon',
    );
    const cx = Math.random() * 800;
    const cy = Math.random() * 400;

    if (i % 3 === 0) {
      shape.setAttribute('cx', String(cx));
      shape.setAttribute('cy', String(cy));
      shape.setAttribute('r', String(20 + Math.random() * 40));
    } else if (i % 3 === 1) {
      shape.setAttribute('x', String(cx));
      shape.setAttribute('y', String(cy));
      shape.setAttribute('width', String(30 + Math.random() * 50));
      shape.setAttribute('height', String(30 + Math.random() * 50));
    } else {
      const s = 20 + Math.random() * 30;
      shape.setAttribute('points', `${cx},${cy - s} ${cx + s},${cy + s} ${cx - s},${cy + s}`);
    }

    shape.setAttribute('fill', 'none');
    shape.setAttribute('stroke-width', '1');
    svg.appendChild(shape);
    shapes.push(shape);
  }

  function applyStroke() {
    const dark = isDark();
    const stroke = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
    shapes.forEach((s) => s.setAttribute('stroke', stroke));
    container.style.backgroundColor = getBgColor();
  }
  applyStroke();
  watchTheme(applyStroke);

  const tls = shapes.map((shape, i) => {
    return gsap.to(shape, {
      rotation: 360,
      transformOrigin: '50% 50%',
      duration: 15 + i * 2,
      repeat: -1,
      ease: 'none',
    });
  });

  return () => {
    tls.forEach((tl: any) => tl.kill());
  };
}

async function initWaveLines(gsap: any, container: HTMLElement) {
  container.style.backgroundColor = getBgColor();
  container.style.overflow = 'hidden';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  svg.setAttribute('viewBox', '0 0 800 400');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  container.appendChild(svg);

  const paths: SVGPathElement[] = [];

  for (let i = 0; i < 5; i++) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const y = 80 + i * 60;
    path.setAttribute('d', `M0,${y} Q200,${y - 40} 400,${y} Q600,${y + 40} 800,${y}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', '1.5');
    svg.appendChild(path);
    paths.push(path);
  }

  function applyStroke() {
    const dark = isDark();
    const baseColor = dark ? '255,255,255' : '0,0,0';
    paths.forEach((p, i) => p.setAttribute('stroke', `rgba(${baseColor},${0.06 + i * 0.02})`));
    container.style.backgroundColor = getBgColor();
  }
  applyStroke();
  watchTheme(applyStroke);

  const tls = paths.map((path, i) => {
    const y = 80 + i * 60;
    const amp = 30 + i * 10;
    return gsap.to(path, {
      attr: {
        d: `M0,${y} Q200,${y + amp} 400,${y} Q600,${y - amp} 800,${y}`,
      },
      duration: 3 + i * 0.5,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    });
  });

  return () => {
    tls.forEach((tl: any) => tl.kill());
  };
}

async function initCustom(container: HTMLElement, scriptPath: string) {
  try {
    const mod = await import(/* @vite-ignore */ scriptPath);
    if (typeof mod.init === 'function') {
      return mod.init(container);
    }
  } catch (e) {
    console.error('[HeroBgAnimation] Failed to load custom script:', e);
  }
  return null;
}

onMounted(async () => {
  const container = containerRef.value;
  if (!container) return;

  if (props.preset === 'custom' && props.customScript) {
    const result = await initCustom(container, props.customScript);
    if (typeof result === 'function') cleanup = result;
    return;
  }

  const gsap = (await import('gsap')).default;

  switch (props.preset) {
    case 'particles':
      cleanup = await initParticles(gsap, container);
      break;
    case 'gradient-morph':
      cleanup = await initGradientMorph(gsap, container);
      break;
    case 'geometric':
      cleanup = await initGeometric(gsap, container);
      break;
    case 'wave-lines':
      cleanup = await initWaveLines(gsap, container);
      break;
  }
});

onUnmounted(() => {
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});
</script>
