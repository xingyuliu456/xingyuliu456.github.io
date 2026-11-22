'use strict';

/**
 * 首页分类封面配置（分类名 -> 封面图片链接，一对一精确匹配）
 * 每次新增分类时，直接在这里加一行 `'分类名': '图片链接',` 即可。
 */
const CATEGORY_COVERS = {
  '算法与数据结构': 'https://images.unsplash.com/photo-1644175283511-f72f5cedc9de?auto=format&fit=crop&w=1200&h=675&q=80',
  '离散数学2': 'https://img2.baidu.com/it/u=3085931495,3356206665&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=500',
  '概率论': 'https://i1.hdslb.com/bfs/archive/4b0724f0966818d3eb9e55f1e90bf4eff6ca2acd.jpg',
  '计算机组成': 'https://images.unsplash.com/photo-1728042153273-8f9eefe78590?auto=format&fit=crop&w=1200&h=675&q=80',
  '基础物理学B': 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1200&h=675&q=80',
  'git': 'https://images.unsplash.com/photo-1587620962725-abab7fe55159?auto=format&fit=crop&w=1200&h=675&q=80',
  '随笔': 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&h=675&q=80'
};

/**
 * 未在 CATEGORY_COVERS 中配置时的统一兜底封面图
 */
const DEFAULT_CATEGORY_COVER = 'https://images.unsplash.com/photo-1763494679040-bb6671eb0067?auto=format&fit=crop&w=1200&h=675&q=80';

/**
 * 可选：分类图标与主题色（不配置时会使用 DEFAULT_CATEGORY_STYLE）
 */
const CATEGORY_STYLES = {
  '算法与数据结构': { icon: 'fas fa-code-branch', accent: '#3b82f6' },
  '离散数学2': { icon: 'fas fa-project-diagram', accent: '#8b5cf6' },
  '概率论': { icon: 'fas fa-project-diagram', accent: '#8b5cf6' },
  '计算机组成': { icon: 'fas fa-microchip', accent: '#6366f1' },
  '基础物理学B': { icon: 'fas fa-atom', accent: '#06b6d4' },
  'git': { icon: 'fab fa-git-alt', accent: '#f97316' },
  '随笔': { icon: 'fas fa-feather-alt', accent: '#ec4899' }
};

const DEFAULT_CATEGORY_STYLE = {
  icon: 'fas fa-layer-group',
  accent: '#3b82f6'
};

/**
 * Resolve icon, accent color, and cover image for a category name.
 * @param {string} name
 * @returns {{ icon: string, accent: string, cover: string }}
 */
function resolveCategoryMeta(name) {
  const key = String(name || '').trim();
  const hasCover = Object.prototype.hasOwnProperty.call(CATEGORY_COVERS, key);
  const hasStyle = Object.prototype.hasOwnProperty.call(CATEGORY_STYLES, key);
  const style = hasStyle ? CATEGORY_STYLES[key] : DEFAULT_CATEGORY_STYLE;

  return {
    icon: style.icon,
    accent: style.accent,
    cover: hasCover ? CATEGORY_COVERS[key] : DEFAULT_CATEGORY_COVER
  };
}

hexo.extend.helper.register('getCategoryMeta', resolveCategoryMeta);

const HOME_CATEGORY_INDEX_PUG = `extends includes/layout.pug

block content
  #recent-posts.recent-posts.nc.category-hub
    - const allCats = site.categories.filter(c => c.length > 0 && !c.parent).sort('-length').toArray()
    if allCats.length > 0
      .category-hub-grid
        each cat in allCats
          - const meta = getCategoryMeta(cat.name)
          - const catPosts = cat.posts.sort('-date').toArray().slice(0, 2)
          .category-hub-card(style=\`--cat-accent: \${meta.accent}\`)
            a.category-hub-cover(href=url_for(cat.path) title=cat.name)
              img.category-hub-cover-img(src=meta.cover alt=cat.name width="1200" height="675" loading="lazy" referrerpolicy="no-referrer")
              span.category-hub-cover-scrim
              span.category-hub-count #{cat.length} 篇
              .category-hub-cover-overlay
                .category-hub-icon
                  i(class=meta.icon)
                .category-hub-head-info
                  h3.category-hub-name= cat.name
            .category-hub-card-body
              .category-hub-post-list
                each post in catPosts
                  a.category-hub-post-item(href=url_for(post.path) title=post.title)
                    span.category-hub-post-dot
                    span.category-hub-post-title= post.title
                    time.category-hub-post-date= date(post.date, 'MM-DD')
    else
      .category-hub-empty 暂无已发布的分类文章
`;

// Priority 20 ensures Butterfly's init.js runs first and views are loaded.
hexo.extend.filter.register('before_generate', () => {
  hexo.theme.setView('index.pug', HOME_CATEGORY_INDEX_PUG);
}, 20);
