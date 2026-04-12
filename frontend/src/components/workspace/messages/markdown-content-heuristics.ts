const BLOCK_MARKDOWN_RE =
  /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\|.+\|)/m;
const INLINE_MARKDOWN_RE =
  /(```|`[^`\n]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|https?:\/\/\S+|\*\*[^*\n]+\*\*|__[^_\n]+__|(^|[^\w])\*[^*\n]+\*($|[^\w])|(^|[^\w])_[^_\n]+_($|[^\w]))/;
const MATH_RE = /(\$[^$\n]+\$|\\\(|\\\[)/;
const HTML_RE = /<([a-z][\w-]*)(\s|>)/i;
const CITATION_RE = /\bcitation:/i;

export function needsRichMarkdownRendering(content: string): boolean {
  if (!content) {
    return false;
  }

  return (
    BLOCK_MARKDOWN_RE.test(content) ||
    INLINE_MARKDOWN_RE.test(content) ||
    MATH_RE.test(content) ||
    HTML_RE.test(content) ||
    CITATION_RE.test(content)
  );
}
