'use strict';

/**
 * 自定义文章永久链接路径插件
 * 支持在文章 Front-Matter 开头自定义相对路径：
 * 
 * 方式 1：permalink: pointer-tricks (自动补全为 posts/pointer-tricks/)
 * 方式 2：permalink: posts/pointer-tricks (自动保留 posts/pointer-tricks/)
 * 方式 3：abbrlink: pointer-tricks (兼容常见 abbrlink 写法)
 * 
 * 若文章未指定上述任何字段，则自动退回 _config.yml 的默认规则（如 posts/:hash/）
 */
hexo.extend.filter.register('post_permalink', function (data) {
  if (!data || typeof data === 'string') return data;

  const customSlug = data.abbrlink || data.slug_path || data.short_link;

  if (customSlug && !data.__permalink) {
    let clean = String(customSlug).replace(/^\/+|\/+$/g, '');
    if (!clean.startsWith('posts/')) {
      clean = 'posts/' + clean;
    }
    data.__permalink = clean + '/';
  } else if (data.__permalink) {
    let clean = String(data.__permalink).replace(/^\/+|\/+$/g, '');
    if (!clean.startsWith('posts/')) {
      clean = 'posts/' + clean;
    }
    data.__permalink = clean + '/';
  }
}, 5);
