import sanitizeHtml from "sanitize-html";

// Paper content from the rich text editor is sanitised on every save, so
// stored HTML can be rendered for other roles without script injection.
export function cleanHtml(dirty: string): string {
  return sanitizeHtml(dirty ?? "", {
    allowedTags: [
      "p", "br", "hr", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "sub", "sup",
      "ul", "ol", "li", "blockquote", "pre", "code", "span",
      "table", "thead", "tbody", "tr", "th", "td", "colgroup", "col",
    ],
    allowedAttributes: {
      "*": ["style"],
      td: ["colspan", "rowspan", "colwidth", "style"],
      th: ["colspan", "rowspan", "colwidth", "style"],
      ol: ["start", "type"],
    },
    allowedStyles: {
      "*": { "text-align": [/^(left|right|center|justify)$/] },
    },
    disallowedTagsMode: "discard",
  });
}
