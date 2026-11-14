/**
 * Interactive starry cosmos, aurora shimmer, constellation cursor, and
 * high-altitude shooting stars strictly scoped to the homepage hero cover.
 */
(function () {
  let state = null;

  function teardown() {
    if (!state) return;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    window.removeEventListener('resize', state.onResize);
    document.removeEventListener('visibilitychange', state.onVisibility);
    if (state.header) {
      state.header.removeEventListener('mousemove', state.onMouseMove);
      state.header.removeEventListener('mouseleave', state.onMouseLeave);
    }
    const oldCanvas = document.getElementById('hero-cosmos-canvas');
    if (oldCanvas) oldCanvas.remove();
    const oldAurora = document.getElementById('hero-aurora-layer');
    if (oldAurora) oldAurora.remove();
    const oldExplore = document.getElementById('hero-explore-cta');
    if (oldExplore) oldExplore.remove();
    state = null;
  }

  function createExploreButton(siteInfo) {
    if (document.getElementById('hero-explore-cta')) return;
    const btn = document.createElement('button');
    btn.id = 'hero-explore-cta';
    btn.type = 'button';
    btn.className = 'hero-explore-cta';
    btn.innerHTML =
      '<span class="hero-explore-text">探索知识专栏</span>' +
      '<i class="fas fa-chevron-down hero-explore-arrow" aria-hidden="true"></i>';
    btn.addEventListener('click', function () {
      const target = document.getElementById('content-inner');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    siteInfo.appendChild(btn);
  }

  function initHeroCosmos() {
    teardown();

    const header = document.querySelector('#page-header.full_page');
    const siteInfo = document.getElementById('site-info');
    if (!header || !siteInfo) return;

    // 1. Subtle animated aurora shimmer layer behind title
    const aurora = document.createElement('div');
    aurora.id = 'hero-aurora-layer';
    aurora.className = 'hero-aurora-layer';
    header.appendChild(aurora);

    // 2. Frosted-glass "Explore Topics" pill inside #site-info
    createExploreButton(siteInfo);

    // Respect user reduced-motion preference for canvas particles
    const reducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      state = {
        rafId: null,
        header,
        onResize: function () {},
        onVisibility: function () {},
        onMouseMove: function () {},
        onMouseLeave: function () {}
      };
      return;
    }

    // 3. High-DPI interactive starfield + constellation + meteor canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'hero-cosmos-canvas';
    header.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const starColors = [
      [255, 255, 255],
      [186, 230, 253], // ice cyan
      [224, 231, 255], // soft periwinkle
      [254, 243, 199]  // warm starlight
    ];

    let width = 0;
    let height = 0;
    let dpr = 1;
    let stars = [];
    let meteors = [];
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };

    function buildStars() {
      const count = Math.min(130, Math.max(60, Math.floor((width * height) / 11500)));
      stars = [];
      for (let i = 0; i < count; i++) {
        const col = starColors[i % starColors.length];
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height * 0.72, // stay in sky & upper horizon
          r: Math.random() * 1.35 + 0.45,
          baseAlpha: Math.random() * 0.55 + 0.25,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.018 + 0.008,
          vx: (Math.random() - 0.5) * 0.06,
          vy: (Math.random() - 0.5) * 0.03,
          glint: Math.random() > 0.88,
          color: col
        });
      }
    }

    class ShootingStar {
      constructor(initialDelay) {
        this.alive = false;
        this.wait = initialDelay;
      }

      spawn() {
        this.x = Math.random() * (width * 0.82) + width * 0.05;
        this.y = Math.random() * (height * 0.26) + 12;
        this.angle = (34 + Math.random() * 10) * (Math.PI / 180);
        this.totalDist = Math.random() * 180 + 240;
        this.dist = 0;
        this.speed = Math.random() * 5 + 11;
        this.tailLen = Math.random() * 70 + 95;
        this.width = Math.random() * 1.2 + 1.1;
        this.alive = true;
      }

      step() {
        if (!this.alive) {
          if (this.wait > 0) {
            this.wait--;
          } else {
            this.spawn();
          }
          return;
        }
        this.x += this.speed * Math.cos(this.angle);
        this.y += this.speed * Math.sin(this.angle);
        this.dist += this.speed;
        if (this.dist >= this.totalDist || this.y > height * 0.58 || this.x > width + 40) {
          this.alive = false;
          this.wait = Math.floor(Math.random() * 170 + 90);
        }
      }

      draw() {
        if (!this.alive) return;
        const p = Math.min(this.dist / this.totalDist, 1);
        const alpha = p < 0.2 ? p / 0.2 : p <= 0.6 ? 1 : (1 - p) / 0.4;
        if (alpha <= 0.01) return;

        const tailX = this.x - this.tailLen * Math.cos(this.angle);
        const tailY = this.y - this.tailLen * Math.sin(this.angle);

        ctx.save();
        // Outer cyan/indigo glow trail
        const glow = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        glow.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.75})`);
        glow.addColorStop(0.22, `rgba(56, 189, 248, ${alpha * 0.35})`);
        glow.addColorStop(0.7, `rgba(129, 140, 248, ${alpha * 0.12})`);
        glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.strokeStyle = glow;
        ctx.lineWidth = this.width * 3.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        // Crisp luminous core
        const core = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        core.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        core.addColorStop(0.18, `rgba(186, 230, 253, ${alpha * 0.9})`);
        core.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.strokeStyle = core;
        ctx.lineWidth = this.width;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        // Head spark
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function onResize() {
      width = header.clientWidth || window.innerWidth;
      height = header.clientHeight || window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
    }

    function onMouseMove(e) {
      const rect = header.getBoundingClientRect();
      pointer.tx = e.clientX - rect.left;
      pointer.ty = e.clientY - rect.top;
      if (!pointer.active) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        pointer.active = true;
      }
    }

    function onMouseLeave() {
      pointer.active = false;
    }

    onResize();
    meteors = [new ShootingStar(25), new ShootingStar(140)];

    function render() {
      if (document.hidden) {
        state.rafId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      if (pointer.active) {
        pointer.x += (pointer.tx - pointer.x) * 0.14;
        pointer.y += (pointer.ty - pointer.y) * 0.14;

        // Soft starlight cursor halo
        const halo = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 150);
        halo.addColorStop(0, 'rgba(56, 189, 248, 0.10)');
        halo.addColorStop(0.5, 'rgba(139, 92, 246, 0.04)');
        halo.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(pointer.x, pointer.y, 150, 0, Math.PI * 2);
        ctx.fill();
      }

      const nearby = [];

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.phase += s.speed;
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < 0) s.x = width;
        if (s.x > width) s.x = 0;
        if (s.y < 0) s.y = height * 0.72;
        if (s.y > height * 0.72) s.y = 0;

        let alpha = s.baseAlpha + Math.sin(s.phase) * 0.25;
        let boost = 0;

        if (pointer.active) {
          const dx = s.x - pointer.x;
          const dy = s.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 145) {
            boost = 1 - dist / 145;
            alpha = Math.min(1, alpha + boost * 0.55);
            nearby.push({ star: s, boost, dist });
          }
        }

        alpha = Math.max(0.08, Math.min(1, alpha));
        const [r, g, b] = s.color;
        const radius = s.r + boost * 0.9;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Cross-flare glint on bright stars
        if (s.glint && alpha > 0.55) {
          const arm = radius * 3.4;
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.45})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(s.x - arm, s.y);
          ctx.lineTo(s.x + arm, s.y);
          ctx.moveTo(s.x, s.y - arm);
          ctx.lineTo(s.x, s.y + arm);
          ctx.stroke();
        }
      }

      // Draw delicate constellation lines near pointer
      if (pointer.active && nearby.length > 0) {
        for (let i = 0; i < nearby.length; i++) {
          const a = nearby[i];
          ctx.strokeStyle = `rgba(147, 197, 253, ${a.boost * 0.34})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(a.star.x, a.star.y);
          ctx.stroke();

          for (let j = i + 1; j < nearby.length; j++) {
            const b = nearby[j];
            const d = Math.hypot(a.star.x - b.star.x, a.star.y - b.star.y);
            if (d < 95) {
              const lineAlpha = (1 - d / 95) * Math.min(a.boost, b.boost) * 0.42;
              ctx.strokeStyle = `rgba(186, 230, 253, ${lineAlpha})`;
              ctx.beginPath();
              ctx.moveTo(a.star.x, a.star.y);
              ctx.lineTo(b.star.x, b.star.y);
              ctx.stroke();
            }
          }
        }
      }

      for (let i = 0; i < meteors.length; i++) {
        meteors[i].step();
        meteors[i].draw();
      }

      state.rafId = requestAnimationFrame(render);
    }

    function onVisibility() {}

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    header.addEventListener('mousemove', onMouseMove);
    header.addEventListener('mouseleave', onMouseLeave);

    state = {
      rafId: null,
      header,
      onResize,
      onVisibility,
      onMouseMove,
      onMouseLeave
    };
    state.rafId = requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroCosmos);
  } else {
    initHeroCosmos();
  }
  document.addEventListener('pjax:send', teardown);
  document.addEventListener('pjax:complete', initHeroCosmos);
})();
