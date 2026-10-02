// Pill tab bar for the right-hand panel (WAI-ARIA tabs pattern, arrow keys move between tabs).
import type { Key } from './i18n.ts';
import { load, save } from './storage.ts';

export interface TabDef { id: string; label: Key; panel: HTMLElement }

export function mountTabs(host: HTMLElement, tabs: TabDef[]): void {
  const list = document.createElement('div');
  list.className = 'tablist';
  list.setAttribute('role', 'tablist');
  list.dataset.i18nAria = 'tabs.label';
  host.append(list);

  const buttons = tabs.map(({ id, label, panel }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.id = `tab-${id}`;
    b.dataset.i18n = label;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `panel-${id}`);
    list.append(b);
    panel.id = `panel-${id}`;
    panel.classList.add('tabpanel');
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', b.id);
    host.append(panel);
    return b;
  });

  const show = (k: number, focus = false) => {
    tabs.forEach((tab, i) => {
      const on = i === k;
      buttons[i].setAttribute('aria-selected', String(on));
      buttons[i].tabIndex = on ? 0 : -1;
      tab.panel.hidden = !on;
    });
    if (focus) buttons[k].focus();
    save('tab', tabs[k].id);
  };

  buttons.forEach((b, i) => {
    b.addEventListener('click', () => show(i));
    b.addEventListener('keydown', (e) => {
      const n = tabs.length;
      const k = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n
        : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
      if (k < 0) return;
      e.preventDefault();
      show(k, true);
    });
  });

  show(Math.max(0, tabs.findIndex((tab) => tab.id === load('tab'))));
}
