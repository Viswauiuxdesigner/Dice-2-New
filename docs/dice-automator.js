/**
 * DICE Form Automation Engine (DiceAutomator)
 * 100% Client-side DOM automation engine for the DICE Classifieds platform (JomClassifieds / Joomla).
 *
 * Safety Guarantee:
 * - NEVER clicks Submit, Save, or Publish.
 * - NEVER submits forms or communicates with external servers.
 * - Leaves form in a fully populated, ready-to-review state.
 * - NEVER displays false success: Halts and reports failure if any required dependency or field fails.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DiceAutomator = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_OPTIONS = {
    stepDelayMs: 300,
    maxWaitMs: 8000,
    pollIntervalMs: 150,
    logCallback: null,
    onStep: null
  };

  const Utils = {
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    cleanText(str) {
      if (!str || typeof str !== 'string') return '';
      return str.replace(/\s+/g, ' ').trim();
    },

    normalizeDescHtml(text) {
      if (!text) return '';
      let clean = String(text)
        .replace(/[ \t]*<br\s*\/?>[ \t]*\r?\n?/gi, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/div>/gi, '\n')
        .replace(/<div[^>]*>/gi, '')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ');

      const rawParagraphs = clean.split(/\n{2,}/);
      const cleanParagraphs = [];
      for (const rawP of rawParagraphs) {
        const lines = rawP.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
        const filteredLines = lines.filter(l => {
          if (/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(l)) return false;
          if (/^(?:show|read|view)\s*(?:more|less)$/i.test(l)) return false;
          if (/^(?:expand|\.\.\.\s*more)$/i.test(l)) return false;
          return true;
        });
        if (filteredLines.length > 0) {
          cleanParagraphs.push(filteredLines);
        }
      }

      const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return cleanParagraphs.map(lines => {
        return `<p>${lines.map(escapeHtml).join('<br>')}</p>`;
      }).join('');
    },

    triggerEvents(el) {
      if (!el) return;
      try {
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }));
      } catch (e) {}

      // Trigger inline onchange handler if present
      try {
        if (typeof el.onchange === 'function') {
          el.onchange.call(el);
        }
      } catch (e) {}

      // Trigger global JomClassifieds getsubcat if defined
      try {
        const win = el.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
        const unsafe = typeof unsafeWindow !== 'undefined' ? unsafeWindow : null;
        if (typeof win?.getsubcat === 'function') {
          win.getsubcat(el.value);
        } else if (typeof unsafe?.getsubcat === 'function') {
          unsafe.getsubcat(el.value);
        }
      } catch (e) {}

      // Trigger jQuery / Chosen / Select2 events if available
      try {
        const win = el.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
        const $ = win?.$ || win?.jQuery || (typeof unsafeWindow !== 'undefined' ? (unsafeWindow.$ || unsafeWindow.jQuery) : null);
        if ($ && typeof $(el).trigger === 'function') {
          $(el).trigger('input').trigger('change').trigger('chosen:updated').trigger('select2:select');
        }
      } catch (e) {}
    },

    triggerCategoryEvents(el, level = 0, doc = document) {
      if (!el) return;
      // 1. Standard native events
      try {
        el.dispatchEvent(new Event('focus', { bubbles: true, cancelable: true, composed: true }));
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }));
      } catch (e) {}

      // 2. Direct element inline handler
      try {
        if (typeof el.onchange === 'function') {
          el.onchange.call(el);
        }
      } catch (e) {}

      // 3. Direct window handlers (unsafeWindow, ownerDocument.defaultView, window)
      const pageWins = [];
      try {
        if (typeof unsafeWindow !== 'undefined' && unsafeWindow) pageWins.push(unsafeWindow);
        const docWin = el.ownerDocument?.defaultView;
        if (docWin && !pageWins.includes(docWin)) pageWins.push(docWin);
        if (typeof window !== 'undefined' && window && !pageWins.includes(window)) pageWins.push(window);
      } catch (e) {}

      for (const win of pageWins) {
        try {
          if (typeof win.getsubcat === 'function') {
            try { win.getsubcat(el.value, level); } catch (e) {}
            try { win.getsubcat(el.value); } catch (e) {}
          }
          if (typeof win.get_sub_cat === 'function') {
            try { win.get_sub_cat(el.value, level); } catch (e) {}
          }
          if (typeof win.getSubCategories === 'function') {
            try { win.getSubCategories(el.value, level); } catch (e) {}
          }
          if (typeof win.getCategoryFields === 'function') {
            try { win.getCategoryFields(el.value); } catch (e) {}
          }
        } catch (e) {}

        // jQuery in page context
        try {
          const $ = win.$ || win.jQuery;
          if ($ && typeof $(el).trigger === 'function') {
            $(el).trigger('input').trigger('change').trigger('chosen:updated').trigger('select2:select');
          }
        } catch (e) {}

        // MooTools in page context
        try {
          if (win.document && typeof win.document.id === 'function') {
            const mEl = win.document.id(el);
            if (mEl && typeof mEl.fireEvent === 'function') {
              mEl.fireEvent('change');
            }
          }
        } catch (e) {}
      }

      // 4. Injected Page-Context Script Dispatcher
      // In isolated extension / userscript sandboxes, execute directly in the real page execution context
      try {
        const targetDoc = el.ownerDocument || doc || document;
        const root = targetDoc.head || targetDoc.documentElement || targetDoc.body;
        if (root) {
          const scriptEl = targetDoc.createElement('script');
          const elId = el.id ? JSON.stringify(el.id) : 'null';
          const elName = el.name ? JSON.stringify(el.name) : 'null';
          const valStr = JSON.stringify(el.value);
          const lvlNum = typeof level === 'number' ? level : 0;

          scriptEl.textContent = `(function() {
            try {
              var target = null;
              if (${elId}) target = document.getElementById(${elId});
              if (!target && ${elName}) target = document.querySelector('select[name=' + ${elName} + ']');
              if (!target) {
                var allCats = document.querySelectorAll('select[name="parent_id[]"], select[name="category"], select[name="sub_category"], select[name="third_category"], .jomcl-category');
                if (allCats && allCats[${lvlNum}]) target = allCats[${lvlNum}];
              }
              if (target) {
                target.value = ${valStr};
                if (typeof target.onchange === 'function') {
                  try { target.onchange.call(target); } catch(e) {}
                }
                var ev = new Event('change', { bubbles: true, cancelable: true });
                target.dispatchEvent(ev);
              }
              if (typeof window.getsubcat === 'function') {
                try { window.getsubcat(${valStr}, ${lvlNum}); } catch(e) {}
                try { window.getsubcat(${valStr}); } catch(e) {}
              }
              if (typeof window.get_sub_cat === 'function') {
                try { window.get_sub_cat(${valStr}, ${lvlNum}); } catch(e) {}
              }
              if (typeof window.jQuery === 'function' && target) {
                try { window.jQuery(target).trigger('change'); } catch(e) {}
              }
            } catch(err) {}
          })();`;
          root.appendChild(scriptEl);
          scriptEl.remove();
        }
      } catch (e) {}
    },

    async waitFor(predicate, maxWaitMs = 8000, pollIntervalMs = 150) {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitMs) {
        try {
          const res = predicate();
          if (res) return res;
        } catch (e) {}
        await this.sleep(pollIntervalMs);
      }
      return null;
    }
  };

  // --- RESILIENT DROPDOWN MANAGER ---
  const DropdownManager = {
    isValidSelectElement(el) {
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      if (tag === 'SELECT') return true;
      if (el.classList && (el.classList.contains('chosen-container') || el.classList.contains('select2-container'))) return true;
      if (el.getAttribute && (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox')) return true;
      return false;
    },

    /**
     * Strictly targets Category dropdowns by level (0 = Root Category, 1 = Sub Category, 2 = Third Level)
     */
    getCategorySelect(doc, level = 0) {
      if (!doc) doc = document;
      if (level === 0) {
        return doc.querySelector('#category') ||
               doc.querySelector('#target_category') ||
               doc.querySelector('#jform_category') ||
               doc.querySelector('select[name="category"]') ||
               doc.querySelector('#category_div select') ||
               doc.querySelectorAll('select[name="parent_id[]"]')[0] ||
               doc.querySelectorAll('.jomcl-category, select[name*="cat"]')[0] ||
               null;
      } else if (level === 1) {
        return doc.querySelector('#sub_category') ||
               doc.querySelector('#target_sub_category') ||
               doc.querySelector('#target_cars_parts') ||
               doc.querySelector('select[name="sub_category"]') ||
               doc.querySelector('#sub_category_div select') ||
               doc.querySelector('#cat_id_2') ||
               doc.querySelectorAll('select[name="parent_id[]"]')[1] ||
               doc.querySelectorAll('.jomcl-category, select[name*="cat"]')[1] ||
               null;
      } else if (level === 2) {
        return doc.querySelector('#sub_sub_category') ||
               doc.querySelector('#target_used_cars_sa') ||
               doc.querySelector('#third_category') ||
               doc.querySelector('select[name="third_category"]') ||
               doc.querySelector('#sub_sub_category_div select') ||
               doc.querySelector('#cat_id_3') ||
               doc.querySelectorAll('select[name="parent_id[]"]')[2] ||
               doc.querySelectorAll('.jomcl-category, select[name*="cat"]')[2] ||
               null;
      }
      return null;
    },

    /**
     * Inspects options currently available in the control
     */
    getOptions(control) {
      if (!control) return [];
      if (control.tagName === 'SELECT') {
        return Array.from(control.options).map((opt, idx) => ({
          index: idx,
          value: opt.value,
          text: Utils.cleanText(opt.text),
          element: opt,
          selected: opt.selected
        }));
      }

      // Custom dropdown / Chosen / Select2
      if (control.classList && (control.classList.contains('chosen-container') || control.classList.contains('select2-container'))) {
        const nativeSelect = control.parentElement?.querySelector('select') || control.previousElementSibling;
        if (nativeSelect && nativeSelect.tagName === 'SELECT') {
          return this.getOptions(nativeSelect);
        }
      }

      const optionEls = control.querySelectorAll ? control.querySelectorAll('[role="option"], li, .dropdown-item, a') : [];
      return Array.from(optionEls).map((el, idx) => ({
        index: idx,
        value: el.getAttribute('data-value') || el.getAttribute('value') || Utils.cleanText(el.textContent),
        text: Utils.cleanText(el.textContent),
        element: el,
        selected: el.classList.contains('active') || el.classList.contains('selected') || el.getAttribute('aria-selected') === 'true'
      }));
    },

    /**
     * Matches target option against text / value
     */
    matchOption(options, targetMatcher) {
      if (!options || options.length === 0) return null;

      if (typeof targetMatcher === 'function') {
        return options.find(targetMatcher) || null;
      }

      if (targetMatcher instanceof RegExp) {
        return options.find(o => targetMatcher.test(o.text) || targetMatcher.test(o.value)) || null;
      }

      const search = Utils.cleanText(String(targetMatcher)).toLowerCase();
      // Hierarchy: Exact text -> Exact value -> Substring text -> Substring value
      let matched = options.find(o => o.text.toLowerCase() === search);
      if (!matched) matched = options.find(o => o.value.toLowerCase() === search);
      if (!matched) matched = options.find(o => o.text.toLowerCase().includes(search));
      if (!matched) matched = options.find(o => search.includes(o.text.toLowerCase()) && o.text.length > 2);
      if (!matched) matched = options.find(o => o.value.toLowerCase().includes(search));

      return matched || null;
    },

    /**
     * Finds dropdown for a specific level with strict level targeting first, then fallback criteria
     */
    findDropdownForLevel(doc, level, targetMatcher, fallbackCriteria = {}) {
      if (!doc) doc = document;
      const levelSelect = this.getCategorySelect(doc, level);
      if (levelSelect && this.isValidSelectElement(levelSelect)) {
        const opts = this.getOptions(levelSelect);
        const matched = this.matchOption(opts, targetMatcher);
        if (matched) {
          return {
            control: levelSelect,
            option: matched,
            allOptions: opts,
            level: level
          };
        }
      }
      return this.findDropdownWithOption(doc, targetMatcher, fallbackCriteria);
    },

    /**
     * Polls the live DOM for a specific level option
     */
    async waitForLevelOption(doc, level, targetMatcher, fallbackCriteria = {}, maxWaitMs = 8000, pollIntervalMs = 150) {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitMs) {
        const match = this.findDropdownForLevel(doc, level, targetMatcher, fallbackCriteria);
        if (match && match.control && match.option) {
          return match;
        }
        await Utils.sleep(pollIntervalMs);
      }
      return null;
    },

    /**
     * Scans DOM for any dropdown control containing an option matching `targetMatcher`
     */
    findDropdownWithOption(doc, targetMatcher, criteria = {}) {
      if (!doc) doc = document;

      const candidates = [];

      // 1. Direct CSS Selectors
      if (criteria.selectors) {
        for (const sel of criteria.selectors) {
          try {
            const els = doc.querySelectorAll(sel);
            els.forEach(el => {
              if (this.isValidSelectElement(el) && !candidates.includes(el)) candidates.push(el);
            });
          } catch (e) {}
        }
      }

      // 2. Semantic Labels
      if (criteria.labels) {
        const allLabels = doc.querySelectorAll('label, .control-label, .form-label, span.hasPopover, div.control-label, th');
        for (const lbl of allLabels) {
          const lText = Utils.cleanText((lbl.textContent || '') + ' ' + (lbl.getAttribute('title') || ''));
          for (const targetLabel of criteria.labels) {
            const matches = typeof targetLabel === 'string'
              ? lText.toLowerCase().includes(targetLabel.toLowerCase())
              : targetLabel.test(lText);

            if (matches) {
              const forId = lbl.getAttribute('for');
              if (forId) {
                const el = doc.getElementById(forId) || doc.querySelector('#' + CSS.escape(forId));
                if (el && this.isValidSelectElement(el) && !candidates.includes(el)) candidates.push(el);
              }
              const inside = lbl.querySelector('select, [role="combobox"], .chosen-container, .select2-container');
              if (inside && !candidates.includes(inside)) candidates.push(inside);

              const container = lbl.closest('.control-group, .form-group, .demo-form-group, tr, td, .form-item, div') || lbl.parentElement;
              if (container) {
                const siblingSelect = container.querySelector('select, [role="combobox"], .chosen-container, .select2-container');
                if (siblingSelect && this.isValidSelectElement(siblingSelect) && !candidates.includes(siblingSelect)) candidates.push(siblingSelect);
              }
            }
          }
        }
      }

      // 3. Name or ID criteria
      if (criteria.names) {
        for (const name of criteria.names) {
          try {
            const els = doc.querySelectorAll(`select[name="${name}"], select[id="${name}"], select[name*="${name}"], select[id*="${name}"]`);
            els.forEach(el => {
              if (this.isValidSelectElement(el) && !candidates.includes(el)) candidates.push(el);
            });
          } catch (e) {}
        }
      }

      // 4. Fallback: Search all select elements in category containers or whole document
      const allSelects = doc.querySelectorAll('select, [role="combobox"], .chosen-container, .select2-container');
      allSelects.forEach(el => {
        if (!candidates.includes(el)) candidates.push(el);
      });

      // Search through candidate controls for one that contains the target option
      for (const ctrl of candidates) {
        const opts = this.getOptions(ctrl);
        // Exclude placeholder-only dropdowns (e.g., length <= 1 where only "- Sub categories -" exists)
        const matched = this.matchOption(opts, targetMatcher);
        if (matched) {
          return {
            control: ctrl,
            option: matched,
            allOptions: opts
          };
        }
      }

      return null;
    },

    /**
     * Polls the live DOM by continuously re-querying until a dropdown with the target option is found
     */
    async waitForDropdownWithOption(doc, targetMatcher, criteria = {}, maxWaitMs = 8000, pollIntervalMs = 150) {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitMs) {
        const match = this.findDropdownWithOption(doc, targetMatcher, criteria);
        if (match && match.control && match.option) {
          return match;
        }
        await Utils.sleep(pollIntervalMs);
      }
      return null;
    },

    /**
     * Selects an option on the control, triggers all change events, and verifies DOM state
     */
    selectAndVerify(control, targetValueOrText, level = null, doc = null) {
      if (!control) return { success: false, error: 'No dropdown control provided' };

      const options = this.getOptions(control);
      if (options.length === 0) {
        return { success: false, error: 'Dropdown has no options' };
      }

      let matched = this.matchOption(options, targetValueOrText);
      if (!matched) {
        return {
          success: false,
          error: `Option "${targetValueOrText}" not found. Available: [${options.map(o => `"${o.text}"`).join(', ')}]`,
          availableOptions: options.map(o => o.text)
        };
      }

      if (control.tagName === 'SELECT') {
        control.selectedIndex = matched.index;
        control.value = matched.value;
        if (matched.element) matched.element.selected = true;

        if (typeof level === 'number') {
          Utils.triggerCategoryEvents(control, level, doc || control.ownerDocument || document);
        } else {
          Utils.triggerEvents(control);
        }

        // Verify actual selection
        const actualIndex = control.selectedIndex;
        const actualOption = control.options[actualIndex];
        const actualText = actualOption ? Utils.cleanText(actualOption.text) : '';
        const actualValue = control.value;

        const isVerified = (actualValue === matched.value) ||
                           (actualText.toLowerCase() === matched.text.toLowerCase()) ||
                           (actualText.toLowerCase().includes(matched.text.toLowerCase()));

        if (!isVerified) {
          return {
            success: false,
            error: `Selection verification failed. Expected "${matched.text}", actual selected: "${actualText}"`,
            selectedText: actualText,
            selectedValue: actualValue
          };
        }

        return {
          success: true,
          selectedText: actualText,
          selectedValue: actualValue,
          availableOptions: options.map(o => o.text)
        };
      }

      // Handle custom control / click
      if (matched.element) {
        try {
          matched.element.click();
        } catch (e) {
          matched.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
        return {
          success: true,
          selectedText: matched.text,
          selectedValue: matched.value,
          availableOptions: options.map(o => o.text)
        };
      }

      return { success: false, error: 'Unable to select on custom control' };
    },

    // Legacy helper for dry-run inspection
    findDropdown(doc, criteria) {
      if (!doc) doc = document;
      if (criteria.selectors) {
        for (const sel of criteria.selectors) {
          try {
            const el = doc.querySelector(sel);
            if (el && this.isValidSelectElement(el)) return el;
          } catch (e) {}
        }
      }
      if (criteria.labels) {
        const allLabels = doc.querySelectorAll('label, .control-label, .form-label, span.hasPopover, div.control-label, th');
        for (const lbl of allLabels) {
          const lText = Utils.cleanText((lbl.textContent || '') + ' ' + (lbl.getAttribute('title') || ''));
          for (const targetLabel of criteria.labels) {
            const matches = typeof targetLabel === 'string'
              ? lText.toLowerCase().includes(targetLabel.toLowerCase())
              : targetLabel.test(lText);
            if (matches) {
              const forId = lbl.getAttribute('for');
              if (forId) {
                const el = doc.getElementById(forId) || doc.querySelector('#' + CSS.escape(forId));
                if (el && this.isValidSelectElement(el)) return el;
              }
              const inside = lbl.querySelector('select, [role="combobox"], .chosen-container, .select2-container');
              if (inside) return inside;
              const container = lbl.closest('.control-group, .form-group, .demo-form-group, tr, td, .form-item, div') || lbl.parentElement;
              if (container) {
                const siblingSelect = container.querySelector('select, [role="combobox"], .chosen-container, .select2-container');
                if (siblingSelect && this.isValidSelectElement(siblingSelect)) return siblingSelect;
              }
            }
          }
        }
      }
      if (criteria.names) {
        for (const name of criteria.names) {
          const el = doc.querySelector(`select[name="${name}"], select[id="${name}"], select[name*="${name}"], select[id*="${name}"]`);
          if (el && this.isValidSelectElement(el)) return el;
        }
      }
      return null;
    },

    selectOption(control, targetValueOrText) {
      return this.selectAndVerify(control, targetValueOrText);
    }
  };

  // --- DESCRIPTION TOGGLE EDITOR & RICH TEXT MANAGER ---
  const DescriptionManager = {
    findDescriptionControls(doc) {
      if (!doc) doc = document;

      // 1. Locate Toggle Editor button/link
      const toggleButtons = Array.from(doc.querySelectorAll('button, a, .btn, [role="button"], input[type="button"]')).filter(el => {
        const text = Utils.cleanText(el.textContent || el.value || '');
        const onclick = (el.getAttribute('onclick') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        const idOrClass = `${el.id || ''} ${el.className || ''}`.toLowerCase();
        return /toggle\s*editor/i.test(text) ||
               /toggle\s*editor/i.test(title) ||
               /toggleeditor/i.test(onclick) ||
               /toggle-editor|editor-toggle/i.test(idOrClass);
      });

      const toggleEditorBtn = toggleButtons[0] || null;

      // 2. Locate Textarea
      const textarea = doc.querySelector('#target_description, #description, textarea[name="description"], textarea[name*="description"]');

      // 3. Locate Iframe / Rich Text editor container
      const iframe = doc.querySelector('#description_ifr, iframe[id*="description"], .tox-edit-area iframe, .mce-edit-area iframe');
      const contentEditable = doc.querySelector('#target_description[contenteditable="true"], #description[contenteditable="true"], [name="description"][contenteditable="true"], div.note-editable, .tox-edit-area [contenteditable="true"]');

      return {
        toggleEditorBtn,
        textarea,
        iframe,
        contentEditable
      };
    },

    async ensureAndFillDescription(doc, rawDescription, log) {
      if (!rawDescription) return { success: false, error: 'No description text provided' };
      const htmlContent = Utils.normalizeDescHtml(rawDescription);
      const cleanPlainText = rawDescription.replace(/<[^>]+>/g, '').trim();

      log?.('Checking Description editor state...');
      let controls = this.findDescriptionControls(doc);

      // Check if Toggle Editor button exists
      if (controls.toggleEditorBtn) {
        log?.(`Found Toggle Editor control: "${Utils.cleanText(controls.toggleEditorBtn.textContent || 'Toggle Editor')}"`);
        // If iframe / TinyMCE is not ready or textarea is hidden, trigger Toggle Editor
        const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
        const hasTinyMce = !!(win?.tinymce?.get('description') || win?.tinymce?.activeEditor);
        const hasIframeBody = !!(controls.iframe && controls.iframe.contentDocument?.body);

        if (!hasTinyMce && !hasIframeBody && !controls.contentEditable) {
          log?.('Activating Toggle Editor...');
          try {
            controls.toggleEditorBtn.click();
          } catch (e) {
            controls.toggleEditorBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }

          // Wait for editor iframe/instance to become ready
          await Utils.waitFor(() => {
            const re = this.findDescriptionControls(doc);
            const w = doc.defaultView || window;
            return (re.iframe && re.iframe.contentDocument?.body) || (w?.tinymce?.get('description')) || re.contentEditable;
          }, 3000, 150);
        }
      }

      let insertedIntoRichText = false;
      let insertedContent = '';

      // 1. Try TinyMCE instance API
      try {
        const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
        if (win?.tinymce && typeof win.tinymce.get === 'function') {
          const editor = win.tinymce.get('description') ||
                         win.tinymce.get('target_description') ||
                         win.tinymce.activeEditor;
          if (editor) {
            editor.setContent(htmlContent);
            editor.save();
            insertedIntoRichText = true;
            insertedContent = editor.getContent();
            log?.('Inserted formatted HTML via TinyMCE editor instance API.');
          }
        }
      } catch (e) {}

      // 2. Try Joomla editor instance API
      try {
        const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
        if (win?.Joomla?.editors?.instances?.description) {
          win.Joomla.editors.instances.description.setValue(htmlContent);
          insertedIntoRichText = true;
          log?.('Inserted formatted HTML via Joomla.editors instance.');
        }
      } catch (e) {}

      // 3. Try TinyMCE / Rich Text iframe
      try {
        controls = this.findDescriptionControls(doc);
        const iframe = controls.iframe;
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
          iframe.contentDocument.body.innerHTML = htmlContent;
          iframe.contentDocument.body.dispatchEvent(new Event('input', { bubbles: true }));
          iframe.contentDocument.body.dispatchEvent(new Event('change', { bubbles: true }));
          insertedIntoRichText = true;
          insertedContent = iframe.contentDocument.body.innerHTML;
          log?.('Inserted formatted HTML into description editor iframe body.');
        }
      } catch (e) {}

      // 4. Try Contenteditable element
      try {
        controls = this.findDescriptionControls(doc);
        const ce = controls.contentEditable;
        if (ce) {
          ce.innerHTML = htmlContent;
          ce.dispatchEvent(new Event('input', { bubbles: true }));
          ce.dispatchEvent(new Event('change', { bubbles: true }));
          insertedIntoRichText = true;
          insertedContent = ce.innerHTML;
          log?.('Inserted formatted HTML into contenteditable container.');
        }
      } catch (e) {}

      // 5. Always sync underlying Textarea as well
      controls = this.findDescriptionControls(doc);
      const textarea = controls.textarea;
      if (textarea) {
        textarea.value = cleanPlainText;
        Utils.triggerEvents(textarea);
        log?.('Updated description textarea with clean paragraphs.');
      }

      // Verification: Check if content was actually written into editor or textarea
      let isVerified = false;
      if (insertedIntoRichText && insertedContent && insertedContent.length > 10) {
        isVerified = true;
      } else if (textarea && textarea.value && textarea.value.length > 10) {
        isVerified = true;
      }

      if (isVerified) {
        return {
          success: true,
          isRichText: insertedIntoRichText,
          contentLength: (insertedContent || textarea?.value || '').length
        };
      }

      return {
        success: false,
        error: 'Description verification failed: Editor and textarea remained empty after insertion attempt'
      };
    }
  };

  // --- DICE AUTOMATOR CORE CLASS ---
  const DiceAutomator = {
    version: '2.4.0-DICE2',

    /**
     * Inspects the DICE DOM without modifying it (Dry-Run / Diagnostic Mode)
     */
    async runDryRun(targetDoc, extractedFields = {}, options = {}) {
      if (!targetDoc) targetDoc = document;
      const opts = Object.assign({}, DEFAULT_OPTIONS, options);
      const log = (msg) => {
        if (typeof opts.logCallback === 'function') opts.logCallback(msg);
      };

      log(`🔍 [DICE DRY-RUN] Starting diagnostic inspection on document: "${targetDoc.title || 'Untitled'}"...`);

      const checks = {
        diceForm: false,
        category: { found: false, control: null, optionFound: false, targetOption: 'Vehicles' },
        subCategory: { found: false, control: null, optionFound: false, targetOption: 'Car - parts' },
        thirdLevelCategory: { found: false, control: null, optionFound: false, targetOption: 'Used cars in South Africa' },
        priceInput: { found: false, element: null, wouldFill: extractedFields.price || '(extracted price)' },
        priceCurrency: { found: false, control: null, optionFound: false, targetOption: 'R (Rand)' },
        tagDropdown: { found: false, control: null, optionFound: false, targetOption: 'Sale' },
        locationDropdown: { found: false, control: null, optionFound: false, targetOption: 'South Africa' },
        toggleEditor: { found: false, element: null },
        descriptionEditor: { found: false, details: null },
        vehicleFields: { totalFound: 0, expected: 18, details: {} }
      };

      // 1. Detect Form Container
      const formEl = targetDoc.querySelector('form, #adminForm, #legacy-vehicle-form, .form-validate');
      checks.diceForm = !!formEl;
      log(checks.diceForm ? '✓ DICE form container located.' : '⚠️ Generic document mode (no explicit form tag).');

      // 2. Category Control (Level 0)
      const catMatch = DropdownManager.findDropdownForLevel(targetDoc, 0, /vehicles/i, {
        selectors: ['#target_category', '#category', '#jform_category', 'select[name="category"]', 'select[name="parent_id"]', 'select[name="parent_id[]"]', 'select[name*="cat"]'],
        labels: [/^category\s*\*?$/i, /\bcategory\b/i],
        names: ['category', 'target_category', 'parent_id', 'parent_id[]', 'catid']
      });
      if (catMatch) {
        checks.category.found = true;
        checks.category.control = catMatch.control.id || catMatch.control.name || catMatch.control.tagName;
        checks.category.optionFound = true;
        log(`✓ Category dropdown found (id: "${checks.category.control}"). "Vehicles" option: FOUND ✓`);
      } else {
        log('✗ Category dropdown with "Vehicles" option NOT FOUND.');
      }

      // 3. Sub Category Control (Level 1)
      const subCatMatch = DropdownManager.findDropdownForLevel(targetDoc, 1, /car\s*-\s*parts/i, {
        selectors: ['#target_cars_parts', '#target_sub_category', '#sub_category', 'select[name="sub_category"]', 'select[name*="sub_cat"]', '#cat_id_2', 'select[name="parent_id[]"]'],
        labels: [/sub\s*category\s*\*?$/i, /cars?\s*-\s*parts\s*\*?$/i, /\bsub-category\b/i],
        names: ['sub_category', 'target_cars_parts', 'subcatid', 'cat_id_2', 'parent_id[]']
      });
      if (subCatMatch) {
        checks.subCategory.found = true;
        checks.subCategory.control = subCatMatch.control.id || subCatMatch.control.name || subCatMatch.control.tagName;
        checks.subCategory.optionFound = true;
        log(`✓ Sub Category dropdown found. "Car - parts" option: FOUND ✓`);
      } else {
        log('ℹ️ Sub Category dropdown with "Car - parts" not visible initially (loads via AJAX after Category selection).');
      }

      // 4. Third-level Category Control (Level 2)
      const thirdCatMatch = DropdownManager.findDropdownForLevel(targetDoc, 2, /used\s*cars\s*in\s*south\s*africa|all\s*south\s*africa/i, {
        selectors: ['#target_used_cars_sa', '#third_category', 'select[name="third_category"]', 'select[name*="third"]', '#cat_id_3', 'select[name="parent_id[]"]'],
        labels: [/used\s*cars\s*in\s*south\s*africa\s*\*?$/i, /third-level/i, /sub\s*sub\s*category/i],
        names: ['third_category', 'target_used_cars_sa', 'cat_id_3', 'parent_id[]']
      });
      if (thirdCatMatch) {
        checks.thirdLevelCategory.found = true;
        checks.thirdLevelCategory.control = thirdCatMatch.control.id || thirdCatMatch.control.name || thirdCatMatch.control.tagName;
        checks.thirdLevelCategory.optionFound = true;
        log(`✓ 3rd-level Category dropdown found. "Used cars in South Africa" option: FOUND ✓`);
      } else {
        log('ℹ️ 3rd-level Category dropdown not visible initially (loads via AJAX after Sub Category selection).');
      }

      // 5. Price & Price Currency
      const priceInp = targetDoc.querySelector('#target_price, #price, input[name="price"], input[name*="listing_price"]');
      if (priceInp) {
        checks.priceInput.found = true;
        checks.priceInput.element = priceInp.id || priceInp.name;
        log(`✓ Price input found (id: "${checks.priceInput.element}").`);
      } else {
        log('✗ Price input NOT FOUND.');
      }

      const currMatch = DropdownManager.findDropdownWithOption(targetDoc, /\br\b|\brand\b|zar/i, {
        selectors: ['#target_currency', '#currency', 'select[name="currency"]', 'select[name*="currency"]'],
        labels: [/^currency\s*\*?$/i, /price\s*currency/i],
        names: ['currency', 'target_currency']
      });
      if (currMatch) {
        checks.priceCurrency.found = true;
        checks.priceCurrency.control = currMatch.control.id || currMatch.control.name || currMatch.control.tagName;
        checks.priceCurrency.optionFound = true;
        log(`✓ Price currency dropdown found. "R (Rand)" option: FOUND ✓`);
      } else {
        log('✗ Price currency dropdown NOT FOUND.');
      }

      // 6. Tag Dropdown
      const tagMatch = DropdownManager.findDropdownWithOption(targetDoc, /sale/i, {
        selectors: ['#target_tags', '#target_tag', '#tags', '#tag', 'select[name="tags"]', 'select[name="tag"]', 'select[name*="tag"]'],
        labels: [/^tags?\s*(?:dropdown)?\s*\*?$/i, /\btag\b/i],
        names: ['tags', 'tag', 'target_tags']
      });
      if (tagMatch) {
        checks.tagDropdown.found = true;
        checks.tagDropdown.control = tagMatch.control.id || tagMatch.control.name || tagMatch.control.tagName;
        checks.tagDropdown.optionFound = true;
        log(`✓ Tag dropdown found. "Sale" option: FOUND ✓`);
      } else {
        log('✗ Tag dropdown NOT FOUND.');
      }

      // 7. Location Dropdown
      const locMatch = DropdownManager.findDropdownWithOption(targetDoc, /south\s*africa/i, {
        selectors: ['#target_country', '#target_location', '#country', '#location', 'select[name="location"]', 'select[name="country"]', 'select[name*="location"]', 'select[name*="country"]'],
        labels: [/^location\s*(?:dropdown)?\s*\*?$/i, /^country\s*(?:\/\s*location)?\s*\*?$/i, /\blocation\b/i],
        names: ['country', 'location', 'target_country', 'target_location']
      });
      if (locMatch) {
        checks.locationDropdown.found = true;
        checks.locationDropdown.control = locMatch.control.id || locMatch.control.name || locMatch.control.tagName;
        checks.locationDropdown.optionFound = true;
        log(`✓ Location dropdown found. "South Africa" option: FOUND ✓`);
      } else {
        log('✗ Location dropdown NOT FOUND.');
      }

      // 8. Description Controls
      const descControls = DescriptionManager.findDescriptionControls(targetDoc);
      checks.toggleEditor.found = !!descControls.toggleEditorBtn;
      checks.toggleEditor.element = descControls.toggleEditorBtn ? descControls.toggleEditorBtn.tagName : null;
      checks.descriptionEditor.found = !!(descControls.textarea || descControls.iframe || descControls.contentEditable);
      log(`✓ Description Toggle Editor: ${checks.toggleEditor.found ? 'FOUND ✓' : 'NOT FOUND'}`);

      // 9. Check 18 Mapped Vehicle Fields
      const fieldList = [
        { key: 'title', label: 'Title', selectors: ['#target_vehicle_title', '#target_title', '#title', 'input[name="title"]'] },
        { key: 'titleDescription', label: 'Title Description', selectors: ['#target_title_description', '#title_description', 'input[name="title_description"]'] },
        { key: 'year', label: 'Year', selectors: ['#target_year', '#year', 'input[name="year"]'] },
        { key: 'kilometersDriven', label: 'Kilometers Driven', selectors: ['#target_kilometers_driven', '#target_mileage', '#kilometers_driven', '#mileage', 'input[name="kilometers_driven"]'] },
        { key: 'transmission', label: 'Transmission', selectors: ['#target_transmission', '#transmission', 'input[name="transmission"]'] },
        { key: 'fuel', label: 'Fuel', selectors: ['#target_fuel', '#fuel', 'input[name="fuel"]'] },
        { key: 'drivetrain', label: '4x2 / 4x4', selectors: ['#target_drivetrain', '#drivetrain', 'input[name="drivetrain"]'] },
        { key: 'bodyColor', label: 'Body Color', selectors: ['#target_body_colour', '#target_body_color', '#body_colour', '#body_color', 'input[name="body_colour"]'] },
        { key: 'condition', label: 'Condition', selectors: ['#target_condition_input', '#fields_45', 'input[name="fields[45]"]'] },
        { key: 'seats', label: 'Seats', selectors: ['#target_seats', '#seats', 'input[name="seats"]'] },
        { key: 'pricingSummary', label: 'Pricing Summary', selectors: ['#target_pricing_summary', '#pricing_summary', 'input[name*="pricing_summary"]'] },
        { key: 'dealerName', label: 'Dealer Name', selectors: ['#target_dealer_name', '#dealer_name', 'input[name*="dealer_name"]'] },
        { key: 'dealerAddress', label: 'Dealer Address', selectors: ['#target_dealer_address', '#dealer_address', 'input[name*="dealer_address"]'] },
        { key: 'dealerRating', label: 'Dealer Average Rating', selectors: ['#target_dealer_rating', '#dealer_rating', 'input[name*="dealer_rating"]'] },
        { key: 'features', label: 'Features', selectors: ['#target_features_text', '#target_features', '#features', 'textarea[name="features"]'] },
        { key: 'contactNumber', label: 'Contact Number', selectors: ['#target_contact_number', '#contact_number', '#phone', 'input[name="contact_number"]'] },
        { key: 'sourceUrl', label: 'Source Link', selectors: ['#target_source_url', '#source_url', 'input[name*="source_url"]'] },
        { key: 'vehicleHighlights', label: 'Vehicle Highlights', selectors: ['#target_vehicle_highlights', '#vehicle_highlights', 'textarea[name="vehicle_highlights"]'] }
      ];

      let foundCount = 0;
      fieldList.forEach(f => {
        let el = null;
        for (const sel of f.selectors) {
          try {
            el = targetDoc.querySelector(sel);
            if (el) break;
          } catch (e) {}
        }
        const val = extractedFields[f.key] || '(pending)';
        checks.vehicleFields.details[f.key] = {
          label: f.label,
          found: !!el,
          element: el ? (el.id || el.name || el.tagName) : null,
          wouldFill: val
        };
        if (el) foundCount++;
      });
      checks.vehicleFields.totalFound = foundCount;

      log(`\n📋 [DRY-RUN SUMMARY]: Detected ${foundCount} of ${fieldList.length} vehicle input fields.`);
      log('✓ Dry-run completed with 0 form modifications.');

      return {
        success: true,
        isDryRun: true,
        checks,
        timestamp: new Date().toISOString()
      };
    },

    /**
     * Executes the live, non-destructive automatic form-filling sequence with strict verification at every step.
     */
    async fillForm(targetDoc, extractedData, options = {}) {
      if (!targetDoc) targetDoc = document;
      if (!extractedData) return { success: false, error: 'No extracted vehicle data provided.' };

      const fields = extractedData.fields || extractedData.normalized || extractedData;
      const opts = Object.assign({}, DEFAULT_OPTIONS, options);
      const log = (msg) => {
        if (typeof opts.logCallback === 'function') opts.logCallback(msg);
      };
      const notifyStep = (stepName, status, details) => {
        if (typeof opts.onStep === 'function') opts.onStep({ step: stepName, status, details });
      };

      const result = {
        success: false,
        failedStep: null,
        stepsCompleted: [],
        fieldVerifications: [],
        errors: [],
        timestamp: new Date().toISOString()
      };

      log(`🚀 [DICE AUTO-FILL] Beginning form automation for: "${fields.title || 'Vehicle Listing'}"...`);

      try {
        // ================================================================
        // STEP 1: CATEGORY → Vehicles
        // ================================================================
        notifyStep('Category', 'running', 'Locating & Selecting Category → Vehicles');
        log('1. Locating Category dropdown (option: "Vehicles")...');

        const catMatch = await DropdownManager.waitForLevelOption(targetDoc, 0, /vehicles/i, {
          selectors: ['#target_category', '#category', '#jform_category', 'select[name="category"]', 'select[name="parent_id"]', 'select[name="parent_id[]"]', 'select[name*="cat"]'],
          labels: [/^category\s*\*?$/i, /\bcategory\b/i],
          names: ['category', 'target_category', 'parent_id', 'parent_id[]', 'catid']
        }, opts.maxWaitMs, opts.pollIntervalMs);

        if (!catMatch || !catMatch.control) {
          const err = 'Could not find Category dropdown containing option "Vehicles"';
          log(`❌ ${err}`);
          result.failedStep = 'Category';
          result.errors.push(err);
          this.renderErrorBanner(targetDoc, 'Could not select Category: Vehicles');
          notifyStep('Category', 'failed', err);
          return result;
        }

        const catSelRes = DropdownManager.selectAndVerify(catMatch.control, 'Vehicles', 0, targetDoc);
        log(`Category:\n  selector → ${catMatch.control.id || catMatch.control.name || catMatch.control.tagName}\n  selected value → ${catSelRes.selectedText}\n  status → ${catSelRes.success ? 'PASS' : 'FAIL'}`);

        if (!catSelRes.success) {
          const err = `Category selection failed: ${catSelRes.error}`;
          log(`❌ ${err}`);
          result.failedStep = 'Category';
          result.errors.push(err);
          this.renderErrorBanner(targetDoc, 'Could not select Category: Vehicles');
          notifyStep('Category', 'failed', err);
          return result;
        }

        result.stepsCompleted.push('Category: Vehicles');
        notifyStep('Category', 'completed', catSelRes.selectedText);

        // ================================================================
        // STEP 2: SUB CATEGORY → Car - parts (WAIT FOR AJAX UPDATE)
        // ================================================================
        notifyStep('SubCategory', 'running', 'Waiting for Sub Category options to load (AJAX) → Car - parts');
        log('2. Waiting for Sub Category dropdown to populate with "Car - parts"...');

        const subCatMatch = await DropdownManager.waitForLevelOption(targetDoc, 1, /car\s*-\s*parts|cars?\s*-\s*parts/i, {
          selectors: ['#target_cars_parts', '#target_sub_category', '#sub_category', 'select[name="sub_category"]', 'select[name*="sub_cat"]', '#cat_id_2', 'select[name="parent_id[]"]'],
          labels: [/sub\s*category\s*\*?$/i, /cars?\s*-\s*parts\s*\*?$/i, /\bsub-category\b/i],
          names: ['sub_category', 'target_cars_parts', 'subcatid', 'cat_id_2', 'parent_id[]']
        }, opts.maxWaitMs, opts.pollIntervalMs);

        if (!subCatMatch || !subCatMatch.control) {
          const err = 'Could not select Sub Category: Car - parts (dropdown option did not populate in time)';
          log(`❌ ${err}`);
          result.failedStep = 'Sub Category';
          result.errors.push(err);
          this.renderErrorBanner(targetDoc, 'Could not select Sub Category: Car - parts');
          notifyStep('SubCategory', 'failed', err);
          return result;
        }

        const subCatSelRes = DropdownManager.selectAndVerify(subCatMatch.control, 'Car - parts', 1, targetDoc);
        log(`Sub Category:\n  selector → ${subCatMatch.control.id || subCatMatch.control.name || subCatMatch.control.tagName}\n  available options → [${(subCatSelRes.availableOptions || []).join(', ')}]\n  selected value → ${subCatSelRes.selectedText}\n  status → ${subCatSelRes.success ? 'PASS' : 'FAIL'}`);

        if (!subCatSelRes.success) {
          const err = `Sub Category selection failed: ${subCatSelRes.error}`;
          log(`❌ ${err}`);
          result.failedStep = 'Sub Category';
          result.errors.push(err);
          this.renderErrorBanner(targetDoc, 'Could not select Sub Category: Car - parts');
          notifyStep('SubCategory', 'failed', err);
          return result;
        }

        result.stepsCompleted.push('SubCategory: Car - parts');
        notifyStep('SubCategory', 'completed', subCatSelRes.selectedText);

        // ================================================================
        // STEP 3: THIRD-LEVEL CATEGORY → Used cars in South Africa (WAIT FOR AJAX UPDATE)
        // ================================================================
        notifyStep('ThirdLevelCategory', 'running', 'Waiting for Third-level Category options to load (AJAX) → Used cars in South Africa');
        log('3. Waiting for Third-level Category dropdown to populate with "Used cars in South Africa"...');

        const thirdCatMatch = await DropdownManager.waitForLevelOption(targetDoc, 2, /used\s*cars\s*in\s*south\s*africa|all\s*south\s*africa/i, {
          selectors: ['#target_used_cars_sa', '#third_category', 'select[name="third_category"]', 'select[name*="third"]', '#cat_id_3', 'select[name="parent_id[]"]'],
          labels: [/used\s*cars\s*in\s*south\s*africa\s*\*?$/i, /third-level/i, /sub\s*sub\s*category/i],
          names: ['third_category', 'target_used_cars_sa', 'cat_id_3', 'parent_id[]']
        }, opts.maxWaitMs, opts.pollIntervalMs);

        if (!thirdCatMatch || !thirdCatMatch.control) {
          const err = 'Could not select Third-level Sub Category: Used cars in South Africa (dropdown option did not populate in time)';
          log(`❌ ${err}`);
          result.failedStep = 'Third-level Category';
          result.errors.push(err);
          this.renderErrorBanner(targetDoc, 'Could not select Third-level Category: Used cars in South Africa');
          notifyStep('ThirdLevelCategory', 'failed', err);
          return result;
        }

        const thirdCatSelRes = DropdownManager.selectAndVerify(thirdCatMatch.control, 'Used cars in South Africa', 2, targetDoc);
        log(`Third-level:\n  selector → ${thirdCatMatch.control.id || thirdCatMatch.control.name || thirdCatMatch.control.tagName}\n  available options → [${(thirdCatSelRes.availableOptions || []).join(', ')}]\n  selected value → ${thirdCatSelRes.selectedText}\n  status → ${thirdCatSelRes.success ? 'PASS' : 'FAIL'}`);

        if (!thirdCatSelRes.success) {
          const err = `Third-level Category selection failed: ${thirdCatSelRes.error}`;
          log(`❌ ${err}`);
          result.failedStep = 'Third-level Category';
          result.errors.push(err);
          this.renderErrorBanner(targetDoc, 'Could not select Third-level Category: Used cars in South Africa');
          notifyStep('ThirdLevelCategory', 'failed', err);
          return result;
        }

        result.stepsCompleted.push('ThirdLevelCategory: Used cars in South Africa');
        notifyStep('ThirdLevelCategory', 'completed', thirdCatSelRes.selectedText);

        // ================================================================
        // STEP 4: WAIT FOR VEHICLE FIELDS TO REVEAL / UNHIDE
        // ================================================================
        notifyStep('VehicleFields', 'running', 'Waiting for vehicle form fields to reveal in DOM...');
        log('4. Waiting for vehicle fields container to reveal...');

        const fieldsReady = await Utils.waitFor(() => {
          const titleInp = targetDoc.querySelector('#target_vehicle_title, #target_title, #title, input[name="title"]');
          const priceInp = targetDoc.querySelector('#target_price, #price, input[name="price"]');
          const container = targetDoc.querySelector('#dice-vehicle-fields-section, .form-horizontal, form');
          if (titleInp || priceInp) return true;
          if (container && container.style.display !== 'none') return true;
          return false;
        }, opts.maxWaitMs, opts.pollIntervalMs);

        if (!fieldsReady) {
          log('⚠️ Warning: Main vehicle fields not explicitly detected yet, proceeding to populate...');
        }
        await Utils.sleep(opts.stepDelayMs);

        // ================================================================
        // STEP 5: POPULATE VEHICLE INPUT FIELDS
        // ================================================================
        log('5. Populating vehicle input fields...');
        if (typeof window !== 'undefined' && window.CarSmartPasteEngine && typeof window.CarSmartPasteEngine.fillTargetForm === 'function') {
          window.CarSmartPasteEngine.fillTargetForm(targetDoc, fields);
          log('✓ Applied vehicle field mapping via core Smart Engine.');
        } else if (typeof window !== 'undefined' && window.CarTargetFiller && typeof window.CarTargetFiller.fillForm === 'function') {
          window.CarTargetFiller.fillForm(targetDoc, fields);
          log('✓ Applied vehicle field mapping via TargetFiller.');
        }
        result.stepsCompleted.push('Vehicle Fields Populated');

        // ================================================================
        // STEP 6: PRICE ROW → Price input (pure numeric digits) + Currency → R (Rand)
        // ================================================================
        notifyStep('PriceRow', 'running', 'Setting Price and Currency → R (Rand)');
        log('6. Handling Price row (numeric price + R (Rand) currency)...');
        const priceInp = targetDoc.querySelector('#target_price, #price, input[name="price"], input[name*="listing_price"]');
        if (priceInp && fields.price) {
          const digitsOnly = String(fields.price).replace(/[^\d]/g, '');
          if (digitsOnly) {
            priceInp.value = digitsOnly;
            Utils.triggerEvents(priceInp);
            log(`✓ Set Price value: "${digitsOnly}"`);
          }
        }

        const currMatch = DropdownManager.findDropdownWithOption(targetDoc, /\br\b|\brand\b|zar/i, {
          selectors: ['#target_currency', '#currency', 'select[name="currency"]', 'select[name*="currency"]'],
          labels: [/^currency\s*\*?$/i, /price\s*currency/i],
          names: ['currency', 'target_currency']
        });

        if (currMatch) {
          const selRes = DropdownManager.selectAndVerify(currMatch.control, 'R (Rand)');
          if (selRes.success) {
            log(`✓ Selected Price Currency → "${selRes.selectedText}"`);
            result.stepsCompleted.push('Price Currency: R (Rand)');
          } else {
            // Fallback try ZAR or R
            const fallbackRes = DropdownManager.selectAndVerify(currMatch.control, 'ZAR') || DropdownManager.selectAndVerify(currMatch.control, 'R');
            if (fallbackRes && fallbackRes.success) {
              log(`✓ Selected Price Currency fallback → "${fallbackRes.selectedText}"`);
              result.stepsCompleted.push(`Price Currency: ${fallbackRes.selectedText}`);
            } else {
              log(`⚠️ Price currency selection warning: ${selRes.error}`);
            }
          }
        }
        notifyStep('PriceRow', 'completed', 'Price + R (Rand)');

        // ================================================================
        // STEP 7: TAG DROPDOWN → Sale
        // ================================================================
        notifyStep('Tag', 'running', 'Selecting Tag → Sale');
        log('7. Locating Tag dropdown...');
        const tagMatch = DropdownManager.findDropdownWithOption(targetDoc, /sale/i, {
          selectors: ['#target_tags', '#target_tag', '#tags', '#tag', 'select[name="tags"]', 'select[name="tag"]', 'select[name*="tag"]'],
          labels: [/^tags?\s*(?:dropdown)?\s*\*?$/i, /\btag\b/i],
          names: ['tags', 'tag', 'target_tags']
        });

        if (tagMatch) {
          const selRes = DropdownManager.selectAndVerify(tagMatch.control, 'Sale');
          if (selRes.success) {
            log(`✓ Selected Tag → "${selRes.selectedText}"`);
            result.stepsCompleted.push('Tag: Sale');
            notifyStep('Tag', 'completed', selRes.selectedText);
          } else {
            log(`⚠️ Tag selection warning: ${selRes.error}`);
          }
        }

        // ================================================================
        // STEP 8: LOCATION DROPDOWN → South Africa
        // ================================================================
        notifyStep('Location', 'running', 'Selecting Location → South Africa');
        log('8. Locating Location dropdown...');
        const locMatch = DropdownManager.findDropdownWithOption(targetDoc, /south\s*africa/i, {
          selectors: ['#target_country', '#target_location', '#country', '#location', 'select[name="location"]', 'select[name="country"]', 'select[name*="location"]', 'select[name*="country"]'],
          labels: [/^location\s*(?:dropdown)?\s*\*?$/i, /^country\s*(?:\/\s*location)?\s*\*?$/i, /\blocation\b/i],
          names: ['country', 'location', 'target_country', 'target_location']
        });

        if (locMatch) {
          const selRes = DropdownManager.selectAndVerify(locMatch.control, 'South Africa');
          if (selRes.success) {
            log(`✓ Selected Location → "${selRes.selectedText}"`);
            result.stepsCompleted.push('Location: South Africa');
            notifyStep('Location', 'completed', selRes.selectedText);
          } else {
            log(`⚠️ Location selection warning: ${selRes.error}`);
          }
        }

        // ================================================================
        // STEP 9: DESCRIPTION WITH TOGGLE EDITOR FLOW
        // ================================================================
        notifyStep('Description', 'running', 'Processing Toggle Editor & inserting Description...');
        log('9. Processing Description editor area and Toggle Editor...');
        if (fields.description) {
          const descRes = await DescriptionManager.ensureAndFillDescription(targetDoc, fields.description, log);
          log(`Description:\n  editor type → ${descRes.isRichText ? 'RichText (TinyMCE/iframe)' : 'Textarea'}\n  content inserted → ${descRes.success ? 'PASS' : 'FAIL'}`);

          if (descRes.success) {
            result.stepsCompleted.push('Description Inserted');
            notifyStep('Description', 'completed', 'HTML formatted description inserted');
          } else {
            log(`❌ Description error: ${descRes.error}`);
            result.errors.push(`Description: ${descRes.error}`);
          }
        }

        // ================================================================
        // STEP 10: VERIFY EVERY FIELD & PREVENT FALSE SUCCESS
        // ================================================================
        notifyStep('Verification', 'running', 'Verifying populated fields in DOM...');
        log('10. Verifying all field values in DOM...');
        await Utils.sleep(opts.stepDelayMs);

        // Verification checks for all filled fields
        const fieldVerificationList = [
          { key: 'title', label: 'Title', selectors: ['#target_vehicle_title', '#target_title', '#title', 'input[name="title"]'] },
          { key: 'year', label: 'Year', selectors: ['#target_year', '#year', 'input[name="year"]'] },
          { key: 'kilometersDriven', label: 'Kilometers Driven', selectors: ['#target_kilometers_driven', '#target_mileage', '#kilometers_driven', '#mileage', 'input[name="kilometers_driven"]'] },
          { key: 'price', label: 'Price', selectors: ['#target_price', '#price', 'input[name="price"]'], isPrice: true }
        ];

        let hasFieldVerificationFailure = false;
        let failedFieldName = '';

        for (const item of fieldVerificationList) {
          const expectedVal = fields[item.key];
          if (!expectedVal) continue;

          let el = null;
          for (const sel of item.selectors) {
            try {
              el = targetDoc.querySelector(sel);
              if (el) break;
            } catch (e) {}
          }

          const actualVal = el ? Utils.cleanText(el.value) : '';
          const pass = el && (actualVal.length > 0);

          log(`Field Verification [${item.label}]:\n  target → ${el ? (el.id || el.name || sel) : 'NOT FOUND'}\n  expected → ${expectedVal}\n  actual → ${actualVal || '(EMPTY)'}\n  status → ${pass ? 'PASS' : 'FAIL'}`);

          result.fieldVerifications.push({
            field: item.label,
            target: el ? (el.id || el.name) : null,
            expected: expectedVal,
            actual: actualVal,
            status: pass ? 'PASS' : 'FAIL'
          });

          if (!pass) {
            hasFieldVerificationFailure = true;
            failedFieldName = item.label;
          }
        }

        if (hasFieldVerificationFailure) {
          const err = `Auto-fill incomplete: Failed field: ${failedFieldName}`;
          log(`❌ ${err}`);
          result.failedStep = failedFieldName;
          result.errors.push(err);
          this.renderErrorBanner(targetDoc, `Failed field: ${failedFieldName}`);
          notifyStep('Verification', 'failed', err);
          return result;
        }

        // All checks passed!
        result.success = true;
        log('\n==================================================');
        log('✓ Auto-fill completed');
        log('Please review the form before manually submitting.');
        log('==================================================');

        notifyStep('Verification', 'completed', 'Auto-fill completed. Ready for manual review.');
        this.renderCompletionBanner(targetDoc);

        return result;

      } catch (err) {
        log(`❌ Auto-fill encountered an error: ${err.message}`);
        result.errors.push(err.message);
        this.renderErrorBanner(targetDoc, err.message);
        notifyStep('Error', 'failed', err.message);
        return result;
      }
    },

    /**
     * Injects a floating banner informing the user that automation has finished
     * and prompting for manual review before final submission.
     */
    renderCompletionBanner(targetDoc) {
      if (!targetDoc || !targetDoc.body) return;
      try {
        const existing = targetDoc.getElementById('dice-autofill-banner');
        if (existing) existing.remove();

        const banner = targetDoc.createElement('div');
        banner.id = 'dice-autofill-banner';
        banner.style.cssText = `
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          background: #0f172a;
          color: #f8fafc;
          padding: 12px 20px;
          border-radius: 8px;
          border-left: 5px solid #22c55e;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
          z-index: 99999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 12px;
        `;

        banner.innerHTML = `
          <div style="font-size: 18px;">✅</div>
          <div>
            <div style="font-weight: 700; color: #4ade80; font-size: 14px;">✓ Auto-fill completed</div>
            <div style="color: #94a3b8; font-size: 12px;">Please review the form before manually submitting.</div>
          </div>
          <button id="dice-banner-close" style="background: transparent; border: none; color: #64748b; font-size: 16px; cursor: pointer; padding: 2px 6px; margin-left: 8px;">✕</button>
        `;

        targetDoc.body.appendChild(banner);
        const closeBtn = banner.querySelector('#dice-banner-close');
        if (closeBtn) {
          closeBtn.onclick = () => banner.remove();
        }
        setTimeout(() => {
          if (banner.parentElement) banner.remove();
        }, 12000);
      } catch (e) {}
    },

    /**
     * Injects a red error banner when automation stops or fails
     */
    renderErrorBanner(targetDoc, reason) {
      if (!targetDoc || !targetDoc.body) return;
      try {
        const existing = targetDoc.getElementById('dice-autofill-banner');
        if (existing) existing.remove();

        const banner = targetDoc.createElement('div');
        banner.id = 'dice-autofill-banner';
        banner.style.cssText = `
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          background: #1e1014;
          color: #f8fafc;
          padding: 12px 20px;
          border-radius: 8px;
          border-left: 5px solid #ef4444;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
          z-index: 99999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 12px;
        `;

        banner.innerHTML = `
          <div style="font-size: 18px;">❌</div>
          <div>
            <div style="font-weight: 700; color: #f87171; font-size: 14px;">❌ Auto-fill stopped</div>
            <div style="color: #cbd5e1; font-size: 12px;">${reason}</div>
          </div>
          <button id="dice-banner-close" style="background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 2px 6px; margin-left: 8px;">✕</button>
        `;

        targetDoc.body.appendChild(banner);
        const closeBtn = banner.querySelector('#dice-banner-close');
        if (closeBtn) {
          closeBtn.onclick = () => banner.remove();
        }
      } catch (e) {}
    }
  };

  return DiceAutomator;
}));
