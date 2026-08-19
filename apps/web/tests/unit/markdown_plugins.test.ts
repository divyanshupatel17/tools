import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import {
  alertsPlugin,
  responsiveTablesPlugin,
  safeLinksPlugin,
  taskListsPlugin,
} from '@/lib/text/markdown/plugins';

function render(source: string) {
  const md = new MarkdownIt();
  md.use(taskListsPlugin);
  md.use(alertsPlugin);
  md.use(safeLinksPlugin);
  md.use(responsiveTablesPlugin);
  const env: { task_lines?: number[] } = {};
  const html = md.render(source, env);
  return { html, taskLines: env.task_lines ?? [] };
}

describe('taskListsPlugin', () => {
  it('renders an unchecked task as a real, enabled checkbox', () => {
    const { html } = render('- [ ] Buy milk');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked');
    expect(html).not.toContain('disabled');
  });

  it('renders a checked task with the checked attribute', () => {
    const { html } = render('- [x] Done already');
    expect(html).toContain('checked');
  });

  it('records the source line for each task in document order', () => {
    const source = 'Intro\n\n- [ ] one\n- [x] two\n- [ ] three';
    const { taskLines } = render(source);
    expect(taskLines).toEqual([2, 3, 4]);
  });

  it('does not treat a plain list item as a task', () => {
    const { html, taskLines } = render('- just a list item');
    expect(html).not.toContain('type="checkbox"');
    expect(taskLines).toEqual([]);
  });

  it('does not let a nested list confuse the parent item scan', () => {
    const source = '- [ ] parent\n  - [x] child';
    const { taskLines } = render(source);
    expect(taskLines).toEqual([0, 1]);
  });
});

describe('alertsPlugin', () => {
  it('marks a [!NOTE] blockquote with the alert class and a title', () => {
    const { html } = render('> [!NOTE]\n> Something worth knowing.');
    expect(html).toContain('md-alert md-alert-note');
    expect(html).toContain('md-alert-title');
    expect(html).toContain('Note');
    expect(html).not.toContain('[!NOTE]');
  });

  it('leaves a plain blockquote untouched', () => {
    const { html } = render('> Just a quote.');
    expect(html).not.toContain('md-alert');
  });

  it('supports every recognised alert type', () => {
    for (const type of ['TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
      const { html } = render(`> [!${type}]\n> body`);
      expect(html).toContain(`md-alert-${type.toLowerCase()}`);
    }
  });
});

describe('safeLinksPlugin', () => {
  it('adds target and rel to every link', () => {
    const { html } = render('[example](https://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe('responsiveTablesPlugin', () => {
  it('wraps a table in a scrollable container', () => {
    const { html } = render('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain('<div class="md-table-wrap"><table>');
    expect(html).toContain('</table>\n</div>');
  });
});
