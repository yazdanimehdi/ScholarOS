import type { Directive } from 'vue';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const open = new WeakMap<HTMLElement, { previous: Element | null; onKey: (e: KeyboardEvent) => void }>();

const focusables = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0);

/**
 * `v-dialog` on a modal: focuses its first focusable element, keeps Tab / Shift+Tab inside it, and gives focus
 * back to the element that had it when the modal unmounts. Esc handling stays with each modal.
 */
export const vDialog: Directive<HTMLElement> = {
  mounted(el) {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables(el);
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? list.length - 1 : at - 1) : at === list.length - 1 ? 0 : at + 1;
      e.preventDefault();
      list[next]?.focus();
    };
    open.set(el, { previous: document.activeElement, onKey });
    document.addEventListener('keydown', onKey);
    focusables(el)[0]?.focus();
  },
  unmounted(el) {
    const state = open.get(el);
    if (!state) return;
    document.removeEventListener('keydown', state.onKey);
    (state.previous as HTMLElement | null)?.focus?.();
  },
};
