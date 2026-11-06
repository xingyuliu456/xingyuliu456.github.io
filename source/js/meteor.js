// source/js/meteor.js - 仅在首页生效的高清精美拟真流星雨引擎
(function () {
  let animationId = null;

  function cleanup() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    const oldCanvas = document.getElementById('meteor-canvas');
    if (oldCanvas) oldCanvas.remove();
  }

  function initMeteorShower() {
    cleanup();

    // 严格判断：仅在主页（拥有 full_page 且有 site-info）时生效，所有 post/文章页绝对不运行
    const header = document.querySelector('#page-header.full_page');
    const siteInfo = document.getElementById('site-info');
    if (!header || !siteInfo) {
      return;
    }

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

    // 拟真单颗流星对象
    class Meteor {
      constructor() {
        this.alive = false;
        this.wait = Math.floor(Math.random() * 80 + 20); // 初始等待帧数
      }

      spawn() {
        // 出生点：屏幕偏中上方天空中（x 坐标偏左中，y 坐标在顶部 5% ~ 35% 夜空中）
        this.startX = Math.random() * (width * 0.9) - width * 0.1;
        this.startY = Math.random() * (height * 0.35);
        this.x = this.startX;
        this.y = this.startY;

        // 流星角度：倾斜 36° ~ 42° 自然弧度
        this.angle = (38 + Math.random() * 4) * (Math.PI / 180);
        // 流星行进总距离：在天空中划过 280px ~ 460px 后完全燃尽，绝不侵入下方山体森林
        this.totalDist = Math.random() * 180 + 280;
        this.dist = 0;
        // 速度：划破夜空的拟真高速感
        this.speed = Math.random() * 8 + 14;

        // 彗尾长度与流星粗细
        this.tailLength = Math.random() * 80 + 100;
        this.size = Math.random() * 1.4 + 1.2;

        this.alive = true;
      }

      update() {
        if (!this.alive) {
          if (this.wait > 0) {
            this.wait--;
          } else {
            this.spawn();
          }
          return;
        }

        // 推进位置
        const moveStep = this.speed;
        this.x += moveStep * Math.cos(this.angle);
        this.y += moveStep * Math.sin(this.angle);
        this.dist += moveStep;

        // 如果达到燃尽距离，或接近山脊高度（超过顶部 65%），则燃尽湮灭
        if (this.dist >= this.totalDist || this.y > height * 0.62 || this.x > width + 50) {
          this.alive = false;
          // 燃尽后等待随机帧数（约 2 ~ 4 秒）再触发下一次流星，避免杂乱
          this.wait = Math.floor(Math.random() * 140 + 60);
        }
      }

      draw() {
        if (!this.alive) return;

        // 计算当前生命周期进度 (0 ~ 1)
        const progress = Math.min(this.dist / this.totalDist, 1);

        // 亮度模拟：进入大气层快速增亮 (0->0.2)，空中极盛 (0.2->0.6)，燃尽平滑消隐 (0.6->1.0)
        let alpha = 0;
        if (progress < 0.2) {
          alpha = progress / 0.2;
        } else if (progress <= 0.6) {
          alpha = 1.0;
        } else {
          alpha = (1.0 - progress) / 0.4;
        }

        if (alpha <= 0.01) return;

        ctx.save();

        const tailX = this.x - this.tailLength * Math.cos(this.angle);
        const tailY = this.y - this.tailLength * Math.sin(this.angle);

        // 1. 外层柔和辉光层 (Atmospheric Glow)
        const outerGlow = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        outerGlow.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.9})`);
        outerGlow.addColorStop(0.2, `rgba(56, 189, 248, ${alpha * 0.4})`);
        outerGlow.addColorStop(0.7, `rgba(99, 102, 241, ${alpha * 0.15})`);
        outerGlow.addColorStop(1, 'rgba(15, 23, 42, 0)');

        ctx.strokeStyle = outerGlow;
        ctx.lineWidth = this.size * 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        // 2. 内层高光彗核尾迹 (Bright Core Trail)
        const innerCore = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        innerCore.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        innerCore.addColorStop(0.1, `rgba(224, 242, 254, ${alpha * 0.95})`);
        innerCore.addColorStop(0.4, `rgba(56, 189, 248, ${alpha * 0.6})`);
        innerCore.addColorStop(1, 'rgba(56, 189, 248, 0)');

        ctx.strokeStyle = innerCore;
        ctx.lineWidth = this.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        // 3. 头部星核微光晕 (Head Star Core)
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 1.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    // 维持 3 颗流星交替巡航（错开间隔，每次划过 1 颗，偶尔双星交映）
    const meteors = [new Meteor(), new Meteor(), new Meteor()];
    meteors[1].wait = 60;
    meteors[2].wait = 130;

    function animate() {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < meteors.length; i++) {
        meteors[i].update();
        meteors[i].draw();
      }
      animationId = requestAnimationFrame(animate);
    }
    animate();

    // 页面 PJAX 跳转离开时彻底停止清理
    document.addEventListener('pjax:send', function onPjaxSend() {
      cleanup();
      window.removeEventListener('resize', resize);
      document.removeEventListener('pjax:send', onPjaxSend);
    });
  }

  // 页面加载或 PJAX 完成时挂载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMeteorShower);
  } else {
    initMeteorShower();
  }
  document.addEventListener('pjax:complete', initMeteorShower);
})();
