'use strict';

const { escapeHTML } = require('hexo-util');

// Convert standard ```mermaid fenced code blocks into Butterfly's .mermaid-wrap structure
// before Hexo's backtick_code_block highlighter runs (priority 10).
// Enhanced to support blockquotes (> ```mermaid), arbitrary indentations, and list nestings.
const rMermaid = /^((?:[^\S\r\n]*>)*[^\S\r\n]*)`{3,}mermaid[^\S\r\n]*\r?\n([\s\S]*?)\r?\n\1`{3,}[^\S\r\n]*$/gm;

hexo.extend.filter.register(
  'before_post_render',
  function (data) {
    if (!data.content || !data.content.includes('```mermaid')) return;

    data.content = data.content.replace(rMermaid, (_, prefix, code) => {
      let cleanCode = code;
      if (prefix) {
        const escapePrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cleanCode = code.replace(new RegExp(`^${escapePrefix}`, 'mg'), '');
      }
      const html = `<div class="mermaid-wrap"><pre class="mermaid-src" hidden>\n${escapeHTML(cleanCode.trim())}\n</pre></div>`;
      return `${prefix}<hexoPostRenderCodeBlock>${html}</hexoPostRenderCodeBlock>`;
    });
  },
  9
);
