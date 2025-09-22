/**
 * @license
 * Scoped Focusgroup Polyfill - The Complete TypeScript Implementation
 *
 * Copyright (c) 2023-2024
 *
 * This polyfill provides a complete and robust implementation of the Open UI
 * Scoped Focusgroup proposal, including full behavioral and semantic features.
 * https://open-ui.org/components/scoped-focusgroup.explainer/
 *
 * @version 2.0.0
 * @author [Your Name/Organization]
 */

// --- Type Definitions ---

interface InstallOptions {
  force?: boolean;
  debug?: boolean;
  autoRoles?: boolean;
}

interface GroupAPI {
  element: HTMLElement;
  items: HTMLElement[];
  activeItem: HTMLElement | null;
  focusItem: (item: HTMLElement) => void;
  focusNext: () => void;
  focusPrev: () => void;
  focusFirst: () => void;
  focusLast: () => void;
  rebuild: () => void;
}

type BehaviorToken = 'toolbar' | 'tablist' | 'radiogroup' | 'listbox' | 'menu' | 'menubar' | 'grid' | 'none' | 'unknown';

interface GroupState {
  element: HTMLElement;
  tokens: {
    behavior: BehaviorToken;
    wrap: boolean;
    inline: boolean;
    block: boolean;
    memory: boolean;
    grid: boolean;
    shadowInclusive: boolean;
    rowWrap: boolean;
    colWrap: boolean;
    rowFlow: boolean;
    colFlow: boolean;
  };
  items: HTMLElement[];
  gridItems: HTMLElement[][];
  activeIndex: number;
  gridPosition: { row: number; col: number };
  memory: WeakRef<HTMLElement> | null;
  rebuildScheduled: boolean;
}

interface OriginalAttributes {
  tabindex: string | null;
  role: string | null;
}

// Extend the Window interface to declare our global polyfill object
declare global {
  interface Window {
    ScopedFocusPolyfill?: ScopedFocusPolyfillAPI;
  }
}

interface ScopedFocusPolyfillAPI {
  install: (options?: InstallOptions) => void;
  uninstall: () => void;
  getGroupFor: (el: Element) => GroupAPI | null;
  readonly installed: boolean;
  readonly supported: boolean;
}


// --- Utility Functions ---

const isFocusable = (el: Element): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  if ((el as HTMLInputElement).disabled || el.hidden || el.closest('[inert]')) return false;
  if (el.offsetParent === null) return false;
  
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  if (el.matches('a[href], button, input, select, textarea, [contenteditable="true"]')) return true;
  
  const tabIndex = el.getAttribute('tabindex');
  return tabIndex !== null && parseInt(tabIndex, 10) >= 0;
};

const isTextInput = (el: Element): el is HTMLElement => {
  return el.matches('input:not([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"]), textarea, [contenteditable="true"]');
};

// --- ARIA Role Management ---

const ROLE_MAP: Record<string, { container: string; child: string | null }> = {
  toolbar: { container: 'toolbar', child: null },
  tablist: { container: 'tablist', child: 'tab' },
  radiogroup: { container: 'radiogroup', child: 'radio' },
  listbox: { container: 'listbox', child: 'option' },
  menu: { container: 'menu', child: 'menuitem' },
  menubar: { container: 'menubar', child: 'menuitem' },
  grid: { container: 'grid', child: 'gridcell' }
};

const isGenericElement = (el: Element): el is HTMLElement => {
  return ['DIV', 'SPAN'].includes(el.tagName);
};

/**
 * Main Polyfill Singleton
 */
