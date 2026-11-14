'use strict';

const container = require('markdown-it-container');

function resolvePlugin(mod) {
  return (mod && typeof mod === 'object' && typeof mod.default === 'function')
    ? mod.default
    : mod;
}

let cjkFriendlyPlugin = null;

try {
  cjkFriendlyPlugin = resolvePlugin(require('markdown-it-cjk-friendly'));
} catch (err) {
  if (err && err.code === 'ERR_REQUIRE_ESM') {
    // Fallback for Node < 20.19 where require(esm) is unavailable
    hexo.extend.filter.register('after_init', async function () {
      if (!cjkFriendlyPlugin) {
        const mod = await import('markdown-it-cjk-friendly');
        cjkFriendlyPlugin = resolvePlugin(mod);
      }
    });
  } else {
    throw err;
  }
}

function createContainer(md, type, defaultTitle, icon) {
  md.use(container, type, {
    render: function (tokens, idx) {
      const token = tokens[idx];
      const info = token.info.trim().slice(type.length).trim();
      const title = info || defaultTitle;
      if (token.nesting === 1) {
        return `<div class="custom-block ${type}"><p class="custom-block-title">${icon}<span>${title}</span></p>\n`;
      } else {
        return '</div>\n';
      }
    }
  });
}

// Register MPE-compatible plugin chain via Hexo's markdown-it hook
hexo.extend.filter.register('markdown-it:renderer', function (md) {
  if (md.__mpe_initialized) return;
  md.__mpe_initialized = true;

  // 0. 兼容 CJK 字符与标点相邻时的粗体/斜体边界解析（如 **“...”**、**「...」**）
  if (typeof cjkFriendlyPlugin === 'function') {
    md.use(cjkFriendlyPlugin);
  }

  // 1. MPE 常用排版扩展插件
  md.use(require('markdown-it-sub'))
    .use(require('markdown-it-sup'))
    .use(require('markdown-it-footnote'))
    .use(require('markdown-it-mark'))
    .use(require('markdown-it-ins'))
    .use(require('markdown-it-deflist'))
    .use(require('markdown-it-abbr'))
    .use(require('markdown-it-emoji').full)
    .use(require('markdown-it-task-lists'), { enabled: true, label: true, labelAfter: true });

  // 2. MPE / VitePress 现代容器块 (Callout / Alerts)
  createContainer(md, 'tip', '提示', '<i class="fas fa-lightbulb"></i>');
  createContainer(md, 'info', '信息', '<i class="fas fa-info-circle"></i>');
  createContainer(md, 'note', '说明', '<i class="fas fa-sticky-note"></i>');
  createContainer(md, 'warning', '警告', '<i class="fas fa-exclamation-triangle"></i>');
  createContainer(md, 'danger', '危险', '<i class="fas fa-radiation"></i>');
});
