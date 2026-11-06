/**
 * 顺序表与链表经典题 · 交互式逐步演示
 * 用法：在文章中放置 <div class="algo-viz" data-viz="remove|merge|reverse|palindrome|intersect"></div>
 */
(function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  let uid = 0;

  /* ============================ DOM 工具 ============================ */
  function h(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
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
  const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const randArr = (len, lo, hi) => Array.from({ length: len }, () => rand(lo, hi));

  /* ============================ 输入解析 ============================ */
  function parseNums(str, name, opt) {
    const o = Object.assign({ maxLen: 8, allowEmpty: false, sorted: false }, opt);
    const t = String(str).trim();
    if (!t) {
      if (o.allowEmpty) return [];
      throw new Error(`${name} 不能为空`);
    }
    const arr = t.split(/[\s,，]+/).filter(Boolean).map((p) => {
      if (!/^-?\d{1,3}$/.test(p) || +p < -99 || +p > 999) {
        throw new Error(`${name} 中的 “${p}” 不是 -99 ~ 999 之间的整数`);
      }
      return Number(p);
    });
    if (arr.length > o.maxLen) throw new Error(`${name} 最多 ${o.maxLen} 个元素`);
    if (o.sorted) {
      for (let i = 1; i < arr.length; i++) {
        if (arr[i] < arr[i - 1]) throw new Error(`${name} 必须是非递减有序的`);
      }
    }
    return arr;
  }

  /* ============================ 绘图：数组 ============================ */
  const CELL = 44;
  const GAP = 6;
  const cellX = (x0, i) => x0 + i * (CELL + GAP);

  function drawArray(svg, o) {
    if (o.label) {
      s('text', {
        x: o.labelX != null ? o.labelX : o.x0 - 14, y: o.y + CELL / 2, class: 'av-rowlabel',
        'text-anchor': 'end', 'dominant-baseline': 'central', text: o.label,
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
      s('text', { x: x + CELL / 2, y: o.y + CELL + 14, class: 'av-idx', 'text-anchor': 'middle', text: i }, svg);
    });
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
  const NW = 66; // 节点总宽
  const NH = 38; // 节点高
  const VW = 44; // 数据域宽（剩余为指针域）

  function drawList(svg, o, id) {
    const byId = {};
    o.nodes.forEach((n) => (byId[n.id] = n));
    if (o.nullNode) {
      const u = o.nullNode;
      byId.null = { x: u.x, y: u.y, w: 52 };
      const g = s('g', { class: 'av-nullbox' }, svg);
      s('rect', { x: u.x, y: u.y, width: 52, height: NH, rx: 7 }, g);
      s('text', {
        x: u.x + 26, y: u.y + NH / 2,
        'text-anchor': 'middle', 'dominant-baseline': 'central', text: 'NULL',
      }, g);
    }

    o.nodes.forEach((n) => {
      const g = s('g', { class: 'av-node ' + (n.cls || '') }, svg);
      s('rect', { x: n.x, y: n.y, width: NW, height: NH, rx: 7 }, g);
      s('line', { x1: n.x + VW, y1: n.y, x2: n.x + VW, y2: n.y + NH, class: 'av-sep' }, g);
      s('text', {
        x: n.x + VW / 2, y: n.y + NH / 2, class: 'av-val',
        'text-anchor': 'middle', 'dominant-baseline': 'central', text: n.val,
      }, g);
      if (n.next == null) {
        // 指针域画斜线：经典的 NULL 记法
        s('line', { x1: n.x + VW + 5, y1: n.y + NH - 6, x2: n.x + NW - 5, y2: n.y + 6, class: 'av-null' }, g);
      }
      if (n.tag) {
        s('text', { x: n.x + NW / 2, y: n.y + NH + 15, class: 'av-tag', 'text-anchor': 'middle', text: n.tag }, svg);
      }
    });

    o.nodes.forEach((n) => {
      if (n.next == null) return;
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
        // 指向左侧：从下方绕一条弧线
        const tx = t.x + VW / 2;
        const ty = t.y + NH + 1;
        const dy = 24 + Math.abs(sx - tx) * 0.1;
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
    (f.arrays || []).forEach((a) => drawArray(svg, a));
    if (f.list) drawList(svg, f.list, id);
  }

  /* ============================ 播放器 ============================ */
  function Player(root, cfg) {
    const id = 'av' + ++uid;
    root.classList.add('av');
    root.setAttribute('tabindex', '0');

    let mode = cfg.modes ? cfg.modes[0].key : null;
    let frames = [];
    let idx = 0;
    let timer = null;
    let speed = 1100;

    // 标题与模式切换
    const head = h('div', { class: 'av-head' }, [h('span', { class: 'av-title', text: cfg.title })]);
    const modeBtns = [];
    const inputs = {};
    if (cfg.modes) {
      const group = h('div', { class: 'av-modes' });
      cfg.modes.forEach((m) => {
        const b = h('button', {
          type: 'button', class: 'av-mode', text: m.label,
          onclick: () => {
            mode = m.key;
            if (m.presets) for (const k in m.presets) inputs[k].value = m.presets[k];
            rebuild();
          },
        });
        b.dataset.key = m.key;
        modeBtns.push(b);
        group.appendChild(b);
      });
      head.appendChild(group);
    }

    // 输入区
    const form = h('form', { class: 'av-inputs' });
    cfg.inputs.forEach((inp) => {
      const el = h('input', { type: 'text', value: inp.value, spellcheck: 'false', autocomplete: 'off', placeholder: inp.placeholder || '' });
      if (inp.width) el.style.width = inp.width + 'px';
      inputs[inp.key] = el;
      form.appendChild(h('label', { class: 'av-field' }, [h('span', { text: inp.label }), el]));
    });
    form.appendChild(h('button', { type: 'submit', class: 'av-btn av-primary', text: '应用' }));
    if (cfg.random) {
      form.appendChild(h('button', {
        type: 'button', class: 'av-btn', text: '随机',
        onclick: () => {
          const r = cfg.random(mode);
          for (const k in r) inputs[k].value = r[k];
          rebuild();
        },
      }));
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); rebuild(); });
    const err = h('div', { class: 'av-error' });
    err.hidden = true;

    // 舞台
    const svg = s('svg', { class: 'av-svg', role: 'img', 'aria-label': cfg.title });
    const stage = h('div', { class: 'av-stage' }, [svg]);
    const legend = cfg.legend
      ? h('div', { class: 'av-legend' }, cfg.legend.map(([cls, text]) =>
        h('span', { class: 'av-legend-item' }, [h('i', { class: 'av-swatch ' + cls }), h('span', { text })])))
      : null;
    const vars = h('div', { class: 'av-vars' });
    const caption = h('div', { class: 'av-caption' });

    // 控制条
    const btnFirst = h('button', { type: 'button', class: 'av-btn av-icon', title: '回到开头', text: '⏮', onclick: () => { stop(); go(0); } });
    const btnPrev = h('button', { type: 'button', class: 'av-btn av-icon', title: '上一步（←）', text: '◀', onclick: () => { stop(); go(idx - 1); } });
    const btnPlay = h('button', { type: 'button', class: 'av-btn av-icon av-primary', title: '播放 / 暂停（空格）', text: '▶', onclick: () => (timer ? stop() : play()) });
    const btnNext = h('button', { type: 'button', class: 'av-btn av-icon', title: '下一步（→）', text: '▶|', onclick: () => { stop(); go(idx + 1); } });
    const progress = h('input', { type: 'range', class: 'av-progress', min: 0, max: 0, value: 0, 'aria-label': '进度' });
    progress.addEventListener('input', () => { stop(); go(+progress.value); });
    const stepLabel = h('span', { class: 'av-step' });
    const speedSel = h('select', { class: 'av-speed', title: '播放速度' }, [
      h('option', { value: 1800, text: '0.5×' }),
      h('option', { value: 1100, text: '1×' }),
      h('option', { value: 550, text: '2×' }),
    ]);
    speedSel.value = String(speed);
    speedSel.addEventListener('change', () => {
      speed = +speedSel.value;
      if (timer) { stop(); play(); }
    });
    const controls = h('div', { class: 'av-controls' }, [btnFirst, btnPrev, btnPlay, btnNext, progress, stepLabel, speedSel]);

    const code = h('div', { class: 'av-code' });

    root.append(head, form, err, stage);
    if (legend) root.append(legend);
    root.append(vars, caption, controls, code);

    root.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return; // 文本框、进度条、下拉框保留原生行为
      if (e.key === ' ' && t.tagName === 'BUTTON') return;        // 按钮上的空格交给按钮自己
      if (e.key === 'ArrowRight') { stop(); go(idx + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { stop(); go(idx - 1); e.preventDefault(); }
      else if (e.key === ' ') { timer ? stop() : play(); e.preventDefault(); }
    });

    function renderCode(lines) {
      code.innerHTML = '';
      lines.forEach((ln) => {
        const row = h('div', { class: 'av-line' });
        const ci = ln.indexOf('//');
        if (ci >= 0) {
          row.appendChild(document.createTextNode(ln.slice(0, ci)));
          row.appendChild(h('span', { class: 'av-cm', text: ln.slice(ci) }));
        } else {
          row.textContent = ln || ' ';
        }
        code.appendChild(row);
      });
    }

    function rebuild() {
      stop();
      const vals = {};
      for (const k in inputs) vals[k] = inputs[k].value;
      let res;
      try {
        res = cfg.build(vals, mode);
      } catch (e) {
        err.textContent = '⚠ ' + e.message;
        err.hidden = false;
        return;
      }
      err.hidden = true;
      frames = res.frames;
      svg.setAttribute('viewBox', `0 0 ${res.view.w} ${res.view.h}`);
      svg.style.maxWidth = Math.round(res.view.w * 1.1) + 'px';
      renderCode(res.code);
      modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.key === mode));
      progress.max = frames.length - 1;
      go(0);
    }

    function go(i) {
      idx = Math.max(0, Math.min(frames.length - 1, i));
      const f = frames[idx];
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      render(svg, f, id);
      caption.innerHTML = f.caption; // 文本由程序生成，数值均已校验为整数
      vars.innerHTML = '';
      (f.vars || []).forEach((v) => {
        vars.appendChild(h('span', { class: `av-var av-c-${v.color || 'gray'}` }, [
          h('b', { text: v.name }), document.createTextNode(' ' + v.value),
        ]));
      });
      const hl = [].concat(f.line == null ? [] : f.line);
      [...code.children].forEach((row, k) => row.classList.toggle('active', hl.includes(k)));
      progress.value = idx;
      stepLabel.textContent = `${idx + 1} / ${frames.length}`;
      btnFirst.disabled = btnPrev.disabled = idx === 0;
      btnNext.disabled = idx === frames.length - 1;
    }

    function play() {
      if (idx >= frames.length - 1) go(0);
      btnPlay.textContent = '❚❚';
      timer = setInterval(() => {
        if (idx >= frames.length - 1) stop();
        else go(idx + 1);
      }, speed);
    }

    function stop() {
      clearInterval(timer);
      timer = null;
      btnPlay.textContent = '▶';
    }

    rebuild();
  }

  /* ============================ 场景定义 ============================ */
  const NULLV = 'NULL';
  const SC = {};

  /* ---------- 1. 移除元素 ---------- */
  SC.remove = {
    title: '27. 移除元素 · 读写分离双指针',
    inputs: [
      { key: 'nums', label: 'nums', value: '0, 1, 2, 2, 3, 0, 4, 2', width: 190 },
      { key: 'val', label: 'val', value: '2', width: 56 },
    ],
    legend: [['kept', '[0, left) 已保留'], ['garbage', '已读过、可被覆盖'], ['', '待读取']],
    random() {
      const a = randArr(rand(6, 9), 0, 4);
      return { nums: a.join(', '), val: String(a[rand(0, a.length - 1)]) };
    },
    build(v) {
      const a = parseNums(v.nums, 'nums', { maxLen: 10 });
      const valArr = parseNums(v.val, 'val', { maxLen: 1 });
      const val = valArr[0];
      const n = a.length;
      const x0 = 40;
      const frames = [];
      const code = [
        'int left = 0;',
        'for (int right = 0; right < numsSize; right++)',
        '    if (nums[right] != val)',
        '        nums[left++] = nums[right];',
        'return left;',
      ];
      const snap = (left, right, line, caption, mark) => {
        const cls = a.map((_, i) => (i < left ? 'kept' : i < right ? 'garbage' : ''));
        if (mark) for (const k in mark) cls[k] += ' ' + mark[k];
        frames.push({
          line, caption,
          arrays: [{
            x0, y: 46, values: a.slice(), cls,
            pointers: [
              { name: 'left', idx: left, side: 'top', color: 'blue' },
              { name: 'right', idx: right, side: 'bottom', color: 'orange' },
            ],
          }],
          vars: [
            { name: 'left', value: '= ' + left, color: 'blue' },
            { name: 'right', value: '= ' + right, color: 'orange' },
            { name: 'val', value: '= ' + val },
          ],
        });
      };
      let left = 0;
      snap(0, 0, 0, '<b>left</b> 是写指针（下一个保留元素放哪），<b>right</b> 是读指针（逐个扫描）。');
      for (let right = 0; right < n; right++) {
        const x = a[right];
        if (x !== val) {
          snap(left, right, 2, `nums[right] = ${x} ≠ ${val}，需要保留。`, { [right]: 'active' });
          const self = left === right;
          a[left] = x;
          left++;
          snap(left, right, 3, self
            ? `写到 nums[${left - 1}]：此时 left == right，相当于自己拷给自己；left 后移。`
            : `把 ${x} 写到 nums[${left - 1}]，left 后移。被覆盖的位置之前已经读过，不会丢数据。`,
            { [left - 1]: 'written' });
        } else {
          snap(left, right, 2, `nums[right] = ${x} == val，跳过：只有 right 前进，left 不动。`, { [right]: 'active' });
        }
      }
      snap(left, n, 4, `扫描结束，返回 <b>k = left = ${left}</b>。前 ${left} 个位置就是结果，后面的内容无关紧要。`);
      return { frames, code, view: { w: x0 + Math.max(n + 1, 7) * (CELL + GAP) + 24, h: 160 } };
    },
  };

  /* ---------- 2. 合并两个有序数组 ---------- */
  SC.merge = {
    title: '88. 合并两个有序数组',
    modes: [{ key: 'back', label: '从后往前（正确）' }, { key: 'front', label: '从前往后（会覆盖）' }],
    inputs: [
      { key: 'a', label: 'nums1 前 m 个', value: '1, 4, 7', width: 130 },
      { key: 'b', label: 'nums2', value: '2, 5, 6', width: 130 },
    ],
    legend: [['', '未读'], ['done', '已归位'], ['garbage', '已读过 / 已取走'], ['empty', '空位'], ['lost', '未读就被覆盖']],
    random() {
      const sort = (x) => x.sort((p, q) => p - q);
      return { a: sort(randArr(rand(2, 5), 0, 9)).join(', '), b: sort(randArr(rand(2, 4), 0, 9)).join(', ') };
    },
    build(v, mode) {
      const A = parseNums(v.a, 'nums1', { maxLen: 6, sorted: true, allowEmpty: true });
      const B = parseNums(v.b, 'nums2', { maxLen: 6, sorted: true, allowEmpty: true });
      if (!A.length && !B.length) throw new Error('两个数组不能同时为空');
      const m = A.length;
      const n = B.length;
      const a = A.concat(Array(n).fill(0));
      const b = B.slice();
      const x0 = 110;
      const labelX = 52;
      const frames = [];
      const view = { w: x0 + Math.max(m + n + 1, 6) * (CELL + GAP) + 24, h: 278 };
      const nm = (k) => (k < 0 ? '越界' : k);

      if (mode === 'back') {
        const code = [
          'int i = m - 1, j = n - 1, k = m + n - 1;',
          'while (i >= 0 && j >= 0) {',
          '    if (nums1[i] > nums2[j]) nums1[k--] = nums1[i--];',
          '    else                     nums1[k--] = nums2[j--];',
          '}',
          'while (j >= 0) nums1[k--] = nums2[j--]; // 只需补 nums2',
        ];
        const snap = (i, j, k, line, caption, mark1, mark2) => {
          const c1 = a.map((_, p) => (p > k ? 'done' : p <= i ? '' : p < m ? 'garbage' : 'empty'));
          const c2 = b.map((_, q) => (q > j ? 'garbage' : ''));
          if (mark1) for (const p in mark1) c1[p] += ' ' + mark1[p];
          if (mark2) for (const q in mark2) c2[q] += ' ' + mark2[q];
          frames.push({
            line, caption,
            arrays: [
              { x0, labelX, y: 44, label: 'nums1', values: a.slice(), cls: c1, pointers: [
                { name: 'k', idx: k, side: 'top', color: 'purple' },
                { name: 'i', idx: i, side: 'bottom', color: 'blue' }] },
              { x0, labelX, y: 172, label: 'nums2', values: b.slice(), cls: c2, pointers: [
                { name: 'j', idx: j, side: 'bottom', color: 'orange' }] },
            ],
            vars: [
              { name: 'i', value: '= ' + i, color: 'blue' },
              { name: 'j', value: '= ' + j, color: 'orange' },
              { name: 'k', value: '= ' + k, color: 'purple' },
              { name: 'k − i', value: `= ${k - i}（= j + 1）`, color: 'green' },
            ],
          });
        };
        let i = m - 1;
        let j = n - 1;
        let k = m + n - 1;
        snap(i, j, k, 0, 'i、j 指向两段有效数据的末尾，k 指向 nums1 的最后一个位置。尾部是空位，往这里写不会破坏任何数据。');
        while (i >= 0 && j >= 0) {
          const takeA = a[i] > b[j];
          snap(i, j, k, takeA ? 2 : 3,
            `比较 nums1[${i}] = ${a[i]} 与 nums2[${j}] = ${b[j]}：${takeA ? a[i] + ' 更大，取 nums1' : (a[i] === b[j] ? '相等，取 nums2' : b[j] + ' 更大，取 nums2')}。`,
            { [i]: 'active' }, { [j]: 'active' });
          if (takeA) { a[k] = a[i]; k--; i--; } else { a[k] = b[j]; k--; j--; }
          snap(i, j, k, takeA ? 2 : 3,
            `写入 nums1[${k + 1}]，k 与${takeA ? ' i ' : ' j '}左移。k − i = ${k - i}${j >= 0 ? ' > 0，写指针仍在未读区右侧' : ''}。`,
            { [k + 1]: 'written' });
        }
        if (j < 0) {
          snap(i, j, k, 5, i >= 0
            ? `j < 0：nums2 已全部归位。此时 k == i，nums1 剩下的 [0, ${i}] 本来就在正确位置，<b>什么都不用做</b>。`
            : 'j < 0：两边都处理完了。');
        } else {
          snap(i, j, k, 5, 'i < 0：nums1 已取完，把 nums2 剩余元素依次拷贝过来。');
          while (j >= 0) {
            a[k] = b[j]; k--; j--;
            snap(i, j, k, 5, `拷贝 nums2[${j + 1}] = ${b[j + 1]} 到 nums1[${k + 1}]。`, { [k + 1]: 'written' });
          }
        }
        frames.push(Object.assign({}, frames[frames.length - 1], {
          line: null,
          caption: `合并完成：[${a.join(', ')}]`,
          arrays: [
            { x0, labelX, y: 44, label: 'nums1', values: a.slice(), cls: a.map(() => 'done'), pointers: [] },
            { x0, labelX, y: 172, label: 'nums2', values: b.slice(), cls: b.map(() => 'garbage'), pointers: [] },
          ],
        }));
        return { frames, code, view };
      }

      // ---- 从前往后：演示覆盖问题 ----
      const code = [
        'int i = 0, j = 0, k = 0;',
        'while (i < m && j < n) {',
        '    if (nums1[i] <= nums2[j]) nums1[k++] = nums1[i++];',
        '    else                      nums1[k++] = nums2[j++];',
        '}',
        'while (j < n) nums1[k++] = nums2[j++];',
      ];
      const snap = (i, j, k, line, caption, mark1, mark2) => {
        const c1 = a.map((_, p) => (p < k ? 'done' : p >= i && p < m ? '' : 'empty'));
        const c2 = b.map((_, q) => (q < j ? 'garbage' : ''));
        if (mark1) for (const p in mark1) c1[p] = mark1[p];
        if (mark2) for (const q in mark2) c2[q] += ' ' + mark2[q];
        frames.push({
          line, caption,
          arrays: [
            { x0, labelX, y: 44, label: 'nums1', values: a.slice(), cls: c1, pointers: [
              { name: 'k', idx: k, side: 'top', color: 'purple' },
              { name: 'i', idx: i, side: 'bottom', color: 'blue' }] },
            { x0, labelX, y: 172, label: 'nums2', values: b.slice(), cls: c2, pointers: [
              { name: 'j', idx: j, side: 'bottom', color: 'orange' }] },
          ],
          vars: [
            { name: 'i', value: '= ' + nm(i), color: 'blue' },
            { name: 'j', value: '= ' + nm(j), color: 'orange' },
            { name: 'k', value: '= ' + nm(k), color: 'purple' },
          ],
        });
      };
      let i = 0;
      let j = 0;
      let k = 0;
      snap(i, j, k, 0, '尝试从前往后：每次取较小者写到 nums1 的前部。问题是——nums1 的前部存着<b>还没读过</b>的数据。');
      while (i < m && j < n) {
        const takeA = a[i] <= b[j];
        snap(i, j, k, takeA ? 2 : 3, `比较 nums1[${i}] = ${a[i]} 与 nums2[${j}] = ${b[j]}，取${takeA ? ' nums1' : ' nums2'}。`,
          { [i]: 'active' }, { [j]: 'active' });
        if (takeA) {
          a[k] = a[i]; k++; i++;
          snap(i, j, k, 2, `写入 nums1[${k - 1}]（此时 k == i，相当于原地不动）。`, { [k - 1]: 'done written' });
        } else if (k < m) {
          const old = a[k];
          a[k] = b[j];
          snap(i, j, k, 3, `<span class="av-bad">nums1[${k}] 原本的 ${old} 还没被读取，就被 nums2[${j}] = ${b[j]} 覆盖了——数据丢失！</span>只要往“未读区”里写，就会出这个问题，所以要改成从后往前。`,
            { [k]: 'lost' });
          return { frames, code, view };
        } else {
          a[k] = b[j]; k++; j++;
          snap(i, j, k, 3, `写入空位 nums1[${k - 1}]，暂时安全。`, { [k - 1]: 'done written' });
        }
      }
      while (j < n) {
        a[k] = b[j]; k++; j++;
        snap(i, j, k, 5, `nums1 已读完，拷贝 nums2[${j - 1}] 到 nums1[${k - 1}]。`, { [k - 1]: 'done written' });
      }
      snap(i, j, k, null, '这组数据<b>碰巧</b>没有发生覆盖（nums2 的元素都不小于 nums1）。换一组 nums2 中有较小元素的数据试试。');
      return { frames, code, view };
    },
  };

  /* ---------- 链表场景的通用工具 ---------- */
  function listFrame(vals, next, opt) {
    // opt: { xs, ys, arrow[], cls[], tags[], pointers[], vars[], nullNode, line, caption }
    return {
      line: opt.line,
      caption: opt.caption,
      list: {
        nodes: vals.map((val, i) => ({
          id: i, val, x: opt.xs[i], y: opt.ys[i], next: next[i],
          arrow: (opt.arrow && opt.arrow[i]) || 'default',
          cls: (opt.cls && opt.cls[i]) || '',
          tag: opt.tags && opt.tags[i],
        })),
        nullNode: opt.nullNode,
        pointers: opt.pointers || [],
      },
      vars: opt.vars || [],
    };
  }
  const ptrVal = (vals, t) => (t == null || t === 'null' ? '= ' + NULLV : '→ ' + vals[t]);

  /* ---------- 3. 反转链表 ---------- */
  SC.reverse = {
    title: '206. 反转链表 · prev / cur / next 三指针',
    inputs: [{ key: 'list', label: '链表', value: '1, 2, 3, 4, 5' }],
    legend: [['done', '已反转部分（以 prev 为头）'], ['focus', '当前节点 cur'], ['', '未处理部分（被 next 抓住）']],
    random: () => ({ list: randArr(rand(4, 6), 1, 9).join(', ') }),
    build(v) {
      const vals = parseNums(v.list, '链表', { maxLen: 8 });
      const n = vals.length;
      const next = vals.map((_, i) => (i + 1 < n ? i + 1 : null));
      const arrow = vals.map(() => 'default');
      const xs = vals.map((_, i) => 24 + i * 100);
      const ys = vals.map(() => 56);
      const nullNode = { x: 24 + n * 100, y: 56 };
      const frames = [];
      const code = [
        'ListNode *prev = NULL, *cur = head;',
        'while (cur) {',
        '    ListNode *next = cur->next; // ① 先存后继',
        '    cur->next = prev;           // ② 掉头',
        '    prev = cur;                 // ③ prev 前进',
        '    cur = next;                 // ④ cur 前进',
        '}',
        'return prev;',
      ];
      let prev = null;
      let cur = 0;
      let nx;
      const snap = (line, caption, o = {}) => {
        const cls = vals.map((_, i) => (arrow[i] === 'rev' ? 'done' : ''));
        if (cur != null) cls[cur] = (cls[cur] + ' focus').trim();
        const ptrs = o.ptrs || [
          { name: 'prev', target: prev, color: 'blue' },
          { name: 'cur', target: cur == null ? 'null' : cur, color: 'orange' },
        ].concat(o.showNext ? [{ name: 'next', target: nx == null ? 'null' : nx, color: 'purple' }] : []);
        const ar = arrow.slice();
        if (o.hot != null) ar[o.hot] = 'hot';
        frames.push(listFrame(vals, next, {
          xs, ys, nullNode, arrow: ar, cls, line, caption,
          pointers: ptrs,
          vars: ptrs.map((p) => ({ name: p.name, value: ptrVal(vals, p.target), color: p.color })),
        }));
      };
      snap(0, 'prev 初始化为 NULL（它将成为新链表的尾），cur 从 head 出发。', {
        ptrs: [{ name: 'head', target: 0, color: 'gray' }, { name: 'prev', target: null, color: 'blue' }, { name: 'cur', target: 0, color: 'orange' }],
      });
      while (cur != null) {
        nx = next[cur];
        snap(2, `① cur 非空，先用 next 记住 cur 的后继${nx == null ? '（已经是 NULL）' : ` ${vals[nx]}`}。一旦改了 cur->next，这就是找回剩余链表的唯一线索。`, { showNext: true });
        next[cur] = prev;
        arrow[cur] = 'rev';
        snap(3, `② cur->next = prev：节点 ${vals[cur]} 改为指向 ${prev == null ? 'NULL' : vals[prev]}。${nx == null ? '' : `它与 ${vals[nx]} 之间的链断了，但剩余部分仍被 next 抓着。`}`, { showNext: true, hot: cur });
        prev = cur;
        snap(4, `③ prev = cur：已反转部分的头变成 ${vals[prev]}。`, { showNext: true });
        cur = nx;
        snap(5, cur == null
          ? '④ cur = next = NULL。如果把“存后继”放在循环末尾，这里还得判断 next 是否为空，否则会对 NULL 解引用。'
          : `④ cur = next：轮到节点 ${vals[cur]}。`, { showNext: true });
      }
      snap(1, 'cur 为 NULL，循环结束。');
      const order = [];
      for (let p = prev; p != null; p = next[p]) order.push(vals[p]);
      cur = null;
      snap(7, `返回 prev：${order.join(' → ')} → NULL`, {
        ptrs: [{ name: 'newHead', target: prev, color: 'green' }],
      });
      return { frames, code, view: { w: 24 + Math.max(n + 1, 6) * 100, h: 150 } };
    },
  };

  /* ---------- 4. 链表的中间结点 ---------- */
  SC.middle = {
    title: '876. 链表的中间结点 · 快慢指针',
    modes: [
      { key: 'odd', label: '奇数长度', presets: { list: '1, 2, 3, 4, 5' } },
      { key: 'even', label: '偶数长度', presets: { list: '1, 2, 3, 4, 5, 6' } },
    ],
    inputs: [{ key: 'list', label: '链表', value: '1, 2, 3, 4, 5', width: 180 }],
    legend: [['done', '最终中间结点 slow'], ['focus', '当前 fast / slow 所在位置']],
    random(mode) {
      const len = mode === 'even' ? rand(2, 4) * 2 : rand(1, 3) * 2 + 1;
      return { list: randArr(len, 1, 9).join(', ') };
    },
    build(v) {
      const vals = parseNums(v.list, '链表', { maxLen: 8 });
      const n = vals.length;
      const next = vals.map((_, i) => (i + 1 < n ? i + 1 : null));
      const xs = vals.map((_, i) => 24 + i * 96);
      const ys = vals.map(() => 56);
      const nullNode = { x: 24 + n * 96, y: 56 };
      const frames = [];
      const code = [
        'ListNode *slow = head, *fast = head;',
        'while (fast != NULL && fast->next != NULL) { // 顺序不能颠倒',
        '    slow = slow->next;       // 慢指针走 1 步',
        '    fast = fast->next->next; // 快指针走 2 步',
        '}',
        'return slow;',
      ];
      let slow = 0;
      let fast = 0;
      let step = 0;
      const snap = (line, caption, done) => {
        const cls = vals.map((_, i) => (done && i === slow ? 'done' : (i === slow || i === fast ? 'focus' : '')));
        const ptrs = [
          { name: 'slow', target: slow, color: 'blue' },
          { name: 'fast', target: fast == null ? 'null' : fast, color: 'orange' },
        ];
        frames.push(listFrame(vals, next, {
          xs, ys, cls, nullNode, line, caption, pointers: ptrs,
          vars: [
            { name: 'slow', value: `→ 第 ${slow + 1} 个 (${vals[slow]})`, color: 'blue' },
            { name: 'fast', value: fast == null ? '= NULL' : `→ 第 ${fast + 1} 个 (${vals[fast]})`, color: 'orange' },
            { name: '轮数 t', value: '= ' + step, color: 'green' },
          ],
        }));
      };
      snap(0, 'slow、fast 同时从 head 出发。每轮 slow 走 1 步、fast 走 2 步，位移始终保持 1 : 2。');
      while (fast != null && next[fast] != null) {
        snap(1, `检查循环条件：fast 非空且 fast->next（${vals[next[fast]]}）非空，继续前进。`);
        slow = next[slow];
        fast = next[next[fast]];
        step++;
        snap([2, 3], `第 ${step} 轮：slow 走 1 步到 ${vals[slow]}，fast 走 2 步${fast == null ? '跨过尾节点到达 NULL' : `到 ${vals[fast]}`}。`);
      }
      snap(5, fast == null
        ? `链表共 ${n} 个节点（偶数）：<b>fast 停在 NULL</b>，由 && 短路求值直接结束循环（若把 fast->next 写前面就会对 NULL 解引用！），slow 停在第二个中间结点 <b>${vals[slow]}</b>。`
        : `链表共 ${n} 个节点（奇数）：<b>fast 停在尾节点 ${vals[fast]}</b>（fast->next 为 NULL），循环结束，slow 恰好停在正中间的 <b>${vals[slow]}</b>。`, true);
      return { frames, code, view: { w: 24 + (n + 1) * 96, h: 136 } };
    },
  };

  /* ---------- 5. 回文链表 ---------- */
  SC.palindrome = {
    title: '链表的回文结构 · 找中点 + 反转后半 + 双向比较',
    inputs: [{ key: 'list', label: '链表', value: '1, 2, 3, 2, 1' }],
    legend: [['done', '反转后的后半段'], ['match', '比较相等'], ['bad', '比较不等']],
    random() {
      const len = rand(4, 7);
      const half = randArr(Math.ceil(len / 2), 1, 5);
      let arr = half.concat(half.slice(0, Math.floor(len / 2)).reverse());
      if (Math.random() < 0.4) arr[rand(0, len - 1)] = rand(1, 9);
      return { list: arr.join(', ') };
    },
    build(v) {
      const vals = parseNums(v.list, '链表', { maxLen: 8 });
      const n = vals.length;
      const next = vals.map((_, i) => (i + 1 < n ? i + 1 : null));
      const arrow = vals.map(() => 'default');
      const xs = vals.map((_, i) => 24 + i * 100);
      const ys = vals.map(() => 56);
      const frames = [];
      const code = [
        '// ① 快慢指针找中点',
        'while (fast && fast->next) { slow = slow->next; fast = fast->next->next; }',
        '// ② 反转从 mid 开始的后半段',
        'ListNode *p2 = reverseList(mid), *p1 = A;',
        '// ③ 两头往中间比较',
        'while (p1 && p2) {',
        '    if (p1->val != p2->val) return false;',
        '    p1 = p1->next; p2 = p2->next;',
        '}',
        'return true;',
      ];
      const snap = (line, caption, ptrs, extra = {}) => {
        const cls = vals.map((_, i) => (arrow[i] === 'rev' ? 'done' : ''));
        (extra.match || []).forEach((i) => (cls[i] += ' match'));
        (extra.bad || []).forEach((i) => (cls[i] += ' bad'));
        const ar = arrow.slice();
        if (extra.hot != null) ar[extra.hot] = 'hot';
        frames.push(listFrame(vals, next, {
          xs, ys, arrow: ar, cls, line, caption, pointers: ptrs,
          vars: ptrs.map((p) => ({ name: p.name, value: ptrVal(vals, p.target), color: p.color })),
        }));
      };
      // ① 快慢指针
      let slow = 0;
      let fast = 0;
      const sf = () => [{ name: 'slow', target: slow, color: 'blue' }, { name: 'fast', target: fast, color: 'orange' }];
      snap(1, '<b>① 找中点</b>：slow、fast 都从头出发，slow 每次走 1 步，fast 每次走 2 步。', sf());
      while (fast != null && next[fast] != null) {
        slow = next[slow];
        fast = next[next[fast]];
        snap(1, `slow 走 1 步，fast 走 2 步。${fast == null ? 'fast 变成 NULL。' : ''}`, sf());
      }
      const mid = slow;
      snap(1, `${fast == null ? 'fast 为 NULL（偶数个节点）' : 'fast->next 为 NULL（奇数个节点）'}，循环结束，slow 停在中间结点 mid = ${vals[mid]}（第 ${mid + 1} 个）。`, sf());
      // ② 反转后半段
      let prev = null;
      let cur = mid;
      while (cur != null) {
        const nx = next[cur];
        next[cur] = prev;
        arrow[cur] = 'rev';
        snap(3, `<b>② 反转后半段</b>：节点 ${vals[cur]} 改为指向 ${prev == null ? 'NULL' : vals[prev]}。`, [
          { name: 'mid', target: mid, color: 'gray' }, { name: 'cur', target: cur, color: 'purple' }], { hot: cur });
        prev = cur;
        cur = nx;
      }
      let p1 = 0;
      let p2 = prev;
      const pp = () => [{ name: 'p1', target: p1, color: 'blue' }, { name: 'p2', target: p2, color: 'orange' }];
      snap(3, mid > 0
        ? `反转完成。注意前半段末尾的 ${vals[mid - 1]} <b>仍指向 ${vals[mid]}</b>，而 ${vals[mid]} 现在是反转链的尾巴（→ NULL）：两条链都在 mid 处收尾，所以奇偶长度都不用特判。`
        : '只有一个节点，反转后仍是它自己。', pp());
      // ③ 比较
      const matched = [];
      while (p1 != null && p2 != null) {
        if (vals[p1] !== vals[p2]) {
          snap(6, `<b>③ 比较</b>：p1->val = ${vals[p1]} ≠ p2->val = ${vals[p2]}，<span class="av-bad">不是回文，返回 false</span>。`, pp(), { match: matched, bad: [p1, p2] });
          return { frames, code, view: { w: 24 + Math.max(n, 5) * 100, h: 150 } };
        }
        matched.push(p1, p2);
        snap(6, `<b>③ 比较</b>：p1->val == p2->val == ${vals[p1]}${p1 === p2 ? '（奇数长度时，最后是 mid 和自己比较）' : ''}，两者各走一步。`, pp(), { match: matched });
        p1 = next[p1];
        p2 = next[p2];
      }
      snap(9, `p2 走到 NULL，所有对称位置都相等：<span class="av-good">是回文，返回 true</span>。`, pp(), { match: matched });
      return { frames, code, view: { w: 24 + Math.max(n, 5) * 100, h: 150 } };
    },
  };

  /* ---------- 5. 相交链表 ---------- */
  SC.intersect = {
    title: '160. 相交链表 · 先对齐长度差，再同步前进',
    inputs: [
      { key: 'a', label: 'A 独有', value: '4, 1', width: 105 },
      { key: 'b', label: 'B 独有', value: '5, 6, 1', width: 105 },
      { key: 'c', label: '公共部分', value: '8, 4, 5', placeholder: '留空 = 不相交', width: 115 },
    ],
    legend: [['shared', '公共节点'], ['focus', '指针所在节点']],
    random: () => ({
      a: randArr(rand(1, 3), 1, 9).join(', '),
      b: randArr(rand(1, 4), 1, 9).join(', '),
      c: Math.random() < 0.85 ? randArr(rand(1, 3), 1, 9).join(', ') : '',
    }),
    build(v) {
      const au = parseNums(v.a, 'A 独有部分', { maxLen: 5, allowEmpty: true });
      const bu = parseNums(v.b, 'B 独有部分', { maxLen: 5, allowEmpty: true });
      const cm = parseNums(v.c, '公共部分', { maxLen: 4, allowEmpty: true });
      if (!au.length && !cm.length) throw new Error('链表 A 不能为空');
      if (!bu.length && !cm.length) throw new Error('链表 B 不能为空');
      const a = au.length;
      const b = bu.length;
      const c = cm.length;
      const vals = [].concat(au, bu, cm);
      const tags = [].concat(au.map((_, i) => 'a' + (i + 1)), bu.map((_, i) => 'b' + (i + 1)), cm.map((_, i) => 'c' + (i + 1)));
      const ia = (i) => i;
      const ib = (i) => a + i;
      const ic = (i) => a + b + i;
      const SP = 92;
      const X0 = 20;
      const YA = 46;
      const YC = 150;
      const YB = c ? 254 : 150;
      const M = c ? Math.max(a, b) : 0;
      const xs = [];
      const ys = [];
      const next = [];
      au.forEach((_, i) => { xs[ia(i)] = X0 + (M - a + i) * SP; ys[ia(i)] = YA; next[ia(i)] = i + 1 < a ? ia(i + 1) : c ? ic(0) : null; });
      bu.forEach((_, i) => { xs[ib(i)] = X0 + (M - b + i) * SP; ys[ib(i)] = YB; next[ib(i)] = i + 1 < b ? ib(i + 1) : c ? ic(0) : null; });
      cm.forEach((_, i) => { xs[ic(i)] = X0 + (M + i) * SP; ys[ic(i)] = YC; next[ic(i)] = i + 1 < c ? ic(i + 1) : null; });
      const width = X0 + (c ? M + c : Math.max(a, b)) * SP + 20;
      const view = { w: Math.max(width, 420), h: YB + NH + 26 };
      const headA = a ? ia(0) : ic(0);
      const headB = b ? ib(0) : ic(0);
      const code = [
        '// ① 走到尾，顺便计数',
        'while (curA->next) { curA = curA->next; lenA++; }',
        'while (curB->next) { curB = curB->next; lenB++; }',
        'if (curA != curB) return NULL;   // 尾不同 → 不相交',
        '// ② 长链表先走 |lenA - lenB| 步',
        'for (int i = 0; i < gap; i++) longL = longL->next;',
        '// ③ 同步前进，第一次相遇即交点',
        'while (longL != shortL) { longL = longL->next; shortL = shortL->next; }',
        'return longL;',
      ];
      const frames = [];
      const snap = (line, caption, ptrs, o = {}) => {
        const cls = vals.map((_, i) => (o.shared && i >= a + b ? 'shared' : ''));
        ptrs.forEach((p) => { if (p.target != null) cls[p.target] = (cls[p.target] + ' focus').trim(); });
        frames.push(listFrame(vals, next, {
          xs, ys, tags, cls, line, caption, pointers: ptrs,
          vars: ptrs.map((p) => ({ name: p.name, value: p.target == null ? '= NULL' : `→ ${tags[p.target]}（${vals[p.target]}）`, color: p.color }))
            .concat(o.vars || []),
        }));
      };
      // ① 计数
      let curA = headA;
      let curB = headB;
      let lenA = 1;
      let lenB = 1;
      const lens = () => [{ name: 'lenA', value: '= ' + lenA, color: 'blue' }, { name: 'lenB', value: '= ' + lenB, color: 'orange' }];
      snap(1, '<b>① 找尾 + 计数</b>：curA 从 A 的头出发，lenA = 1。', [{ name: 'curA', target: curA, color: 'blue' }], { vars: lens() });
      while (next[curA] != null) {
        curA = next[curA]; lenA++;
        snap(1, `curA 前进，lenA = ${lenA}${next[curA] == null ? '，到达 A 的尾节点' : ''}。`, [{ name: 'curA', target: curA, color: 'blue' }], { vars: lens() });
      }
      const both = () => [{ name: 'curA', target: curA, color: 'blue' }, { name: 'curB', target: curB, color: 'orange' }];
      snap(2, 'curB 从 B 的头出发，lenB = 1。', both(), { vars: lens() });
      while (next[curB] != null) {
        curB = next[curB]; lenB++;
        snap(2, `curB 前进，lenB = ${lenB}${next[curB] == null ? '，到达 B 的尾节点' : ''}。`, both(), { vars: lens() });
      }
      if (curA !== curB) {
        snap(3, `尾节点 ${tags[curA]} 与 ${tags[curB]} 不是同一个节点 → <span class="av-bad">不相交，返回 NULL</span>。相交链表必然共用尾巴（Y 型）。`, both(), { vars: lens() });
        return { frames, code, view };
      }
      snap(3, `两个尾节点是<b>同一个节点</b> ${tags[curA]} → 一定相交。接下来找第一个公共节点。`, both(), { shared: true, vars: lens() });
      // ② 对齐
      const gap = Math.abs(lenA - lenB);
      let longL = lenA >= lenB ? headA : headB;
      let shortL = lenA >= lenB ? headB : headA;
      const lname = lenA >= lenB ? 'A' : 'B';
      const ls = () => [{ name: 'long', target: longL, color: 'purple' }, { name: 'short', target: shortL, color: 'green' }];
      const gv = [{ name: 'gap', value: '= ' + gap, color: 'gray' }];
      snap(5, `<b>② 对齐</b>：lenA = ${lenA}，lenB = ${lenB}，长度差全部来自交点之前。${gap ? `让长链表 ${lname} 的指针先走 ${gap} 步。` : '两者等长，无需先走。'}`, ls(), { shared: true, vars: gv });
      for (let i = 0; i < gap; i++) {
        longL = next[longL];
        snap(5, `long 先走第 ${i + 1} / ${gap} 步。`, ls(), { shared: true, vars: gv });
      }
      snap(7, '<b>③ 同步前进</b>：现在 long 与 short 到交点的距离相等。', ls(), { shared: true, vars: gv });
      while (longL !== shortL) {
        const sameVal = vals[longL] === vals[shortL];
        snap(7, `${tags[longL]} 与 ${tags[shortL]} 不是同一个节点${sameVal ? `（值都是 ${vals[longL]}，但地址不同——比较的是地址而不是值）` : ''}，两者各走一步。`, ls(), { shared: true, vars: gv });
        longL = next[longL];
        shortL = next[shortL];
      }
      snap(8, `long == short，相遇于 <b>${tags[longL]}</b>（值 ${vals[longL]}），这就是第一个公共节点。`, ls(), { shared: true, vars: gv });
      return { frames, code, view };
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
