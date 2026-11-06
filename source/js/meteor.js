// source/js/meteor.js - 动态星空流星雨特效
(function () {
  function initMeteorShower() {
    const header = document.getElementById('page-header');
    if (!header) return;

    // 避免重复挂载
    const oldCanvas = document.getElementById('meteor-canvas');
    if (oldCanvas) oldCanvas.remove();

    const canvas = document.createElement('canvas');
    canvas.id = 'meteor-canvas';
    header.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;

    function resize() {
      width = header.clientWidth || window.innerWidth;
      height = header.clientHeight || window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    }
    resize();
    window.addEventListener('resize', resize);

    // 流星参数池
    const meteors = [];
    const maxMeteors = 6; // 维持 5-7 条优雅逼真的流星，避免杂乱

    class Meteor {
      constructor() {
        this.reset(true);
      }

      reset(initial = false) {
        // 从左上角上方随机刷出
        this.x = Math.random() * (width + 300) - 200;
        this.y = Math.random() * -height * 0.4 - 30;
        this.length = Math.random() * 110 + 70; // 优雅修长的尾光
        this.speed = Math.random() * 7 + 10;    // 真实流星的划过速度
        this.angle = Math.PI / 4 + (Math.random() * 0.12 - 0.06); // 约 45 度斜划
        this.size = Math.random() * 1.6 + 1.2;
        this.alpha = Math.random() * 0.5 + 0.45;
        // 错开出现的间隔，实现自然轮流划过的夜空效果
        this.delay = initial ? Math.floor(Math.random() * 120) : Math.floor(Math.random() * 160 + 30);
      }

      update() {
        if (this.delay > 0) {
          this.delay--;
          return;
        }

        this.x += this.speed * Math.cos(this.angle);
        this.y += this.speed * Math.sin(this.angle);

        // 超出视窗则重置
        if (this.x > width + 100 || this.y > height + 100) {
          this.reset(false);
        }
      }

      draw() {
        if (this.delay > 0) return;

        ctx.save();
        const tailX = this.x - this.length * Math.cos(this.angle);
        const tailY = this.y - this.length * Math.sin(this.angle);

        // 流星发光渐变：亮金白星核 -> 极光青蓝尾光 -> 渐隐透明
        const gradient = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${this.alpha})`);
        gradient.addColorStop(0.15, `rgba(56, 189, 248, ${this.alpha * 0.85})`);
        gradient.addColorStop(0.65, `rgba(99, 102, 241, ${this.alpha * 0.35})`);
        gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = this.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        // 头部微小高亮光晕
        ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 1.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    for (let i = 0; i < maxMeteors; i++) {
      meteors.push(new Meteor());
    }

    let animationId;
    function animate() {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < meteors.length; i++) {
        meteors[i].update();
        meteors[i].draw();
      }
      animationId = requestAnimationFrame(animate);
    }
    animate();

    // 页面 PJAX 切换时清理计时器
    document.addEventListener('pjax:send', function cleanup() {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('pjax:send', cleanup);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMeteorShower);
  } else {
    initMeteorShower();
  }
  document.addEventListener('pjax:complete', initMeteorShower);
})();