export const ScopedFocusPolyfill: ScopedFocusPolyfillAPI = (() => {
  const groups = new WeakMap<HTMLElement, GroupState>();
  const originalAttributes = new WeakMap<HTMLElement, OriginalAttributes>();
  let mutationObserver: MutationObserver | null = null;
  let isTabbing = false;
  let debug = false;
  let autoRoles = false;
  let isInstalled = false;
  let isSupported = false;

  function install(options: InstallOptions = {}): void {
    if (isInstalled) return;

    debug = options.debug ?? false;
    autoRoles = options.autoRoles ?? false;

    isSupported = 'focusgroup' in HTMLElement.prototype;
    if (isSupported && !options.force) {
      if (debug) console.log('[SFP] Native support detected. Polyfill disabled.');
      return;
    }
    isInstalled = true;

    document.addEventListener('keydown', onGlobalKeyDown, true);
    document.addEventListener('focusin', onGlobalFocusIn, true);

    mutationObserver = new MutationObserver(onMutation);
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['focusgroup', 'disabled', 'hidden', 'inert', 'style', 'role'],
    });

    document.querySelectorAll<HTMLElement>('[focusgroup]').forEach(register);
    if (debug) console.log(`[SFP] Polyfill installed and active. AutoRoles: ${autoRoles}`);
  }

  function uninstall(): void {
    if (!isInstalled) return;
    mutationObserver?.disconnect();
    document.removeEventListener('keydown', onGlobalKeyDown, true);
    document.removeEventListener('focusin', onGlobalFocusIn, true);

    document.querySelectorAll<HTMLElement>('[focusgroup]').forEach(unregister);
    isInstalled = false;
    if (debug) console.log('[SFP] Polyfill uninstalled.');
  }

  // --- Event Handlers ---

  function onGlobalKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Tab') {
      isTabbing = true;
      setTimeout(() => { isTabbing = false; }, 50);
      return;
    }

    if (!(document.activeElement instanceof HTMLElement)) return;

    const container = findGroupForElement(document.activeElement);
    if (!container) return;

    const state = groups.get(container);
    if (!state || !state.items.length) return;
    if (isTextInput(document.activeElement)) return;

    const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!navKeys.includes(e.key)) return;
    
    e.preventDefault();
    
    if (state.tokens.grid) {
      navigateGrid(state, e.key);
    } else {
      navigateLinear(state, e.key);
    }
  }

  function onGlobalFocusIn(e: FocusEvent): void {
    if (!(e.target instanceof HTMLElement)) return;

    const target = e.target;
    const container = findGroupForElement(target);
    if (!container) return;
    const state = groups.get(container);
    if (!state) return;
    
    const itemIndex = state.items.indexOf(target);

    if (isTabbing) {
      isTabbing = false;
      const memoryEl = state.memory?.deref();
      if (state.tokens.memory && memoryEl && state.items.includes(memoryEl) && target !== memoryEl) {
        if(debug) console.log('[SFP] Tab detected. Restoring focus to memory:', memoryEl);
        memoryEl.focus();
        return;
      }
    }

    if (itemIndex > -1) {
      if (state.activeIndex !== itemIndex) {
        state.activeIndex = itemIndex;
        applyRovingTabindex(state);
      }
      state.memory = new WeakRef(target);
      dispatchCustomEvent(container, 'change', { relatedTarget: target });
    }
  }

  function onMutation(mutations: MutationRecord[]): void {
    const dirtyGroups = new Set<HTMLElement>();
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node instanceof HTMLElement) {
            if (node.hasAttribute('focusgroup')) register(node);
            node.querySelectorAll<HTMLElement>('[focusgroup]').forEach(register);
          }
        });
        mutation.removedNodes.forEach(node => {
          if (node instanceof HTMLElement && groups.has(node)) {
            unregister(node);
          }
        });
      }
      if (mutation.target instanceof HTMLElement) {
        const container = findGroupForElement(mutation.target);
        if (container) dirtyGroups.add(container);
      }
    }

    dirtyGroups.forEach(groupEl => {
      const state = groups.get(groupEl);
      if (state) scheduleRebuild(state);
    });
  }

  // --- Group Management ---

  function register(container: HTMLElement): void {
    if (groups.has(container)) {
      scheduleRebuild(groups.get(container)!);
      return;
    }
    if (debug) console.log('[SFP] Registering group:', container);
    const state: Partial<GroupState> = { element: container, rebuildScheduled: false };
    groups.set(container, state as GroupState);
    scheduleRebuild(state as GroupState);
  }

  function unregister(container: HTMLElement): void {
    const state = groups.get(container);
    if (!state) return;
    if (debug) console.log('[SFP] Unregistering group:', container);
    (state.items || []).forEach(restoreOriginalAttributes);
    restoreOriginalAttributes(container);
    groups.delete(container);
  }
  
  function scheduleRebuild(state: GroupState): void {
    if (state.rebuildScheduled) return;
    state.rebuildScheduled = true;
    requestAnimationFrame(() => {
        rebuild(state);
        state.rebuildScheduled = false;
    });
  }

  function rebuild(state: GroupState): void {
    const container = state.element;
    if (debug) console.log('[SFP] Rebuilding group:', container);
    
    const tokens = (container.getAttribute('focusgroup') || '').split(/\s+/).filter(Boolean);
    state.tokens = {
      behavior: (tokens[0] as BehaviorToken) || 'unknown',
      wrap: tokens.includes('wrap'),
      inline: tokens.includes('inline'),
      block: tokens.includes('block'),
      memory: !tokens.includes('no-memory'),
      grid: tokens.includes('grid'),
      shadowInclusive: tokens.includes('shadow-inclusive'),
      rowWrap: tokens.includes('row-wrap'), colWrap: tokens.includes('col-wrap'),
      rowFlow: tokens.includes('row-flow'), colFlow: tokens.includes('col-flow'),
    };

    if (state.tokens.behavior === 'none') {
      state.items = [];
      return;
    }
    
    const oldActiveElement = state.activeIndex > -1 ? state.items[state.activeIndex] : null;
    (state.items || []).forEach(restoreOriginalAttributes);
    
    state.items = discoverItems(container, state.tokens.shadowInclusive);
    state.items.forEach(saveOriginalAttributes);

    if (state.items.includes(oldActiveElement!)) {
      state.activeIndex = state.items.indexOf(oldActiveElement!);
    } else {
      const memoryEl = state.memory?.deref();
      if (state.tokens.memory && memoryEl && state.items.includes(memoryEl)) {
          state.activeIndex = state.items.indexOf(memoryEl);
      } else {
          state.activeIndex = state.items.length > 0 ? 0 : -1;
      }
    }

    if (state.tokens.grid) buildGrid(state);
    
    applyRovingTabindex(state);
    if (autoRoles) applyAriaRoles(state);

    dispatchCustomEvent(container, 'rebuild', { items: state.items });
  }

  function discoverItems(root: Node, shadowInclusive: boolean): HTMLElement[] {
    const items: HTMLElement[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node: Node) {
        if (!(node instanceof HTMLElement)) return NodeFilter.FILTER_SKIP;
        if (node === root) return NodeFilter.FILTER_SKIP;

        const nearestGroup = findGroupForElement(node.parentElement, root as HTMLElement);
        if (nearestGroup && nearestGroup !== root) return NodeFilter.FILTER_REJECT;
        if (findAncestorWithAttr(node, 'focusgroup', 'none', root as HTMLElement)) return NodeFilter.FILTER_REJECT;

        if (isFocusable(node)) return NodeFilter.FILTER_ACCEPT;
        if (shadowInclusive && (node as Element).shadowRoot) {
          discoverItems((node as Element).shadowRoot!, shadowInclusive).forEach(item => items.push(item));
        }
        return NodeFilter.FILTER_SKIP;
      }
    });
    let currentNode: Node | null;
    while (currentNode = walker.nextNode()) {
      if (currentNode instanceof HTMLElement) items.push(currentNode);
    }
    return items;
  }
  
  function buildGrid(state: GroupState): void {
    if (!state.items.length) { state.gridItems = []; return; }
    const itemRects = state.items.map(item => ({ el: item, rect: item.getBoundingClientRect() }));
    itemRects.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
    
    const rows: HTMLElement[][] = [];
    if (itemRects.length > 0) {
      let currentRow = [itemRects[0].el];
      for (let i = 1; i < itemRects.length; i++) {
        if (Math.abs(itemRects[i].rect.top - itemRects[i-1].rect.top) > itemRects[i-1].rect.height / 2) {
          rows.push(currentRow);
          currentRow = [];
        }
        currentRow.push(itemRects[i].el);
      }
      rows.push(currentRow);
    }
    state.gridItems = rows;

    const activeEl = state.activeIndex > -1 ? state.items[state.activeIndex] : null;
    if (activeEl) {
      for (let r = 0; r < rows.length; r++) {
        const c = rows[r].indexOf(activeEl);
        if (c > -1) { state.gridPosition = { row: r, col: c }; return; }
      }
    }
    state.gridPosition = { row: -1, col: -1 };
  }

  // --- Navigation Logic ---

  function navigateLinear(state: GroupState, key: string): void {
    let nextIndex = state.activeIndex;
    if (nextIndex === -1) return;

    const lastIndex = state.items.length - 1;
    const { inline, block, wrap } = state.tokens;
    
    const style = getComputedStyle(state.element);
    const isRTL = style.direction === 'rtl';
    const isVertical = style.writingMode.startsWith('vertical');
    
    let horizontal = false;
    let forward = false;

    switch (key) {
      case 'ArrowRight': horizontal = true; forward = !isRTL; break;
      case 'ArrowLeft':  horizontal = true; forward = isRTL; break;
      case 'ArrowDown':  horizontal = false; forward = !isVertical; break; // Assumes horizontal-tb or vertical-rl
      case 'ArrowUp':    horizontal = false; forward = isVertical; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = lastIndex; break;
    }

    if (key.startsWith('Arrow')) {
      if ((inline && !block && !horizontal) || (block && !inline && horizontal)) return;
      nextIndex += forward ? 1 : -1;
    }

    if (wrap) {
      if (nextIndex < 0) nextIndex = lastIndex;
      if (nextIndex > lastIndex) nextIndex = 0;
    } else {
      nextIndex = Math.max(0, Math.min(nextIndex, lastIndex));
    }
    focusItemByIndex(state, nextIndex);
  }
  
  function navigateGrid(state: GroupState, key: string): void {
    let { row, col } = state.gridPosition;
    if (row === -1 || col === -1) return;

    let { rowWrap, colWrap, rowFlow, colFlow, wrap } = state.tokens;
    if (wrap) rowWrap = colWrap = true;
    
    const maxRow = state.gridItems.length - 1;

    switch (key) {
      case 'ArrowUp': row--; break;
      case 'ArrowDown': row++; break;
      case 'ArrowLeft': col--; break;
      case 'ArrowRight': col++; break;
      case 'Home': col = 0; break;
      case 'End': col = state.gridItems[row].length - 1; break;
    }
    
    const maxCol = (state.gridItems[row]?.length ?? 0) - 1;

    if (col < 0) {
      if (colFlow) { row--; col = state.gridItems[Math.max(0, row)]?.length - 1 || 0; }
      else if (colWrap) { col = maxCol; }
      else { col = 0; }
    } else if (col > maxCol) {
      if (colFlow) { row++; col = 0; }
      else if (colWrap) { col = 0; }
      else { col = maxCol; }
    }

    if (row < 0) {
      if (rowFlow || rowWrap) { row = maxRow; } else { row = 0; }
    } else if (row > maxRow) {
      if (rowFlow || rowWrap) { row = 0; } else { row = maxRow; }
    }

    row = Math.max(0, Math.min(row, state.gridItems.length - 1));
    col = Math.max(0, Math.min(col, state.gridItems[row].length - 1));
    
    const newIndex = state.items.indexOf(state.gridItems[row][col]);
    if (newIndex > -1) {
      state.gridPosition = { row, col };
      focusItemByIndex(state, newIndex);
    }
  }
  
  function focusItemByIndex(state: GroupState, index: number): void {
    if (index === state.activeIndex || index < 0 || index >= state.items.length) return;
    if(debug) console.log(`[SFP] Moving focus from index ${state.activeIndex} to ${index}`);
    state.activeIndex = index;
    applyRovingTabindex(state);
    state.items[index].focus();
  }

  // --- Attribute Management ---

  function applyRovingTabindex(state: GroupState): void {
    state.items.forEach((item, index) => {
      item.setAttribute('tabindex', index === state.activeIndex ? '0' : '-1');
    });
  }

  function applyAriaRoles(state: GroupState): void {
    const roleInfo = ROLE_MAP[state.tokens.behavior];
    if (!roleInfo) return;
    
    const container = state.element;
    saveOriginalAttributes(container);
    if (isGenericElement(container) && !originalAttributes.get(container)?.role) {
      container.setAttribute('role', roleInfo.container);
    }

    if (roleInfo.child) {
      state.items.forEach(item => {
        if (!originalAttributes.get(item)?.role) {
           item.setAttribute('role', roleInfo.child!);
        }
      });
    }
  }

  function saveOriginalAttributes(el: HTMLElement): void {
    if (!originalAttributes.has(el)) {
      originalAttributes.set(el, {
        tabindex: el.getAttribute('tabindex'),
        role: el.getAttribute('role'),
      });
    }
  }

  function restoreOriginalAttributes(el: HTMLElement): void {
    if (!originalAttributes.has(el)) return;
    const original = originalAttributes.get(el)!;
    
    if (original.tabindex === null) el.removeAttribute('tabindex');
    else el.setAttribute('tabindex', original.tabindex);

    if (autoRoles) {
      if (original.role === null) el.removeAttribute('role');
      else el.setAttribute('role', original.role);
    }
    
    originalAttributes.delete(el);
  }

  // --- Helpers ---
  function findGroupForElement(el: Element | null, stopAt: HTMLElement | null = null): HTMLElement | null {
    let current = el;
    while(current && current !== stopAt) {
      if (current instanceof HTMLElement && groups.has(current)) return current;
      current = current.parentElement || (current.getRootNode() as ShadowRoot)?.host || null;
    }
    return null;
  }
  
  function findAncestorWithAttr(el: HTMLElement, attr: string, value: string, stopAt: HTMLElement): HTMLElement | null {
    let current = el.parentElement;
    while(current && current !== stopAt) {
      if (current.getAttribute(attr) === value) return current;
      current = current.parentElement;
    }
    return null;
  }
  
  function dispatchCustomEvent(target: HTMLElement, name: string, detail: object): void {
    target.dispatchEvent(new CustomEvent(`scopedfocus:${name}`, { bubbles: true, composed: true, detail }));
  }
  
  // --- Public API ---
  function getGroupFor(el: Element): GroupAPI | null {
    const container = findGroupForElement(el);
    if (!container) return null;
    const state = groups.get(container)!;
    
    return {
      element: container,
      get items() { return [...state.items]; },
      get activeItem() { return state.items[state.activeIndex] || null; },
      focusItem(item: HTMLElement) {
        const index = state.items.indexOf(item);
        if (index > -1) focusItemByIndex(state, index);
      },
      focusNext() { navigateLinear(state, 'ArrowRight'); },
      focusPrev() { navigateLinear(state, 'ArrowLeft'); },
      focusFirst() { navigateLinear(state, 'Home'); },
      focusLast() { navigateLinear(state, 'End'); },
      rebuild() { scheduleRebuild(state); }
    };
  }

  return {
    install,
    uninstall,
    getGroupFor,
    get installed() { return isInstalled; },
    get supported() { return isSupported; },
  };
})();

// --- Expose to window and auto-install ---
if (typeof window !== 'undefined') {
  window.ScopedFocusPolyfill = ScopedFocusPolyfill;
  
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    ScopedFocusPolyfill.install();
  } else {
    document.addEventListener('DOMContentLoaded', () => ScopedFocusPolyfill.install(), { once: true });
  }
}