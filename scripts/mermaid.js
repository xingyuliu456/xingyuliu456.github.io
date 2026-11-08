'use strict';

const { escapeHTML } = require('hexo-util');

// Convert standard ```mermaid fenced code blocks into Butterfly's .mermaid-wrap structure
// before Hexo's backtick_code_block highlighter runs (priority 10).
hexo.extend.filter.register(
  'before_post_render',
  function (data) {
    if (!data.content || !data.content.includes('```')) return;

    data.content = data.content.replace(
      /^([ \t]*)```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n\1```[ \t]*$/gm,
      (_, indent, code) => {
        const html = `<div class="mermaid-wrap"><pre class="mermaid-src" hidden>\n${escapeHTML(code)}\n</pre></div>`;
        return `${indent}<hexoPostRenderCodeBlock>${html}</hexoPostRenderCodeBlock>`;
      }
    );
  },
  9
);
