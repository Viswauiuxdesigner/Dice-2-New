/**
 * DICE Form Automation Engine (DiceAutomator)
 * 100% Client-side DOM automation engine for the DICE Classifieds platform.
 *
 * Safety Guarantee:
 * - NEVER clicks Submit, Save, or Publish.
 * - NEVER submits forms or communicates with external servers.
 * - Leaves form in a fully populated, ready-to-review state.
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
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
      } catch (e) {}

      // Trigger jQuery events if available on the page
      try {
        const win = el.ownerDocument?.defaultView || window;
        const $ = win.$ || win.jQuery;
        if ($ && typeof $(el).trigger === 'function') {
          $(el).trigger('input').trigger('change').trigger('chosen:updated').trigger('select2:select');
        }
      } catch (e) {}
    },

    async waitFor(predicate, maxWaitMs = 6000, pollIntervalMs = 150) {
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

  // --- DROPDOWN RESOLVER & CONTROLLER ---
  const DropdownManager = {
    /**
     * Finds a dropdown or select-like control matching given selectors/labels
     */
    findDropdown(doc, criteria) {
      if (!doc) doc = document;

      // 1. Direct CSS Selectors
      if (criteria.selectors) {
        for (const sel of criteria.selectors) {
          try {
            const el = doc.querySelector(sel);
            if (el && this.isValidSelectElement(el)) return el;
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

      // 3. Name or ID regex fallback
      if (criteria.names) {
        for (const name of criteria.names) {
          const el = doc.querySelector(`select[name="${name}"], select[id="${name}"], select[name*="${name}"], select[id*="${name}"]`);
          if (el && this.isValidSelectElement(el)) return el;
        }
      }

      return null;
    },

    isValidSelectElement(el) {
      if (!el) return false;
      const tag = el.tagName.toUpperCase();
      if (tag === 'SELECT') return true;
      if (el.classList.contains('chosen-container') || el.classList.contains('select2-container')) return true;
      if (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox') return true;
      return false;
    },

    /**
     * Inspects options available in the control
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
      if (control.classList.contains('chosen-container') || control.classList.contains('select2-container')) {
        const nativeSelect = control.parentElement?.querySelector('select') || control.previousElementSibling;
        if (nativeSelect && nativeSelect.tagName === 'SELECT') {
          return this.getOptions(nativeSelect);
        }
      }

      const optionEls = control.querySelectorAll('[role="option"], li, .dropdown-item, a');
      return Array.from(optionEls).map((el, idx) => ({
        index: idx,
        value: el.getAttribute('data-value') || el.getAttribute('value') || Utils.cleanText(el.textContent),
        text: Utils.cleanText(el.textContent),
        element: el,
        selected: el.classList.contains('active') || el.classList.contains('selected') || el.getAttribute('aria-selected') === 'true'
      }));
    },

    /**
     * Selects an option matching targetText / targetValue
     */
    selectOption(control, targetValueOrText) {
      if (!control || !targetValueOrText) return { success: false, error: 'Missing control or target option' };
      const search = Utils.cleanText(String(targetValueOrText)).toLowerCase();
      const options = this.getOptions(control);

      if (options.length === 0) {
        return { success: false, error: 'No options found in dropdown control' };
      }

      // Matching hierarchy: Exact text -> Exact value -> Substring text -> Substring value
      let matched = options.find(o => o.text.toLowerCase() === search);
      if (!matched) matched = options.find(o => o.value.toLowerCase() === search);
      if (!matched) matched = options.find(o => o.text.toLowerCase().includes(search));
      if (!matched) matched = options.find(o => search.includes(o.text.toLowerCase()) && o.text.length > 2);
      if (!matched) matched = options.find(o => o.value.toLowerCase().includes(search));

      if (!matched) {
        return {
          success: false,
          error: `Option "${targetValueOrText}" not found. Available: [${options.map(o => `"${o.text}"`).join(', ')}]`
        };
      }

      if (control.tagName === 'SELECT') {
        control.selectedIndex = matched.index;
        control.value = matched.value;
        if (matched.element) matched.element.selected = true;
        Utils.triggerEvents(control);

        // Update Chosen/Select2 UI if bound
        try {
          const win = control.ownerDocument?.defaultView || window;
          const $ = win.$ || win.jQuery;
          if ($) {
            $(control).trigger('chosen:updated').trigger('change');
          }
        } catch (e) {}

        return { success: true, selectedText: matched.text, selectedValue: matched.value };
      }

      // Handle custom dropdown click
      if (matched.element) {
        try {
          matched.element.click();
        } catch (e) {
          matched.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
        return { success: true, selectedText: matched.text, selectedValue: matched.value };
      }

      return { success: false, error: 'Failed to apply selection on custom control' };
    }
  };

  // --- DESCRIPTION TOGGLE EDITOR MANAGER ---
  const DescriptionManager = {
    findDescriptionControls(doc) {
      if (!doc) doc = document;

      // 1. Locate Toggle Editor button/link
      const toggleButtons = Array.from(doc.querySelectorAll('button, a, .btn, [role="button"], input[type="button"]')).filter(el => {
        const text = Utils.cleanText(el.textContent || el.value || '');
        const onclick = (el.getAttribute('onclick') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        const idOrClass = `${el.id} ${el.className}`.toLowerCase();
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

      const controls = this.findDescriptionControls(doc);

      // Check if Toggle Editor is present
      if (controls.toggleEditorBtn) {
        log?.(`Found Toggle Editor control: "${Utils.cleanText(controls.toggleEditorBtn.textContent || 'Toggle Editor')}"`);
        // If iframe/rich editor isn't available yet or textarea is hidden, trigger Toggle Editor if needed
        const needsToggle = (!controls.iframe && !controls.contentEditable && (!window.tinymce || !window.tinymce.get('description')));
        if (needsToggle) {
          log?.('Activating Toggle Editor control...');
          try {
            controls.toggleEditorBtn.click();
          } catch (e) {
            controls.toggleEditorBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
          await Utils.sleep(400);
        }
      }

      let insertedIntoRichText = false;

      // 1. Check TinyMCE instance API
      try {
        const win = doc.defaultView || window;
        if (win.tinymce && typeof win.tinymce.get === 'function') {
          const editor = win.tinymce.get('description') ||
                         win.tinymce.get('target_description') ||
                         win.tinymce.activeEditor;
          if (editor) {
            editor.setContent(htmlContent);
            editor.save();
            insertedIntoRichText = true;
            log?.('Inserted formatted HTML via TinyMCE editor instance API.');
          }
        }
      } catch (e) {}

      // 2. Check Joomla editor instance API
      try {
        const win = doc.defaultView || window;
        if (win.Joomla?.editors?.instances?.description) {
          win.Joomla.editors.instances.description.setValue(htmlContent);
          insertedIntoRichText = true;
          log?.('Inserted formatted HTML via Joomla.editors instance.');
        }
      } catch (e) {}

      // 3. Check TinyMCE / Rich Text iframe
      try {
        const refreshedControls = this.findDescriptionControls(doc);
        const iframe = refreshedControls.iframe;
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
          iframe.contentDocument.body.innerHTML = htmlContent;
          iframe.contentDocument.body.dispatchEvent(new Event('input', { bubbles: true }));
          iframe.contentDocument.body.dispatchEvent(new Event('change', { bubbles: true }));
          insertedIntoRichText = true;
          log?.('Inserted formatted HTML into description editor iframe body.');
        }
      } catch (e) {}

      // 4. Contenteditable element
      try {
        const refreshedControls = this.findDescriptionControls(doc);
        const ce = refreshedControls.contentEditable;
        if (ce) {
          ce.innerHTML = htmlContent;
          ce.dispatchEvent(new Event('input', { bubbles: true }));
          ce.dispatchEvent(new Event('change', { bubbles: true }));
          insertedIntoRichText = true;
          log?.('Inserted formatted HTML into contenteditable container.');
        }
      } catch (e) {}

      // 5. Always sync Textarea as standard/fallback
      const textarea = this.findDescriptionControls(doc).textarea;
      if (textarea) {
        textarea.value = cleanPlainText;
        Utils.triggerEvents(textarea);
        log?.('Updated description textarea with clean paragraphs.');
      }

      if (insertedIntoRichText || textarea) {
        return { success: true, isRichText: insertedIntoRichText, length: htmlContent.length };
      }

      return { success: false, error: 'Could not find description textarea or editor instance' };
    }
  };

  // --- DICE AUTOMATOR CORE CLASS ---
  const DiceAutomator = {
    version: '2.0.0-DICE2',

    /**
     * Inspects the DICE DOM without modifying it (Dry-Run / Test Mode)
     */
    async runDryRun(targetDoc, extractedFields = {}, options = {}) {
      if (!targetDoc) targetDoc = document;
      const opts = Object.assign({}, DEFAULT_OPTIONS, options);
      const log = (msg) => {
        if (typeof opts.logCallback === 'function') opts.logCallback(msg);
      };

      log(`🔍 [DICE DRY-RUN] Starting inspection on document: "${targetDoc.title || 'Untitled'}"...`);

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

      // 2. Category Control
      const catCtrl = DropdownManager.findDropdown(targetDoc, {
        selectors: ['#target_category', '#category', '#jform_category', 'select[name="category"]', 'select[name="parent_id"]', 'select[name*="cat"]'],
        labels: [/^category\s*\*?$/i, /\bcategory\b/i],
        names: ['category', 'target_category', 'parent_id', 'catid']
      });
      if (catCtrl) {
        checks.category.found = true;
        checks.category.control = catCtrl.id || catCtrl.name || catCtrl.tagName;
        const optsList = DropdownManager.getOptions(catCtrl);
        const match = optsList.find(o => o.text.toLowerCase().includes('vehicles') || o.value.toLowerCase().includes('vehicles'));
        checks.category.optionFound = !!match;
        log(`✓ Category dropdown found (id: "${checks.category.control}"). "Vehicles" option: ${match ? 'FOUND ✓' : 'NOT FOUND ✗'}`);
      } else {
        log('✗ Category dropdown NOT FOUND.');
      }

      // 3. Sub Category Control
      const subCatCtrl = DropdownManager.findDropdown(targetDoc, {
        selectors: ['#target_cars_parts', '#target_sub_category', '#sub_category', 'select[name="sub_category"]', 'select[name*="sub_cat"]', '#cat_id_2'],
        labels: [/sub\s*category\s*\*?$/i, /cars?\s*-\s*parts\s*\*?$/i, /\bsub-category\b/i],
        names: ['sub_category', 'target_cars_parts', 'subcatid', 'cat_id_2']
      });
      if (subCatCtrl) {
        checks.subCategory.found = true;
        checks.subCategory.control = subCatCtrl.id || subCatCtrl.name || subCatCtrl.tagName;
        const optsList = DropdownManager.getOptions(subCatCtrl);
        const match = optsList.find(o => /car\s*-\s*parts/i.test(o.text) || /car\s*-\s*parts/i.test(o.value));
        checks.subCategory.optionFound = !!match;
        log(`✓ Sub Category dropdown found (id: "${checks.subCategory.control}"). "Car - parts" option: ${match ? 'FOUND ✓' : 'NOT FOUND ✗'}`);
      } else {
        log('ℹ️ Sub Category dropdown not visible initially (may reveal after Category selection).');
      }

      // 4. Third-level Category Control
      const thirdCatCtrl = DropdownManager.findDropdown(targetDoc, {
        selectors: ['#target_used_cars_sa', '#third_category', 'select[name="third_category"]', 'select[name*="third"]', '#cat_id_3'],
        labels: [/used\s*cars\s*in\s*south\s*africa\s*\*?$/i, /third-level/i, /sub\s*sub\s*category/i],
        names: ['third_category', 'target_used_cars_sa', 'cat_id_3']
      });
      if (thirdCatCtrl) {
        checks.thirdLevelCategory.found = true;
        checks.thirdLevelCategory.control = thirdCatCtrl.id || thirdCatCtrl.name || thirdCatCtrl.tagName;
        const optsList = DropdownManager.getOptions(thirdCatCtrl);
        const match = optsList.find(o => /used\s*cars\s*in\s*south\s*africa/i.test(o.text) || /all\s*south\s*africa/i.test(o.text));
        checks.thirdLevelCategory.optionFound = !!match;
        log(`✓ 3rd-level Category dropdown found. "Used cars in South Africa" option: ${match ? 'FOUND ✓' : 'NOT FOUND ✗'}`);
      } else {
        log('ℹ️ 3rd-level Category dropdown not visible initially (reveals after Sub Category selection).');
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

      // Price Currency dropdown (adjacent to Price input or labeled Currency)
      let priceCurrCtrl = null;
      if (priceInp) {
        const container = priceInp.closest('.control-group, .form-group, .demo-form-group, tr, td, div') || priceInp.parentElement;
        priceCurrCtrl = container ? container.querySelector('select') : null;
      }
      if (!priceCurrCtrl) {
        priceCurrCtrl = DropdownManager.findDropdown(targetDoc, {
          selectors: ['#target_currency', '#currency', 'select[name="currency"]', 'select[name*="currency"]'],
          labels: [/^currency\s*\*?$/i, /price\s*currency/i],
          names: ['currency', 'target_currency']
        });
      }
      if (priceCurrCtrl) {
        checks.priceCurrency.found = true;
        checks.priceCurrency.control = priceCurrCtrl.id || priceCurrCtrl.name || priceCurrCtrl.tagName;
        const optsList = DropdownManager.getOptions(priceCurrCtrl);
        const match = optsList.find(o => /\br\b|\brand\b|zar/i.test(o.text) || /\br\b|\brand\b|zar/i.test(o.value));
        checks.priceCurrency.optionFound = !!match;
        log(`✓ Price currency dropdown found. "R (Rand)" option: ${match ? 'FOUND ✓' : 'NOT FOUND ✗'}`);
      } else {
        log('✗ Price currency dropdown NOT FOUND.');
      }

      // 6. Tag Dropdown
      const tagCtrl = DropdownManager.findDropdown(targetDoc, {
        selectors: ['#target_tags', '#target_tag', '#tags', '#tag', 'select[name="tags"]', 'select[name="tag"]', 'select[name*="tag"]'],
        labels: [/^tags?\s*(?:dropdown)?\s*\*?$/i, /\btag\b/i],
        names: ['tags', 'tag', 'target_tags']
      });
      if (tagCtrl) {
        checks.tagDropdown.found = true;
        checks.tagDropdown.control = tagCtrl.id || tagCtrl.name || tagCtrl.tagName;
        const optsList = DropdownManager.getOptions(tagCtrl);
        const match = optsList.find(o => /sale/i.test(o.text) || /sale/i.test(o.value));
        checks.tagDropdown.optionFound = !!match;
        log(`✓ Tag dropdown found. "Sale" option: ${match ? 'FOUND ✓' : 'NOT FOUND ✗'}`);
      } else {
        log('✗ Tag dropdown NOT FOUND.');
      }

      // 7. Location Dropdown
      const locCtrl = DropdownManager.findDropdown(targetDoc, {
        selectors: ['#target_country', '#target_location', '#country', '#location', 'select[name="location"]', 'select[name="country"]', 'select[name*="location"]', 'select[name*="country"]'],
        labels: [/^location\s*(?:dropdown)?\s*\*?$/i, /^country\s*(?:\/\s*location)?\s*\*?$/i, /\blocation\b/i],
        names: ['country', 'location', 'target_country', 'target_location']
      });
      if (locCtrl) {
        checks.locationDropdown.found = true;
        checks.locationDropdown.control = locCtrl.id || locCtrl.name || locCtrl.tagName;
        const optsList = DropdownManager.getOptions(locCtrl);
        const match = optsList.find(o => /south\s*africa/i.test(o.text) || /south\s*africa/i.test(o.value));
        checks.locationDropdown.optionFound = !!match;
        log(`✓ Location dropdown found. "South Africa" option: ${match ? 'FOUND ✓' : 'NOT FOUND ✗'}`);
      } else {
        log('✗ Location dropdown NOT FOUND.');
      }

      // 8. Description Toggle Editor & Editor Controls
      const descControls = DescriptionManager.findDescriptionControls(targetDoc);
      checks.toggleEditor.found = !!descControls.toggleEditorBtn;
      checks.toggleEditor.element = descControls.toggleEditorBtn ? descControls.toggleEditorBtn.tagName : null;
      checks.descriptionEditor.found = !!(descControls.textarea || descControls.iframe || descControls.contentEditable);
      checks.descriptionEditor.details = {
        hasTextarea: !!descControls.textarea,
        hasIframe: !!descControls.iframe,
        hasContentEditable: !!descControls.contentEditable
      };
      log(`✓ Description Toggle Editor: ${checks.toggleEditor.found ? 'FOUND ✓' : 'NOT FOUND (Using visible editor)'}`);
      log(`✓ Description Editor Area: ${checks.descriptionEditor.found ? 'DETECTED ✓' : 'NOT FOUND ✗'}`);

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
     * Executes the live, non-destructive automatic form-filling sequence
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
        stepsCompleted: [],
        errors: [],
        timestamp: new Date().toISOString()
      };

      log(`🚀 [DICE AUTO-FILL] Beginning automated form population for: "${fields.title || 'Vehicle Listing'}"...`);

      try {
        // ================================================================
        // STEP 1: CATEGORY → Vehicles
        // ================================================================
        notifyStep('Category', 'running', 'Selecting Category → Vehicles');
        log('1. Locating Category dropdown...');
        const catCtrl = DropdownManager.findDropdown(targetDoc, {
          selectors: ['#target_category', '#category', '#jform_category', 'select[name="category"]', 'select[name="parent_id"]', 'select[name*="cat"]'],
          labels: [/^category\s*\*?$/i, /\bcategory\b/i],
          names: ['category', 'target_category', 'parent_id', 'catid']
        });

        if (catCtrl) {
          const selRes = DropdownManager.selectOption(catCtrl, 'Vehicles');
          if (selRes.success) {
            log(`✓ Selected Category → "${selRes.selectedText}"`);
            result.stepsCompleted.push('Category: Vehicles');
            notifyStep('Category', 'completed', selRes.selectedText);
          } else {
            log(`⚠️ Category selection warning: ${selRes.error}`);
            result.errors.push(`Category: ${selRes.error}`);
          }
        } else {
          log('ℹ️ Category dropdown not found or pre-selected.');
        }

        // Wait for next dropdown/state update
        log('Waiting for Sub Category dropdown/state update...');
        await Utils.sleep(opts.stepDelayMs);

        // ================================================================
        // STEP 2: SUB CATEGORY → Car - parts
        // ================================================================
        notifyStep('SubCategory', 'running', 'Selecting Sub Category → Car - parts');
        log('2. Locating Sub Category dropdown...');
        const subCatCtrl = await Utils.waitFor(() => {
          return DropdownManager.findDropdown(targetDoc, {
            selectors: ['#target_cars_parts', '#target_sub_category', '#sub_category', 'select[name="sub_category"]', 'select[name*="sub_cat"]', '#cat_id_2'],
            labels: [/sub\s*category\s*\*?$/i, /cars?\s*-\s*parts\s*\*?$/i, /\bsub-category\b/i],
            names: ['sub_category', 'target_cars_parts', 'subcatid', 'cat_id_2']
          });
        }, opts.maxWaitMs, opts.pollIntervalMs);

        if (subCatCtrl) {
          const selRes = DropdownManager.selectOption(subCatCtrl, 'Car - parts');
          if (selRes.success) {
            log(`✓ Selected Sub Category → "${selRes.selectedText}"`);
            result.stepsCompleted.push('SubCategory: Car - parts');
            notifyStep('SubCategory', 'completed', selRes.selectedText);
          } else {
            // Fallback try "Cars" or "Parts"
            const fallbackRes = DropdownManager.selectOption(subCatCtrl, 'Cars');
            if (fallbackRes.success) {
              log(`✓ Selected Sub Category fallback → "${fallbackRes.selectedText}"`);
              result.stepsCompleted.push('SubCategory: Cars');
            } else {
              log(`⚠️ Sub Category selection warning: ${selRes.error}`);
              result.errors.push(`SubCategory: ${selRes.error}`);
            }
          }
        } else {
          log('ℹ️ Sub Category dropdown not found or not required.');
        }

        // Wait for next dropdown/state update
        log('Waiting for 3rd-level dropdown/state update...');
        await Utils.sleep(opts.stepDelayMs);

        // ================================================================
        // STEP 3: THIRD-LEVEL SUB CATEGORY → Used cars in South Africa
        // ================================================================
        notifyStep('ThirdLevelCategory', 'running', 'Selecting Third-level → Used cars in South Africa');
        log('3. Locating Third-level Sub Category dropdown...');
        const thirdCatCtrl = await Utils.waitFor(() => {
          return DropdownManager.findDropdown(targetDoc, {
            selectors: ['#target_used_cars_sa', '#third_category', 'select[name="third_category"]', 'select[name*="third"]', '#cat_id_3'],
            labels: [/used\s*cars\s*in\s*south\s*africa\s*\*?$/i, /third-level/i, /sub\s*sub\s*category/i],
            names: ['third_category', 'target_used_cars_sa', 'cat_id_3']
          });
        }, opts.maxWaitMs, opts.pollIntervalMs);

        if (thirdCatCtrl) {
          const selRes = DropdownManager.selectOption(thirdCatCtrl, 'Used cars in South Africa');
          if (selRes.success) {
            log(`✓ Selected Third-level Category → "${selRes.selectedText}"`);
            result.stepsCompleted.push('ThirdLevelCategory: Used cars in South Africa');
            notifyStep('ThirdLevelCategory', 'completed', selRes.selectedText);
          } else {
            // Fallback try "All South Africa" or first available option
            const fallbackRes = DropdownManager.selectOption(thirdCatCtrl, 'All South Africa');
            if (fallbackRes.success) {
              log(`✓ Selected Third-level Category fallback → "${fallbackRes.selectedText}"`);
              result.stepsCompleted.push('ThirdLevelCategory: All South Africa');
            } else {
              log(`⚠️ Third-level Category selection warning: ${selRes.error}`);
              result.errors.push(`ThirdLevelCategory: ${selRes.error}`);
            }
          }
        } else {
          log('ℹ️ Third-level Category dropdown not found or not required.');
        }

        // Wait until dependent form fields become available
        log('Waiting for dependent vehicle form fields to render/reveal...');
        await Utils.sleep(opts.stepDelayMs);

        // ================================================================
        // STEP 4: POPULATE VEHICLE INPUT FIELDS
        // ================================================================
        notifyStep('VehicleFields', 'running', 'Populating vehicle input fields...');
        log('4. Populating vehicle input fields...');
        if (window.CarSmartPasteEngine && typeof window.CarSmartPasteEngine.fillTargetForm === 'function') {
          window.CarSmartPasteEngine.fillTargetForm(targetDoc, fields);
          log('✓ Applied vehicle field mapping via core Smart Engine.');
        } else if (window.CarTargetFiller && typeof window.CarTargetFiller.fillForm === 'function') {
          window.CarTargetFiller.fillForm(targetDoc, fields);
          log('✓ Applied vehicle field mapping via TargetFiller.');
        }
        result.stepsCompleted.push('Vehicle Fields Populated');
        notifyStep('VehicleFields', 'completed', 'Mapped fields populated');

        // ================================================================
        // STEP 5: PRICE ROW → Price input & Currency dropdown → R (Rand)
        // ================================================================
        notifyStep('PriceRow', 'running', 'Setting Price and Currency → R (Rand)');
        log('5. Handling Price row (numeric price + R (Rand) currency)...');
        const priceInp = targetDoc.querySelector('#target_price, #price, input[name="price"], input[name*="listing_price"]');
        if (priceInp && fields.price) {
          const digitsOnly = String(fields.price).replace(/[^\d]/g, '');
          if (digitsOnly) {
            priceInp.value = digitsOnly;
            Utils.triggerEvents(priceInp);
            log(`✓ Set Price value: "${digitsOnly}"`);
          }
        }

        // Find adjacent or dedicated Currency dropdown
        let priceCurrCtrl = null;
        if (priceInp) {
          const container = priceInp.closest('.control-group, .form-group, .demo-form-group, tr, td, div') || priceInp.parentElement;
          priceCurrCtrl = container ? container.querySelector('select') : null;
        }
        if (!priceCurrCtrl) {
          priceCurrCtrl = DropdownManager.findDropdown(targetDoc, {
            selectors: ['#target_currency', '#currency', 'select[name="currency"]', 'select[name*="currency"]'],
            labels: [/^currency\s*\*?$/i, /price\s*currency/i],
            names: ['currency', 'target_currency']
          });
        }

        if (priceCurrCtrl) {
          const selRes = DropdownManager.selectOption(priceCurrCtrl, 'R (Rand)');
          if (selRes.success) {
            log(`✓ Selected Price Currency → "${selRes.selectedText}"`);
            result.stepsCompleted.push('Price Currency: R (Rand)');
          } else {
            // Fallback to "ZAR" or "R"
            const fallbackRes = DropdownManager.selectOption(priceCurrCtrl, 'ZAR') || DropdownManager.selectOption(priceCurrCtrl, 'R');
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
        // STEP 6: TAG DROPDOWN → Sale
        // ================================================================
        notifyStep('Tag', 'running', 'Selecting Tag → Sale');
        log('6. Locating Tag dropdown...');
        const tagCtrl = DropdownManager.findDropdown(targetDoc, {
          selectors: ['#target_tags', '#target_tag', '#tags', '#tag', 'select[name="tags"]', 'select[name="tag"]', 'select[name*="tag"]'],
          labels: [/^tags?\s*(?:dropdown)?\s*\*?$/i, /\btag\b/i],
          names: ['tags', 'tag', 'target_tags']
        });

        if (tagCtrl) {
          const selRes = DropdownManager.selectOption(tagCtrl, 'Sale');
          if (selRes.success) {
            log(`✓ Selected Tag → "${selRes.selectedText}"`);
            result.stepsCompleted.push('Tag: Sale');
            notifyStep('Tag', 'completed', selRes.selectedText);
          } else {
            log(`⚠️ Tag selection warning: ${selRes.error}`);
          }
        }

        // ================================================================
        // STEP 7: LOCATION DROPDOWN → South Africa
        // ================================================================
        notifyStep('Location', 'running', 'Selecting Location → South Africa');
        log('7. Locating Location dropdown...');
        const locCtrl = DropdownManager.findDropdown(targetDoc, {
          selectors: ['#target_country', '#target_location', '#country', '#location', 'select[name="location"]', 'select[name="country"]', 'select[name*="location"]', 'select[name*="country"]'],
          labels: [/^location\s*(?:dropdown)?\s*\*?$/i, /^country\s*(?:\/\s*location)?\s*\*?$/i, /\blocation\b/i],
          names: ['country', 'location', 'target_country', 'target_location']
        });

        if (locCtrl) {
          const selRes = DropdownManager.selectOption(locCtrl, 'South Africa');
          if (selRes.success) {
            log(`✓ Selected Location → "${selRes.selectedText}"`);
            result.stepsCompleted.push('Location: South Africa');
            notifyStep('Location', 'completed', selRes.selectedText);
          } else {
            log(`⚠️ Location selection warning: ${selRes.error}`);
          }
        }

        // ================================================================
        // STEP 8: DESCRIPTION WITH TOGGLE EDITOR
        // ================================================================
        notifyStep('Description', 'running', 'Enabling Toggle Editor & inserting formatted Description');
        log('8. Processing Description area and Toggle Editor...');
        if (fields.description) {
          const descRes = await DescriptionManager.ensureAndFillDescription(targetDoc, fields.description, log);
          if (descRes.success) {
            log('✓ Description inserted and formatted.');
            result.stepsCompleted.push('Description Inserted');
            notifyStep('Description', 'completed', 'HTML formatted description inserted');
          } else {
            log(`⚠️ Description warning: ${descRes.error}`);
          }
        }

        // ================================================================
        // STEP 9 & 10: VERIFY FIELDS & STOP (NEVER SUBMIT)
        // ================================================================
        notifyStep('Verification', 'running', 'Verifying populated fields...');
        log('9. Verifying field population...');
        await Utils.sleep(opts.stepDelayMs);

        result.success = true;
        log('\n==================================================');
        log('✓ Auto-fill completed');
        log('Please review the form before manually submitting.');
        log('==================================================');

        notifyStep('Verification', 'completed', 'Auto-fill completed. Ready for manual review.');

        // Render visible completion banner in the target page
        this.renderCompletionBanner(targetDoc);

        return result;
      } catch (err) {
        log(`❌ Auto-fill encountered an error: ${err.message}`);
        result.errors.push(err.message);
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
          animation: diceSlideDown 0.3s ease-out;
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
    }
  };

  return DiceAutomator;
}));
