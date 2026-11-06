/**
 * 顺序表与链表经典题 · 极简交互式图解
 * 仅保留典型示例与 [<<] [<] [>] 三个控制按钮，极简直观
 */
(function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  let uid = 0;

  function h(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => c && e.appendChild(c));
    return e;
  }

  function s(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ============================ 绘图：数组 ============================ */
  const CELL = 44;
  const GAP = 6;
  const cellX = (x0, i) => x0 + i * (CELL + GAP);

  function drawArray(svg, o, id) {
    if (o.label) {
      s('text', {
        x: o.labelX != null ? o.labelX : o.x0 - 14,
        y: o.y + CELL / 2,
        class: 'av-rowlabel',
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        text: o.label,
      }, svg);
    }
    o.values.forEach((v, i) => {
      const x = cellX(o.x0, i);
      const g = s('g', { class: 'av-cell ' + (o.cls[i] || '') }, svg);
      s('rect', { x, y: o.y, width: CELL, height: CELL, rx: 7 }, g);
      s('text', {
        x: x + CELL / 2, y: o.y + CELL / 2, class: 'av-val',
        'text-anchor': 'middle', 'dominant-baseline': 'central', text: v,
      }, g);
      s('text', {
        x: x + CELL / 2, y: o.y + CELL + 14, class: 'av-idx',
        'text-anchor': 'middle', text: i,
      }, svg);
    });

    // 同行拷贝弧线
    if (o.copy && o.copy.from !== o.copy.to) {
      const sx = cellX(o.x0, o.copy.from) + CELL / 2;
      const tx = cellX(o.x0, o.copy.to) + CELL / 2;
      const sy = o.y - 2;
      const dy = 34 + Math.min(18, Math.abs(sx - tx) * 0.1);
      const g = s('g', { class: 'av-arrow av-arrow-hot' }, svg);
      s('path', {
        d: `M${sx},${sy} C${sx},${sy - dy} ${tx},${sy - dy} ${tx},${sy}`,
        'marker-end': `url(#${id}-hot)`,
      }, g);
    }

    const stack = {};
    (o.pointers || []).forEach((p) => {
      const key = p.side + ':' + p.idx;
      const n = (stack[key] = (stack[key] || 0) + 1);
      const cx = cellX(o.x0, p.idx) + CELL / 2;
      const out = p.idx < 0 || p.idx >= o.values.length;
      const g = s('g', { class: `av-ptr av-c-${p.color}${out ? ' av-out' : ''}` }, svg);
      if (p.side === 'top') {
        const tip = o.y - 3;
        if (n === 1) s('path', { d: `M${cx - 5},${tip - 8} L${cx + 5},${tip - 8} L${cx},${tip} Z` }, g);
        s('text', { x: cx, y: tip - 13 - (n - 1) * 15, 'text-anchor': 'middle', text: p.name }, g);
      } else {
        const tip = o.y + CELL + 19;
        if (n === 1) s('path', { d: `M${cx - 5},${tip + 8} L${cx + 5},${tip + 8} L${cx},${tip} Z` }, g);
        s('text', { x: cx, y: tip + 22 + (n - 1) * 15, 'text-anchor': 'middle', text: p.name }, g);
      }
    });
  }

  /* ============================ 绘图：链表 ============================ */
  const NW = 64;
  const NH = 38;
  const VW = 42;
  const NULLW = 50;

  function drawList(svg, o, id) {
    const byId = {};
    o.nodes.forEach((n) => (byId[n.id] = n));

    (o.nullNodes || []).forEach((u) => {
      byId[u.id] = { x: u.x, y: u.y, w: NULLW, isNull: true };
      const g = s('g', { class: 'av-nullbox' }, svg);
      s('rect', { x: u.x, y: u.y, width: NULLW, height: NH, rx: 7 }, g);
      s('text', {
        x: u.x + NULLW / 2, y: u.y + NH / 2,
        'text-anchor': 'middle', 'dominant-baseline': 'central', text: 'NULL',
      }, g);
    });

    (o.labels || []).forEach((lb) => {
      s('text', {
        x: lb.x, y: lb.y, class: 'av-rowlabel',
        'text-anchor': lb.anchor || 'start', 'dominant-baseline': 'central', text: lb.text,
      }, svg);
    });

    o.nodes.forEach((n) => {
      const g = s('g', { class: 'av-node ' + (n.cls || '') }, svg);
      s('rect', { x: n.x, y: n.y, width: NW, height: NH, rx: 7 }, g);
      s('line', { x1: n.x + VW, y1: n.y, x2: n.x + VW, y2: n.y + NH, class: 'av-sep' }, g);
      s('text', {
        x: n.x + VW / 2, y: n.y + NH / 2, class: 'av-val',
        'text-anchor': 'middle', 'dominant-baseline': 'central', text: n.val,
      }, g);
      if (n.next == null) {
        s('line', { x1: n.x + VW + 5, y1: n.y + NH - 6, x2: n.x + NW - 5, y2: n.y + 6, class: 'av-null' }, g);
      }
      if (n.tag) {
        s('text', { x: n.x + NW / 2, y: n.y + NH + 15, class: 'av-tag', 'text-anchor': 'middle', text: n.tag }, svg);
      }
    });

    o.nodes.forEach((n) => {
      if (n.next == null || !byId[n.next]) return;
      const t = byId[n.next];
      const kind = n.arrow || 'default';
      const g = s('g', { class: 'av-arrow av-arrow-' + kind }, svg);
      const sx = n.x + VW + (NW - VW) / 2;
      const sy = n.y + NH / 2;
      s('circle', { cx: sx, cy: sy, r: 3 }, g);
      let d;
      if (t.x > n.x) {
        d = `M${sx},${sy} L${t.x - 1},${t.y + NH / 2}`;
      } else {
        const tx = t.x + (t.isNull ? NULLW / 2 : VW / 2);
        const ty = t.y + NH + 1;
        const dy = 24 + Math.abs(sx - tx) * 0.09;
        d = `M${sx},${sy} L${sx},${n.y + NH} C${sx},${n.y + NH + dy} ${tx},${ty + dy} ${tx},${ty}`;
      }
      s('path', { d, 'marker-end': `url(#${id}-${kind})` }, g);
    });

    const stack = {};
    (o.pointers || []).forEach((p) => {
      if (p.target == null || !byId[p.target]) return;
      const t = byId[p.target];
      const n = (stack[p.target] = (stack[p.target] || 0) + 1);
      const cx = t.x + (t.w || NW) / 2;
      const tip = t.y - 3;
      const g = s('g', { class: `av-ptr av-c-${p.color}` }, svg);
      if (n === 1) s('path', { d: `M${cx - 5},${tip - 8} L${cx + 5},${tip - 8} L${cx},${tip} Z` }, g);
      s('text', { x: cx, y: tip - 13 - (n - 1) * 15, 'text-anchor': 'middle', text: p.name }, g);
    });
  }

  function drawDefs(svg, id) {
    const defs = s('defs', {}, svg);
    ['default', 'rev', 'hot'].forEach((k) => {
      const m = s('marker', {
        id: `${id}-${k}`, viewBox: '0 0 10 10', refX: 9, refY: 5,
        markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse',
        orient: 'auto', class: 'av-mk av-mk-' + k,
      }, defs);
      s('path', { d: 'M0,0 L10,5 L0,10 Z' }, m);
    });
  }

  function render(svg, f, id) {
    drawDefs(svg, id);
    (f.arrays || []).forEach((a) => drawArray(svg, a, id));
    if (f.transfer) {
      const g = s('g', { class: 'av-arrow av-arrow-hot' }, svg);
      s('path', { d: f.transfer, 'marker-end': `url(#${id}-hot)` }, g);
    }
    if (f.list) drawList(svg, f.list, id);
  }

  /* ============================ 极简播放器 ============================ */
  function Player(root, cfg) {
    const id = 'av' + ++uid;
    root.classList.add('av');
    root.setAttribute('tabindex', '0');

    const res = cfg.build();
    const frames = res.frames;
    let idx = 0;

    const svg = s('svg', {
      class: 'av-svg',
      viewBox: `0 0 ${res.view.w} ${res.view.h}`,
      role: 'img',
    });
    svg.style.maxWidth = res.view.w + 'px';
    const stage = h('div', { class: 'av-stage' }, [svg]);

    const btnFirst = h('button', { type: 'button', class: 'av-btn', title: '回到初始状态', text: '<<', onclick: () => go(0) });
    const btnPrev = h('button', { type: 'button', class: 'av-btn', title: '上一步 (←)', text: '<', onclick: () => go(idx - 1) });
    const stepLabel = h('span', { class: 'av-step' });
    const btnNext = h('button', { type: 'button', class: 'av-btn', title: '下一步 (→)', text: '>', onclick: () => go(idx + 1) });
    const controls = h('div', { class: 'av-controls' }, [btnFirst, btnPrev, stepLabel, btnNext]);

    root.append(stage, controls);

    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { go(idx + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { go(idx - 1); e.preventDefault(); }
      else if (e.key === 'Home') { go(0); e.preventDefault(); }
    });

    function go(i) {
      idx = Math.max(0, Math.min(frames.length - 1, i));
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      render(svg, frames[idx], id);
      stepLabel.textContent = `${idx + 1} / ${frames.length}`;
      btnFirst.disabled = btnPrev.disabled = idx === 0;
      btnNext.disabled = idx === frames.length - 1;
    }

    go(0);
  }

  /* ============================ 典型数据场景定义 ============================ */
  const SC = {};

  /* ---------- 1. 移除元素 ---------- */
  SC.remove = {
    build() {
      const a = [0, 1, 2, 2, 3, 0, 4, 2];
      const val = 2;
      const n = a.length;
      const x0 = 100;
      const labelX = 84;
      const y = 52;
      const frames = [];

      const skipped = {};

      const snap = (left, right, mark, copy, label) => {
        const cls = a.map((_, i) => {
          if (i < left) return 'kept';
          if (skipped[i]) return 'garbage val-match';
          if (i < right) return 'garbage';
          return '';
        });
        if (mark) {
          for (const k in mark) {
            cls[k] = (cls[k] ? cls[k] + ' ' : '') + mark[k];
          }
        }
        frames.push({
          arrays: [{
            x0,
            labelX,
            y,
            label: label || `val = ${val}`,
            values: a.slice(),
            cls,
            copy,
            pointers: [
              { name: 'left', idx: left, side: 'top', color: 'blue' },
              { name: 'right', idx: right, side: 'bottom', color: 'orange' },
            ],
          }],
        });
      };

      let left = 0;
      // 0. 初始状态：left=0, right=0
      snap(0, 0, null, null, `val = ${val}`);

      for (let right = 0; right < n; right++) {
        if (a[right] === val) {
          // 命中 val：标记为跳过，left 不动，步进非常清晰
          skipped[right] = true;
          snap(left, right, { [right]: 'active val-match' }, null, `跳过 val=${val}`);
        } else {
          // 第一拍：right 扫描到保留元素，等待写入 left 位置
          const from = right;
          const to = left;
          snap(left, right, { [from]: 'active' }, null, `保留 ${a[from]}`);

          // 第二拍：执行赋值写入，left 后移一位
          a[to] = a[from];
          left++;
          snap(
            left,
            right,
            { [to]: 'written' },
            from !== to ? { from, to } : null,
            `写入 nums[${to}]`
          );
        }
      }

      // 扫描完成：此时 left 即为有效元素个数 k
      snap(left, n, null, null, `k = ${left}`);
      return { frames, view: { w: x0 + (n + 1) * (CELL + GAP) + 16, h: 160 } };
    },
  };

  /* ---------- 2. 合并两个有序数组 ---------- */
  SC.merge = {
    build() {
      const a = [1, 4, 7, 0, 0, 0];
      const b = [2, 5, 6];
      const m = 3;
      const n = 3;
      const x0 = 96;
      const labelX = 48;
      const y1 = 44;
      const y2 = 166;
      const frames = [];

      const snap = (i, j, k, mark1, mark2, copy, transfer) => {
        const c1 = a.map((_, p) => (p > k ? 'done' : p <= i ? '' : p < m ? 'garbage' : 'empty'));
        const c2 = b.map((_, q) => (q > j ? 'garbage' : ''));
        if (mark1) for (const p in mark1) c1[p] += ' ' + mark1[p];
        if (mark2) for (const q in mark2) c2[q] += ' ' + mark2[q];
        frames.push({
          transfer,
          arrays: [
            { x0, labelX, y: y1, label: 'nums1', values: a.slice(), cls: c1, copy, pointers: [
              { name: 'k', idx: k, side: 'top', color: 'purple' },
              { name: 'i', idx: i, side: 'bottom', color: 'blue' }] },
            { x0, labelX, y: y2, label: 'nums2', values: b.slice(), cls: c2, pointers: [
              { name: 'j', idx: j, side: 'bottom', color: 'orange' }] },
          ],
        });
      };

      let i = m - 1;
      let j = n - 1;
      let k = m + n - 1;
      snap(i, j, k);
      while (i >= 0 && j >= 0) {
        snap(i, j, k, { [i]: 'active' }, { [j]: 'active' });
        if (a[i] > b[j]) {
          const from = i;
          const to = k;
          a[k--] = a[i--];
          snap(i, j, k, { [to]: 'written' }, null, { from, to });
        } else {
          const sx = cellX(x0, j) + CELL / 2;
          const sy = y2 - 2;
          const tx = cellX(x0, k) + CELL / 2;
          const ty = y1 + CELL + 2;
          const to = k;
          a[k--] = b[j--];
          snap(i, j, k, { [to]: 'written' }, null, null, `M${sx},${sy} C${sx},${sy - 36} ${tx},${ty + 36} ${tx},${ty}`);
        }
      }
      snap(i, j, k);
      return { frames, view: { w: x0 + (m + n) * (CELL + GAP) + 24, h: 266 } };
    },
  };

  /* ---------- 3. 反转链表 ---------- */
  SC.reverse = {
    build() {
      const vals = [1, 2, 3, 4];
      const n = vals.length;
      const next = vals.map((_, i) => (i + 1 < n ? i + 1 : 'nullR'));
      const arrow = vals.map(() => 'default');
      const xs = vals.map((_, i) => 96 + i * 96);
      const ys = vals.map(() => 52);
      const nullNodes = [
        { id: 'nullL', x: 18, y: 52 },
        { id: 'nullR', x: 96 + n * 96, y: 52 },
      ];
      const frames = [];

      let prev = 'nullL';
      let cur = 0;
      let nx = null;

      const snap = (o = {}) => {
        const cls = vals.map((_, i) => (arrow[i] === 'rev' ? 'done' : ''));
        if (typeof cur === 'number') cls[cur] = (cls[cur] + ' focus').trim();
        const ar = arrow.slice();
        if (o.hot != null) ar[o.hot] = 'hot';
        const ptrs = o.ptrs || [
          { name: 'prev', target: prev, color: 'blue' },
          { name: 'cur', target: cur, color: 'orange' },
        ].concat(o.showNext ? [{ name: 'next', target: nx, color: 'purple' }] : []);
        frames.push({
          list: {
            nodes: vals.map((val, i) => ({
              id: i, val, x: xs[i], y: ys[i],
              next: next[i] === 'nullR' ? null : next[i],
              arrow: ar[i], cls: cls[i],
            })),
            nullNodes,
            pointers: ptrs,
          },
        });
      };

      snap();
      while (typeof cur === 'number') {
        nx = next[cur];
        snap({ showNext: true });           // ① next = cur->next
        next[cur] = prev;
        arrow[cur] = 'rev';
        snap({ showNext: true, hot: cur }); // ② cur->next = prev
        prev = cur;
        snap({ showNext: true });           // ③ prev = cur
        cur = nx;
        snap({ showNext: true });           // ④ cur = next
      }
      return { frames, view: { w: 96 + n * 96 + 68, h: 138 } };
    },
  };

  /* ---------- 4. 链表的中间结点 ---------- */
  SC.middle = {
    build() {
      const vals = [1, 2, 3, 4, 5];
      const n = vals.length;
      const next = vals.map((_, i) => (i + 1 < n ? i + 1 : null));
      const xs = vals.map((_, i) => 20 + i * 94);
      const ys = vals.map(() => 52);
      const frames = [];
      let slow = 0;
      let fast = 0;
      const snap = (done) => {
        const cls = vals.map((_, i) => (done && i === slow ? 'done' : (i === slow || i === fast ? 'focus' : '')));
        frames.push({
          list: {
            nodes: vals.map((val, i) => ({ id: i, val, x: xs[i], y: ys[i], next: next[i], cls: cls[i] })),
            pointers: [
              { name: 'slow', target: slow, color: 'blue' },
              { name: 'fast', target: fast, color: 'orange' },
            ],
          },
        });
      };
      snap(false);
      while (fast != null && next[fast] != null) {
        slow = next[slow];
        fast = next[next[fast]];
        snap(false);
      }
      snap(true);
      return { frames, view: { w: 20 + n * 94, h: 112 } };
    },
  };

  /* ---------- 5. 回文链表 ---------- */
  SC.palindrome = {
    build() {
      const vals = [1, 2, 3, 2, 1];
      const n = vals.length;
      const next = vals.map((_, i) => (i + 1 < n ? i + 1 : null));
      const arrow = vals.map(() => 'default');
      const xs = vals.map((_, i) => 20 + i * 94);
      const ys = vals.map(() => 52);
      const frames = [];

      const snap = (ptrs, extra = {}) => {
        const cls = vals.map((_, i) => (arrow[i] === 'rev' ? 'done' : ''));
        (extra.match || []).forEach((i) => (cls[i] += ' match'));
        const ar = arrow.slice();
        if (extra.hot != null) ar[extra.hot] = 'hot';
        frames.push({
          list: {
            nodes: vals.map((val, i) => ({
              id: i, val, x: xs[i], y: ys[i], next: next[i], arrow: ar[i], cls: cls[i],
            })),
            pointers: ptrs,
          },
        });
      };

      // ① 找中点
      let slow = 0;
      let fast = 0;
      const sf = () => [{ name: 'slow', target: slow, color: 'blue' }, { name: 'fast', target: fast, color: 'orange' }];
      snap(sf());
      while (fast != null && next[fast] != null) {
        slow = next[slow];
        fast = next[next[fast]];
        snap(sf());
      }
      const mid = slow;
      // ② 反转后半段
      let prev = null;
      let cur = mid;
      while (cur != null) {
        const nx = next[cur];
        next[cur] = prev;
        arrow[cur] = 'rev';
        snap([{ name: 'mid', target: mid, color: 'gray' }, { name: 'cur', target: cur, color: 'purple' }], { hot: cur });
        prev = cur;
        cur = nx;
      }
      // ③ 两端向中间比对
      let p1 = 0;
      let p2 = prev;
      const matched = [];
      while (p1 != null && p2 != null) {
        matched.push(p1, p2);
        snap([{ name: 'p1', target: p1, color: 'blue' }, { name: 'p2', target: p2, color: 'orange' }], { match: matched.slice() });
        p1 = next[p1];
        p2 = next[p2];
      }
      return { frames, view: { w: 20 + n * 94, h: 138 } };
    },
  };

  /* ---------- 6. 相交链表 ---------- */
  SC.intersect = {
    build() {
      const vals = [4, 1, 5, 6, 1, 8, 4, 5];
      const tags = ['a1', 'a2', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'];
      const next = [1, 5, 3, 4, 5, 6, 7, null];
      const SP = 88;
      const X0 = 64;
      const YA = 42;
      const YC = 132;
      const YB = 222;
      const xs = [X0 + SP, X0 + 2 * SP, X0, X0 + SP, X0 + 2 * SP, X0 + 3 * SP, X0 + 4 * SP, X0 + 5 * SP];
      const ys = [YA, YA, YB, YB, YB, YC, YC, YC];
      const frames = [];

      const snap = (ptrs, o = {}) => {
        const cls = vals.map((_, i) => (o.shared && i >= 5 ? 'shared' : ''));
        if (o.found != null) cls[o.found] = 'done match';
        else ptrs.forEach((p) => { if (p.target != null) cls[p.target] = (cls[p.target] + ' focus').trim(); });
        frames.push({
          list: {
            nodes: vals.map((val, i) => ({
              id: i, val, x: xs[i], y: ys[i], next: next[i], cls: cls[i], tag: tags[i],
            })),
            labels: [
              { x: 14, y: YA + NH / 2, text: o.lenA ? `A (${o.lenA})` : 'A' },
              { x: 14, y: YB + NH / 2, text: o.lenB ? `B (${o.lenB})` : 'B' },
            ],
            pointers: ptrs,
          },
        });
      };

      // ① 找尾计数
      snap([{ name: 'curA', target: 0, color: 'blue' }, { name: 'curB', target: 2, color: 'orange' }]);
      snap([{ name: 'curA', target: 7, color: 'blue' }, { name: 'curB', target: 7, color: 'orange' }], { shared: true, lenA: 5, lenB: 6 });

      // ② 长链表 B 先走 1 步对齐
      let longL = 2;
      let shortL = 0;
      const ls = () => [{ name: 'short', target: shortL, color: 'green' }, { name: 'long', target: longL, color: 'purple' }];
      snap(ls(), { shared: true, lenA: 5, lenB: 6 });
      longL = next[longL];
      snap(ls(), { shared: true, lenA: 5, lenB: 6 });

      // ③ 同步前进直到相遇
      while (longL !== shortL) {
        longL = next[longL];
        shortL = next[shortL];
        snap(ls(), { shared: true, lenA: 5, lenB: 6, found: longL === shortL ? longL : null });
      }
      return { frames, view: { w: X0 + 6 * SP, h: YB + NH + 24 } };
    },
  };

  /* ============================ 初始化 ============================ */
  function init() {
    document.querySelectorAll('.algo-viz[data-viz]').forEach((el) => {
      if (el.dataset.ready) return;
      const cfg = SC[el.dataset.viz];
      if (!cfg) return;
      el.dataset.ready = '1';
      Player(el, cfg);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('pjax:complete', init);
})();
