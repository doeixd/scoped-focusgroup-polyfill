
[![npm version](https://badge.fury.io/js/@doeixd/scoped-focusgroup-polyfill.svg)](https://badge.fury.io/js/@doeixd/scoped-focusgroup-polyfill)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# Scoped Focusgroup Polyfill

A complete, production-ready, and robust polyfill for the [Open UI Scoped Focusgroup proposal](https://open-ui.org/components/scoped-focusgroup.explainer/).

This polyfill brings declarative roving `tabindex`, accessible keyboard navigation, and semantic role management to all modern browsers, allowing you to build complex composite widgets like toolbars, tablists, menus, and grids with a single HTML attribute.

It is lightweight, performant, and designed to work seamlessly with modern web frameworks and vanilla JavaScript projects.

## Features

This polyfill implements the full feature set of the Scoped Focusgroup specification:

-   **Declarative Roving Tabindex:** Automatically manages `tabindex` to ensure your widget has a single, reliable entry point.
-   **Full Keyboard Navigation:**
    -   Arrow key navigation (`Up`, `Down`, `Left`, `Right`).
    -   `Home` and `End` key support to jump to the first and last items.
-   **Last-Focused Memory:** Remembers the last focused item in a group, restoring focus to it when the user tabs back in.
-   **Content Directionality Support:** Correctly handles `rtl` (right-to-left) layouts and vertical `writing-mode` for intuitive international navigation.
-   **Advanced Grid Navigation:** Full support for 2D navigation in grids, including `wrap`, `flow`, `row-wrap`, `col-wrap`, and `row-flow` behaviors.
-   **Semantic Role Inference (Opt-in):** Can automatically apply appropriate ARIA roles (`toolbar`, `tablist`, `tab`, etc.) to your markup for out-of-the-box accessibility.
-   **Structural Awareness:**
    -   Handles **nested focusgroups** correctly.
    -   Supports opt-out subtrees with `focusgroup="none"`.
    -   Traverses into **Shadow DOM** with the `shadow-inclusive` token.
-   **Dynamic Content Ready:** Uses a `MutationObserver` to automatically react to items being added, removed, or changed.
-   **Robust and Performant:** Memory-safe architecture (`WeakMap`), debounced DOM updates (`requestAnimationFrame`), and a minimal performance footprint.

## Quickstart

### 1. Installation

You can install the polyfill via npm or include it directly from a CDN.

**via npm:**

```bash
npm install @doeixd/scoped-focusgroup-polyfill
```

```javascript
// Import it into your project's entry point
import '@doeixd/scoped-focusgroup-polyfill';
```

**via CDN:**

Include the script in your HTML file. It will install itself automatically.

```html
<script src="https://esm.sh/@doeixd/scoped-focusgroup-polyfill"></script>
```

### 2. Usage

Once the polyfill is included, simply add the `focusgroup` attribute to your container elements.

#### Example: A Simple Toolbar

This example creates an accessible toolbar where users can navigate between buttons using arrow keys.

**Before (Manual JavaScript):**

```html
<div role="toolbar" aria-label="Text Formatting">
  <button type="button">Bold</button>
  <button type="button" tabindex="-1">Italic</button>
  <button type="button" tabindex="-1">Underline</button>
</div>
<!-- Requires dozens of lines of JS to handle roving tabindex,
     arrow keys, memory, and edge cases. -->
```

**After (with Polyfill):**

Just add one attribute. That's it.

```html
<div focusgroup="toolbar wrap" aria-label="Text Formatting">
  <button type="button">Bold</button>
  <button type="button">Italic</button>
  <button type="button">Underline</button>
</div>
<!-- The polyfill handles all focus management and navigation automatically. -->
```

## Configuration

You can configure the polyfill during installation by calling `ScopedFocusPolyfill.install()` with an options object. This is useful if you include the script manually and want to customize its behavior.

```javascript
// In your main script file
window.ScopedFocusPolyfill.install({
  /**
   * Enable automatic ARIA role inference. The polyfill will apply
   * roles like `role="tablist"` and `role="tab"` based on the behavior
   * token, without overwriting existing roles.
   * Default: false
   */
  autoRoles: true,

  /**
   * Enable detailed console logging for debugging focusgroup behavior.
   * Useful during development.
   * Default: false
   */
  debug: true,

  /**
   * Force the polyfill to run even if native browser support is detected.
   * Useful for testing and ensuring consistent behavior.
   * Default: false
   */
  force: false
});
```

## API Reference

### `focusgroup` Attribute Tokens

The `focusgroup` attribute accepts a space-separated list of tokens. The first token defines the primary behavior.

#### Behavior Tokens

-   `toolbar`
-   `tablist`
-   `listbox`
-   `menu`
-   `menubar`
-   `radiogroup`
-   `grid`
-   `none` (opts-out an element and its subtree)

#### Modifier Tokens

-   `wrap`: Enables focus to loop from the last item to the first.
-   `no-memory`: Disables remembering the last focused item.
-   `inline`: Restricts linear navigation to the inline (horizontal) axis.
-   `block`: Restricts linear navigation to the block (vertical) axis.
-   `shadow-inclusive`: Allows the focusgroup to include items inside open Shadow DOM roots.
-   **Grid Modifiers:** `row-wrap`, `col-wrap`, `row-flow`, `col-flow`.

### Programmatic API

For advanced use cases, you can interact with a focusgroup programmatically.

```javascript
const myToolbar = document.querySelector('#my-toolbar');
const focusgroup = window.ScopedFocusPolyfill.getGroupFor(myToolbar);

if (focusgroup) {
  // Get the currently active element
  console.log(focusgroup.activeItem);

  // Programmatically move focus
  focusgroup.focusFirst();
  focusgroup.focusNext();

  // Manually trigger a rebuild if you've made complex DOM changes
  focusgroup.rebuild();
}
```

### Custom Events

The polyfill dispatches custom events on the focusgroup container element, allowing you to hook into its lifecycle.

-   **`scopedfocus:rebuild`**: Fired after the group's focusable items have been recalculated. `event.detail.items` contains the new list of items.
-   **`scopedfocus:change`**: Fired when the active (focused) item within the group changes. `event.detail.relatedTarget` contains the newly focused item.

```javascript
myToolbar.addEventListener('scopedfocus:change', (event) => {
  console.log('New active item:', event.detail.relatedTarget);
  // Example: Update application state based on the focused tab
});
```

## Browser Support

This polyfill is designed to work in all modern, evergreen browsers that support `MutationObserver` and `WeakMap`.

-   Chrome
-   Firefox
-   Safari
-   Edge

It does not support Internet Explorer.

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.