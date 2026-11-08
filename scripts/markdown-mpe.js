'use strict';

const container = require('markdown-it-container');

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
