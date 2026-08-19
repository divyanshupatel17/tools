import type { MarkdownIt, StateCore, Token } from 'markdown-it';

const TASK_RE = /^\[( |x|X)\]\s+/;

/** Finds the first `inline` token that belongs directly to this container (a list item or a
 * blockquote) — skipping past any same-type nested container so a checkbox or alert marker
 * inside a nested list/quote is never mistaken for its parent's, and never overruns into
 * unrelated later content once this container closes. */
function findFirstDirectInline(
  tokens: Token[],
  openIndex: number,
  openType: string,
  closeType: string,
): Token | null {
  let depth = 0;
  for (let j = openIndex + 1; j < tokens.length; j += 1) {
    const token = tokens[j]!;
    if (token.type === openType) {
      depth += 1;
      continue;
    }
    if (token.type === closeType) {
      if (depth === 0) return null;
      depth -= 1;
      continue;
    }
    if (depth > 0) continue;
    if (token.type === 'inline') return token;
  }
  return null;
}

/**
 * Turns GFM `- [ ] text` / `- [x] text` list items into a real, clickable `<input
 * type="checkbox">` (not the disabled one most Markdown renderers produce) and records the exact
 * source line for each one in document order. The Preview panel's click handler reads that same
 * `task_lines` array back out of `state.env` so a click can flip the checkbox on the matching
 * line of the Markdown Input textarea — see `lib/text/markdown/tasks.ts`.
 */
export function taskListsPlugin(md: MarkdownIt): void {
  md.core.ruler.push('task_lists', (state: StateCore) => {
    const tokens = state.tokens;
    const taskLines: number[] = [];
    let taskIndex = 0;

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]!;
      if (token.type !== 'list_item_open') continue;

      const inline = findFirstDirectInline(tokens, i, 'list_item_open', 'list_item_close');
      const firstChild = inline?.children?.[0];
      if (!inline || !firstChild || firstChild.type !== 'text') continue;

      const match = TASK_RE.exec(firstChild.content);
      if (!match) continue;

      const checked = match[1]!.toLowerCase() === 'x';
      firstChild.content = firstChild.content.slice(match[0].length);
      inline.content = inline.content.slice(match[0].length);

      const checkbox = new state.Token('html_inline', '', 0);
      checkbox.content = `<input type="checkbox" class="md-task-checkbox" data-task-index="${taskIndex}"${checked ? ' checked' : ''} />`;
      inline.children!.unshift(checkbox);

      token.attrJoin('class', 'md-task-item');
      taskLines.push(token.map ? token.map[0] : -1);
      taskIndex += 1;
    }

    (state.env as { task_lines?: number[] }).task_lines = taskLines;
  });
}

const ALERT_TYPES = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const;
type AlertType = (typeof ALERT_TYPES)[number];
const ALERT_RE = new RegExp(`^\\[!(${ALERT_TYPES.join('|')})\\]\\s*\\n?`);

/** GitHub's `> [!NOTE]` style callout convention: a blockquote whose first line is one of the
 * five recognised markers becomes a labelled alert box instead of a plain quote. */
export function alertsPlugin(md: MarkdownIt): void {
  md.core.ruler.push('github_alerts', (state: StateCore) => {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]!;
      if (token.type !== 'blockquote_open') continue;

      const inline = findFirstDirectInline(tokens, i, 'blockquote_open', 'blockquote_close');
      const firstChild = inline?.children?.[0];
      if (!inline || !firstChild || firstChild.type !== 'text') continue;

      const match = ALERT_RE.exec(firstChild.content);
      if (!match) continue;

      const alertType = match[1] as AlertType;
      firstChild.content = firstChild.content.slice(match[0].length);
      inline.content = inline.content.slice(match[0].length);

      token.attrJoin('class', `md-alert md-alert-${alertType.toLowerCase()}`);
      token.meta = { alertType };
    }
  });

  const defaultRender =
    md.renderer.rules.blockquote_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const alertType = (token.meta as { alertType?: AlertType } | null)?.alertType;
    if (!alertType) return defaultRender(tokens, idx, options, env, self);
    const label = alertType.charAt(0) + alertType.slice(1).toLowerCase();
    return `${defaultRender(tokens, idx, options, env, self)}<p class="md-alert-title">${label}</p>`;
  };
}

/** Every rendered link opens in a new tab without handing the destination page a `window.opener`
 * reference, and without passing search engine credit through — a paste box preview is not the
 * place to trust a link's destination. */
export function safeLinksPlugin(md: MarkdownIt): void {
  const defaultRender =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer nofollow');
    return defaultRender(tokens, idx, options, env, self);
  };
}

/** Wraps every table in a horizontally scrollable box so a wide table never blows out the
 * Preview column on a small screen. */
export function responsiveTablesPlugin(md: MarkdownIt): void {
  const defaultOpen =
    md.renderer.rules.table_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  const defaultClose =
    md.renderer.rules.table_close ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.table_open = (tokens, idx, options, env, self) =>
    `<div class="md-table-wrap">${defaultOpen(tokens, idx, options, env, self)}`;
  md.renderer.rules.table_close = (tokens, idx, options, env, self) =>
    `${defaultClose(tokens, idx, options, env, self)}</div>`;
}
