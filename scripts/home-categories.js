'use strict';

/**
 * Category visual metadata table so each topic column has a tailored icon,
 * accent color, and concise subtitle on the homepage directory.
 */
const CATEGORY_PRESETS = [
  {
    keywords: ['算法', '数据结构', 'leetcode'],
    icon: 'fas fa-code-branch',
    accent: '#3b82f6',
    desc: '数据结构、指针思维与经典算法题解',
    cover: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&h=675&q=80'
  },
  {
    keywords: ['离散', '图论', '数学', '微积分', '线代', '概率'],
    icon: 'fas fa-project-diagram',
    accent: '#8b5cf6',
    desc: '定理推导、图论结构与形式化数学思维',
    cover: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=1200&h=675&q=80'
  },
  {
    keywords: ['物理', '力学', '波动', '电磁'],
    icon: 'fas fa-atom',
    accent: '#06b6d4',
    desc: '核心公式速查、物理图像与解题套路',
    cover: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1200&h=675&q=80'
  },
  {
    keywords: ['git', 'linux', 'docker', 'shell', '工程', '工具'],
    icon: 'fab fa-git-alt',
    accent: '#f97316',
    desc: '版本控制、开发工作流与工程实践记录',
    cover: 'https://images.unsplash.com/photo-1587620962725-abab7fe55159?auto=format&fit=crop&w=1200&h=675&q=80'
  },
  {
    keywords: ['具身', '机器人', 'embodied', 'robot', 'ai', '深度', '模型'],
    icon: 'fas fa-robot',
    accent: '#10b981',
    desc: '具身智能、机器人控制与深度学习探索',
    cover: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1200&h=675&q=80'
  },
  {
    keywords: ['随笔', '杂谈', '日记', '生活'],
    icon: 'fas fa-feather-alt',
    accent: '#ec4899',
    desc: '思考随笔、折腾记录与生活碎片',
    cover: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&h=675&q=80'
  }
];

const FALLBACK_PALETTE = ['#3b82f6', '#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b'];
const FALLBACK_COVERS = [
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&h=675&q=80',
  'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?auto=format&fit=crop&w=1200&h=675&q=80',
  'https://images.unsplash.com/photo-1433086966358-54859d0ed716?auto=format&fit=crop&w=1200&h=675&q=80'
];

/**
 * Resolve icon, accent color, cover image, and description for a category name uniformly.
 * @param {string} name
 * @returns {{ icon: string, accent: string, desc: string, cover: string }}
 */
function resolveCategoryMeta(name) {
  const lower = String(name || '').toLowerCase();
  const matched = CATEGORY_PRESETS.find((preset) =>
    preset.keywords.some((kw) => lower.includes(kw))
  );
  if (matched) return matched;

  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = (hash * 31 + lower.charCodeAt(i)) >>> 0;
  }
  return {
    icon: 'fas fa-layer-group',
    accent: FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length],
    desc: '专题学习沉淀与体系化笔记归档',
    cover: FALLBACK_COVERS[hash % FALLBACK_COVERS.length]
  };
}

hexo.extend.helper.register('getCategoryMeta', resolveCategoryMeta);

const HOME_CATEGORY_INDEX_PUG = `extends includes/layout.pug

block content
  #recent-posts.recent-posts.nc.category-hub
    - const allCats = site.categories.filter(c => c.length > 0 && !c.parent).sort('-length').toArray()
    .category-hub-header
      .category-hub-header-left
        span.category-hub-eyebrow
          i.fas.fa-compass
          |  KNOWLEDGE HUB
        h2.category-hub-title 专栏分类导览
      .category-hub-header-right
        span.category-hub-stat 共 #{allCats.length} 个专栏 · #{site.posts.length} 篇文章
        a.category-hub-all-link(href=url_for('/archives/'))
          | 时间轴归档
          i.fas.fa-arrow-right

    if allCats.length > 0
      .category-hub-grid
        each cat in allCats
          - const meta = getCategoryMeta(cat.name)
          - const catPosts = cat.posts.sort('-date').toArray().slice(0, 4)
          .category-hub-card(style=\`--cat-accent: \${meta.accent}\`)
            a.category-hub-cover(href=url_for(cat.path))
              img.category-hub-cover-img(src=meta.cover alt=cat.name width="1200" height="675" loading="lazy")
              span.category-hub-cover-scrim
              span.category-hub-count #{cat.length} 篇
              .category-hub-cover-overlay
                .category-hub-icon
                  i(class=meta.icon)
                .category-hub-head-info
                  h3.category-hub-name= cat.name
                  p.category-hub-desc= meta.desc
            .category-hub-card-body
              .category-hub-post-list
                each post in catPosts
                  a.category-hub-post-item(href=url_for(post.path) title=post.title)
                    span.category-hub-post-dot
                    span.category-hub-post-title= post.title
                    time.category-hub-post-date= date(post.date, 'MM-DD')
              .category-hub-card-foot
                a.category-hub-enter(href=url_for(cat.path))
                  span 进入「#{cat.name}」专栏
                  i.fas.fa-angle-right
    else
      .category-hub-empty 暂无已发布的分类文章
`;

// Priority 20 ensures Butterfly's init.js runs first and views are loaded.
hexo.extend.filter.register('before_generate', () => {
  hexo.theme.setView('index.pug', HOME_CATEGORY_INDEX_PUG);
}, 20);
