// ==UserScript==
// @name         Car Data Entry Helper
// @namespace    local.car.helper
// @version      2.3.0-DICE2
// @description  Automatic Cars.co.za to DICE form-filling workflow with dependent dropdown sequencing and cross-tab GM event communication
// @match        https://www.cars.co.za/*
// @match        https://tamilnadu2026.dicewebfreelancers.com/*
// @match        *://*/*cars-co-za-sample.html*
// @match        *://*/*cars-co-za-ferrari-sample.html*
// @match        *://*/*cars-co-za-suzuki-sample.html*
// @match        *://*/*cars-co-za-bmw-sample.html*
// @match        *://*/*dummy-target.html*
// @match        *://*/*test-smart-paste.html*
// @match        *://*/*test-dice-flow.html*
// @match        file://*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_setClipboard
// @run-at       document-end
// ==UserScript==

(function () {
  'use strict';

  const BUILD_COMMIT = '222ce6a';
  const SCRIPT_VERSION = '2.3.0-DICE2';
  const BUILD_TIMESTAMP = '2026-09-19 10:20 UTC';

  console.log(`[DICE 2 BUILD] ${BUILD_COMMIT}`);
  console.log(`[DICE 2 VERSION] ${SCRIPT_VERSION}`);
  console.log(`[DICE 2 BUILD TIME] ${BUILD_TIMESTAMP}`);

  // --- 1. NORMALIZERS ENGINE ---
  const Normalizers = {
    cleanText(val) {
      if (!val || typeof val !== 'string') return '';
      return val.replace(/\s+/g, ' ').trim();
    },
    normalizeYear(val) {
      if (!val) return '';
      const match = String(val).match(/\b(19\d\d|20\d\d)\b/);
      return match ? match[1] : '';
    },
    normalizeKilometersDriven(val) {
      if (!val) return '';
      const str = String(val).trim();
      if (str.toLowerCase().includes('km')) return str;
      const digitsOnly = str.replace(/[^\d]/g, '');
      if (!digitsOnly) return str;
      return `${Number(digitsOnly).toLocaleString('fr-FR').replace(/\s/g, ' ')} km`;
    },
    normalizePrice(val) {
      if (!val) return '';
      const digitsOnly = String(val).replace(/[^\d]/g, '');
      if (!digitsOnly) return String(val).trim();
      return Number(digitsOnly).toLocaleString('fr-FR').replace(/\s/g, ' ');
    },
    normalizeTransmission(val) {
      if (!val) return '';
      const str = String(val).toLowerCase();
      if (str.includes('auto') || str.includes('steptronic') || str.includes('cvt') || str.includes('dsg') || str.includes('dual clutch')) {
        return 'Automatic';
      }
      if (str.includes('manual') || str.includes('stick')) {
        return 'Manual';
      }
      return this.cleanText(val);
    },
    normalizeFuel(val) {
      if (!val) return '';
      const str = String(val).toLowerCase();
      if (str.includes('petrol') || str.includes('gasoline')) return 'Petrol';
      if (str.includes('diesel')) return 'Diesel';
      if (str.includes('hybrid')) return 'Hybrid';
      if (str.includes('electric') || str.includes('ev')) return 'Electric';
      return this.cleanText(val);
    },
    normalize4x2Or4x4(val) {
      if (!val) return '';
      const str = String(val).toLowerCase();
      if (str.includes('4x4') || str.includes('4wd') || str.includes('awd') || str.includes('all-wheel')) return '4x4';
      if (str.includes('4x2') || str.includes('fwd') || str.includes('rwd') || str.includes('front') || str.includes('rear') || str.includes('two-wheel')) return '4x2';
      return this.cleanText(val);
    },
    normalizeFeatures(val) {
      if (!val) return '';
      if (Array.isArray(val)) {
        return val
          .map(f => this.normalizeFeatures(typeof f === 'object' ? (f.name || f.title || f.label || '') : f))
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      if (typeof val === 'string') {
        return val
          .replace(/([A-Z0-9])([A-Z][a-z])/g, '$1 $2')
          .split(/\r?\n/)
          .map(f => this.cleanText(f))
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      return '';
    },
    normalizeDescription(val) {
      if (!val || typeof val !== 'string') return '';
      let text = val
        .replace(/[ \t]*<br\s*\/?>[ \t]*\r?\n?/gi, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/div>/gi, '\n')
        .replace(/<div[^>]*>/gi, '')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ');

      const rawParagraphs = text.split(/\n{2,}/);
      const cleanParagraphs = [];

      for (const rawP of rawParagraphs) {
        const lines = rawP.split('\n');
        const cleanLines = [];

        for (const line of lines) {
          const cleanLine = line.replace(/[ \t]+/g, ' ').trim();
          if (!cleanLine) continue;

          // Exclude headings and show more/less controls
          if (/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(cleanLine)) continue;
          if (/^(?:show|read|view)\s*(?:more|less)$/i.test(cleanLine)) continue;
          if (/^(?:expand|\.\.\.\s*more)$/i.test(cleanLine)) continue;

          cleanLines.push(cleanLine);
        }

        if (cleanLines.length > 0) {
          cleanParagraphs.push(cleanLines.join('\n'));
        }
      }

      return cleanParagraphs.join('\n\n');
    },
    normalizeVehicleHighlights(val) {
      if (!val) return '';
      if (Array.isArray(val)) {
        return val.map(item => {
          if (typeof item === 'string') return this.cleanText(item);
          if (typeof item === 'object' && item !== null) {
            const t = item.title || item.heading || item.name || '';
            const v = item.value || item.metric || item.stat || '';
            const d = item.description || item.desc || item.detail || item.text || '';
            return [t, v, d].filter(Boolean).map(s => this.cleanText(s)).join('\n');
          }
          return '';
        }).filter(Boolean).join('\n\n');
      }
      if (typeof val === 'string') {
        const text = val
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');

        const rawCards = text.split(/\n{2,}/);
        const cleanCards = [];

        for (const rawCard of rawCards) {
          const lines = rawCard
            .split('\n')
            .map(l => l.replace(/[ \t]+/g, ' ').trim())
            .filter(l => l.length > 0 && !/^(?:vehicle\s+)?highlights$/i.test(l));

          if (lines.length > 0) {
            cleanCards.push(lines.join('\n'));
          }
        }
        return cleanCards.join('\n\n');
      }
      return '';
    },
    normalizeContactNumber(val) {
      if (!val || typeof val !== 'string') return '';
      let str = val.trim();
      if (str.includes('*') || /[\u2026]|\.{3,}/.test(str)) return '';
      str = str.replace(/^tel:\s*/i, '');
      str = str.replace(/^(?:call|tel|telephone|phone|contact|mobile|cell)(?:\s*:|\s+)/i, '');
      str = str.replace(/\s+/g, ' ').trim();
      if (/show\s*number|missing|n\/a|unspecified/i.test(str)) return '';
      const digits = str.replace(/[^\d]/g, '');
      if (digits.length < 7 || digits.length > 15) return '';
      if (/[a-zA-Z]{3,}/.test(str) && !str.toLowerCase().startsWith('tel')) return '';
      return str;
    }
  };

  // --- 2. VALIDATORS ENGINE ---
  const Validators = {
    validateField(key, value) {
      if (value === null || value === undefined || value === '') {
        return { status: 'missing', label: 'Missing / Needs Review' };
      }
      if (typeof value === 'string' && (value.includes('***') || value.includes('Contact Dealer') || value.includes('N/A'))) {
        return { status: 'missing', label: 'Missing / Needs Review' };
      }
      if (key === 'year') {
        const num = Number(value);
        if (isNaN(num) || num < 1900 || num > new Date().getFullYear() + 2) {
          return { status: 'missing', label: 'Missing / Needs Review' };
        }
      }
      if (key === 'contactNumber') {
        if (typeof value !== 'string' || value.includes('*') || value.replace(/[^\d]/g, '').length < 7) {
          return { status: 'missing', label: 'Missing / Needs Review' };
        }
      }
      return { status: 'extracted', label: 'Extracted' };
    },
    validateAll(data) {
      const report = {};
      for (const k of Object.keys(data)) {
        report[k] = this.validateField(k, data[k]);
      }
      return report;
    }
  };

  // --- 3. PRODUCTION CARS.CO.ZA ADAPTER (Semantic Leaf & Value-Anchored Extractor) ---
  const CarsCoZaAdapter = {
    canHandle(doc) {
      const url = doc.location?.href || '';
      return url.includes('cars.co.za') || doc.querySelector('#cars-co-za-marker') !== null || (doc.title && doc.title.includes('Cars.co.za'));
    },
    extract(doc) {
      if (!doc) doc = document;

      // 1. Next.js Hydrated State Deep Search
      let nextDataProps = {};
      let rawNextData = null;
      try {
        const nextScript = doc.querySelector('script[id="__NEXT_DATA__"]');
        if (nextScript && nextScript.textContent) {
          const parsed = JSON.parse(nextScript.textContent);
          rawNextData = parsed;
          nextDataProps = parsed.props?.pageProps?.listing ||
                          parsed.props?.pageProps?.vehicle?.attributes ||
                          parsed.props?.pageProps?.vehicle ||
                          parsed.props?.pageProps?.initialState?.vehicle ||
                          parsed.props?.pageProps || {};

          if (!nextDataProps.title && parsed.props?.pageProps?.dehydratedState?.queries) {
            const queries = parsed.props.pageProps.dehydratedState.queries;
            for (const q of queries) {
              const data = q.state?.data;
              if (data && (data.title || data.make || data.price)) {
                nextDataProps = data;
                break;
              }
            }
          }
        }
      } catch (e) {}

      // 2. JSON-LD Microdata Deep Search
      let jsonLdData = {};
      try {
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        scripts.forEach(script => {
          try {
            const parsed = JSON.parse(script.textContent);
            if (parsed['@type'] === 'Car' || parsed['@type'] === 'Vehicle' || parsed['@type'] === 'Product') {
              jsonLdData = parsed;
            } else if (Array.isArray(parsed)) {
              const found = parsed.find(item => item['@type'] === 'Car' || item['@type'] === 'Vehicle');
              if (found) jsonLdData = found;
            } else if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
              const found = parsed['@graph'].find(item => item['@type'] === 'Car' || item['@type'] === 'Vehicle');
              if (found) jsonLdData = found;
            }
          } catch (e) {}
        });
      } catch (e) {}

      // Helper: Scoped Text Lookup
      const getSelectorText = (root, selectors) => {
        if (!root) return '';
        for (const sel of selectors) {
          try {
            const el = root.querySelector(sel);
            if (el) {
              const txt = el.textContent || el.getAttribute('content') || el.value || '';
              if (txt && txt.trim().length > 0) return txt.trim();
            }
          } catch (e) {}
        }
        return '';
      };

      const getMeta = (props) => {
        for (const p of props) {
          const el = doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`);
          if (el && el.getAttribute('content')) return el.getAttribute('content').trim();
        }
        return '';
      };

      // --- 1 & 2. TITLE & TITLE DESCRIPTION ---
      const h1El = doc.querySelector('[data-test="heading"], [data-testid="heading"], [data-test="title"], [data-testid="title"], h1.heading-sm, h1.title, h1');
      let rawHeadingText = h1El ? (h1El.textContent || '').trim() : '';
      if (!rawHeadingText) {
        rawHeadingText = nextDataProps.title || nextDataProps.heading || (typeof jsonLdData.name === 'string' ? jsonLdData.name : '') || getMeta(['og:title', 'title']);
      }
      rawHeadingText = rawHeadingText.replace(/\s+for\s+sale.*$/i, '').replace(/\s*-\s*R\s*[\d\s,.]+.*$/i, '').trim();

      let rawVariantText = getSelectorText(doc, [
        '[data-test="variant"]', '[data-testid="variant"]',
        '[data-test="subtitle"]', '[data-testid="subtitle"]',
        '[data-test="derivative"]', '[data-testid="derivative"]',
        '[data-test="sub-heading"]', '[data-testid="sub-heading"]',
        '[data-test="trim"]', '[data-testid="trim"]',
        '.vehicle-subtitle', '.vehicle-variant', '.variant-title', '.subtitle', '.sub-heading', '.subHeading', '.derivative', '.trim'
      ]);

      if (!rawVariantText && h1El && h1El.nextElementSibling) {
        const sib = h1El.nextElementSibling;
        const sibTxt = (sib.textContent || '').trim();
        if (sibTxt && sibTxt.length > 0 && sibTxt.length < 50 && !sibTxt.startsWith('R') && !/\b(reviews|gauteng|cape town|western cape|kwazulu|sandton|durban|johannesburg)\b/i.test(sibTxt)) {
          rawVariantText = sibTxt;
        }
      }

      if (!rawVariantText) {
        rawVariantText = nextDataProps.variant || nextDataProps.derivative || nextDataProps.trim || nextDataProps.subTitle || nextDataProps.subtitle || '';
      }

      let title = '';
      let titleDescription = '';

      if (rawVariantText && rawVariantText.toLowerCase() !== rawHeadingText.toLowerCase()) {
        titleDescription = rawVariantText.trim();
        if (rawHeadingText.toLowerCase().endsWith(rawVariantText.toLowerCase())) {
          title = rawHeadingText.substring(0, rawHeadingText.length - rawVariantText.length).trim();
        } else if (rawHeadingText.toLowerCase().includes(rawVariantText.toLowerCase())) {
          title = rawHeadingText.replace(new RegExp(rawVariantText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
        } else {
          title = rawHeadingText.trim();
        }
      } else {
        const brandName = nextDataProps.make || (typeof jsonLdData.brand === 'string' ? jsonLdData.brand : jsonLdData.brand?.name) || '';
        const modelName = nextDataProps.model || jsonLdData.model || '';
        const yearMatch = rawHeadingText.match(/\b(19\d\d|20\d\d)\b/);
        const yrVal = nextDataProps.year || (yearMatch ? yearMatch[1] : '');

        if (brandName && modelName) {
          const expectedBase = `${yrVal ? yrVal + ' ' : ''}${brandName} ${modelName}`.trim();
          if (rawHeadingText.toLowerCase().startsWith(expectedBase.toLowerCase()) && rawHeadingText.length > expectedBase.length) {
            title = expectedBase;
            titleDescription = rawHeadingText.substring(expectedBase.length).trim();
          } else {
            title = rawHeadingText;
            titleDescription = '';
          }
        } else {
          const m = rawHeadingText.match(/^((?:19|20)\d\d\s+[A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+)?)\s+(.+)$/);
          if (m && m[2] && m[2].trim()) {
            title = m[1].trim();
            titleDescription = m[2].trim();
          } else {
            title = rawHeadingText;
            titleDescription = '';
          }
        }
      }

      if (titleDescription && titleDescription.toLowerCase() === title.toLowerCase()) {
        titleDescription = '';
      }

      // --- 3. VEHICLE SUMMARY & TECHNICAL SPECS (Semantic Value Anchors) ---
      const allLeafElements = [];
      const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_ELEMENT, null, false);
      let currentNode = walker.nextNode();
      while (currentNode) {
        if (currentNode.children.length === 0 || (currentNode.children.length === 1 && currentNode.querySelector('svg, i, img, span'))) {
          const txt = (currentNode.textContent || '').trim();
          if (txt && txt.length > 0 && txt.length < 60) {
            allLeafElements.push({ el: currentNode, text: txt });
          }
        }
        currentNode = walker.nextNode();
      }

      // Key-Value Table Mapping (if specifications table exists)
      const specTableMap = {};
      const specRows = doc.querySelectorAll('table tr, dl > div, dl tr, [class*="spec-row"], [class*="vehicle-details__list"] tr');
      specRows.forEach(row => {
        const labelEl = row.querySelector('td:first-child, th, dt, [class*="label"], [class*="name"]');
        const valEl = row.querySelector('td:last-child, dd, [class*="value"]');
        if (labelEl && valEl && labelEl !== valEl) {
          const l = labelEl.textContent.trim().toLowerCase();
          const v = valEl.textContent.trim();
          if (l && v) specTableMap[l] = v;
        }
      });

      // 3. Year
      let year = '';
      const yrLeaf = allLeafElements.find(item => /^(19\d\d|20\d\d)$/.test(item.text));
      if (yrLeaf) year = yrLeaf.text;
      if (!year) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/year|model year|registration/i.test(k) && /^(19\d\d|20\d\d)$/.test(v)) {
            year = v;
            break;
          }
        }
      }
      if (!year) year = nextDataProps.year || jsonLdData.vehicleModelDate || '';
      if (!year) {
        const match = rawHeadingText.match(/\b(19\d\d|20\d\d)\b/);
        if (match) year = match[1];
      }

      // 4. Kilometers Driven
      let kilometersDriven = '';
      const kmLeaf = allLeafElements.find(item => /^\s*(\d[\d\s,.]*)\s*(?:km|kms|kilometres|kilometers)\s*$/i.test(item.text));
      if (kmLeaf) kilometersDriven = kmLeaf.text;
      if (!kilometersDriven) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/mileage|kilometer|odometer|km/i.test(k) && /\d/.test(v)) {
            kilometersDriven = v;
            break;
          }
        }
      }
      if (!kilometersDriven) {
        kilometersDriven = nextDataProps.mileage || jsonLdData.mileageFromOdometer?.value || (typeof jsonLdData.mileageFromOdometer === 'string' ? jsonLdData.mileageFromOdometer : '') || '';
      }
      if (kilometersDriven && (!/\d/.test(kilometersDriven) || /^(gtb|ferrari|mazda|automatic|manual|petrol|diesel|red|white|blue|4x2|4x4)$/i.test(kilometersDriven))) {
        kilometersDriven = '';
      }

      // 5. Transmission
      let transmission = '';
      const transLeaf = allLeafElements.find(item => /^(automatic|manual|semi-automatic|automated manual|cvt|dual clutch|sequential|direct drive|auto|steptronic|dsg)$/i.test(item.text));
      if (transLeaf) transmission = transLeaf.text;
      if (!transmission) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/transmission|gearbox/i.test(k) && /automatic|manual|semi|cvt|dual clutch/i.test(v)) {
            transmission = v;
            break;
          }
        }
      }
      if (!transmission) {
        transmission = nextDataProps.transmission || nextDataProps.gearbox || jsonLdData.vehicleTransmission || '';
      }
      if (transmission && !/^(automatic|manual|semi-automatic|automated manual|cvt|dual clutch|sequential|direct drive|auto|steptronic|dsg)$/i.test(transmission.trim())) {
        transmission = '';
      }

      // 6. Fuel
      let fuel = '';
      const fuelLeaf = allLeafElements.find(item => /^(petrol|diesel|hybrid|electric|plug-in hybrid|phev|hydrogen|lpg|gas|unleaded|premium)$/i.test(item.text));
      if (fuelLeaf) fuel = fuelLeaf.text;
      if (!fuel) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/fuel/i.test(k) && /petrol|diesel|hybrid|electric|phev|gas|lpg/i.test(v)) {
            fuel = v;
            break;
          }
        }
      }
      if (!fuel) {
        fuel = nextDataProps.fuel || nextDataProps.fuelType || nextDataProps.fuel_type || jsonLdData.fuelType || '';
      }
      if (fuel && !/^(petrol|diesel|hybrid|electric|plug-in hybrid|phev|hydrogen|lpg|gas|unleaded|premium)$/i.test(fuel.trim())) {
        fuel = '';
      }

      // 7. 4x2 / 4x4 (Drivetrain)
      let drivetrain = '';
      const dtLeaf = allLeafElements.find(item => /^(4x2|4x4|fwd|rwd|awd|4wd|front-wheel drive|rear-wheel drive|all-wheel drive|four-wheel drive)$/i.test(item.text));
      if (dtLeaf) drivetrain = dtLeaf.text;
      if (!drivetrain) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/4x2|4x4|drivetrain|drive\s*type|driven\s*wheels|wheel\s*drive/i.test(k)) {
            drivetrain = v;
            break;
          }
        }
      }
      if (!drivetrain) {
        drivetrain = nextDataProps.drivetrain || nextDataProps.drive || nextDataProps.driveType || nextDataProps.driveWheelConfiguration || jsonLdData.driveWheelConfiguration || '';
      }
      if (drivetrain) {
        if (/4x4|awd|4wd|all-wheel|four-wheel/i.test(drivetrain)) drivetrain = '4x4';
        else if (/4x2|fwd|rwd|front-wheel|rear-wheel|front wheel|rear wheel/i.test(drivetrain)) drivetrain = '4x2';
        else drivetrain = '';
      }

      // 8. Body Color
      let bodyColor = '';
      const knownColors = ['red', 'white', 'black', 'silver', 'grey', 'gray', 'blue', 'yellow', 'green', 'orange', 'brown', 'bronze', 'gold', 'purple', 'beige', 'maroon', 'burgundy', 'charcoal', 'navy', 'rosso corsa', 'bianco', 'nero', 'giallo'];
      const colorLeaf = allLeafElements.find(item => knownColors.includes(item.text.toLowerCase()));
      if (colorLeaf) bodyColor = colorLeaf.text;
      if (!bodyColor) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/colou?r|body\s*colou?r/i.test(k) && !/^(gtb|automatic|petrol|4x2|4x4|\d+)$/i.test(v)) {
            bodyColor = v;
            break;
          }
        }
      }
      if (!bodyColor) {
        bodyColor = nextDataProps.colour || nextDataProps.color || nextDataProps.bodyColour || nextDataProps.bodyColor || nextDataProps.exteriorColor || jsonLdData.color || '';
      }
      if (bodyColor && (/\d|\b(reviews?|ratings?|gtb|ferrari|mazda|auto|petrol|diesel)\b/i.test(bodyColor) || bodyColor.length > 25)) {
        bodyColor = '';
      }

      // 9. Condition
      let condition = '';
      const condLeaf = allLeafElements.find(item => /^(?:excellent|good|clean|fair|used|new|demo)\s*condition$/i.test(item.text) || /^(excellent condition|good condition|clean condition|fair condition)$/i.test(item.text));
      if (condLeaf) condition = condLeaf.text;
      if (!condition) {
        for (const [k, v] of Object.entries(specTableMap)) {
          if (/condition/i.test(k) && !/^(gtb|automatic|petrol|\d+)$/i.test(v)) {
            condition = v;
            break;
          }
        }
      }
      if (!condition) {
        condition = nextDataProps.condition || nextDataProps.vehicleCondition || '';
        if (!condition && jsonLdData.itemCondition) {
          condition = jsonLdData.itemCondition.replace('https://schema.org/', '').replace('Condition', '');
        }
      }
      if (condition && (condition.toLowerCase() === titleDescription.toLowerCase() || /^(gtb|ferrari|mazda|\d+)$/i.test(condition))) {
        condition = '';
      }

      // --- 10 & 16. PRICING & PRICING SUMMARY ---
      let rawPrice = '';
      let installmentText = '';

      // Find cash price element: matches R ... (excluding installments ending in p/m)
      const priceCandidates = allLeafElements.filter(item => {
        return /^\s*R\s*([1-9]\d{0,2}(?:[\s,.]\d{3})+|[1-9]\d{4,8})\s*$/i.test(item.text) && !/p\/m|pm|per month|\/m/i.test(item.text);
      });

      if (priceCandidates.length > 0) {
        rawPrice = priceCandidates[0].text;
      }

      if (!rawPrice) {
        rawPrice = getSelectorText(doc, ['[data-test="price"]', '[data-testid="price"]', '.price-cash', '.price-amount', '#car-price', '.heading-lg.price', 'h2.price', 'span.price']);
      }
      if (!rawPrice) {
        rawPrice = nextDataProps.price || (jsonLdData.offers?.price ? String(jsonLdData.offers.price) : '') || getMeta(['product:price:amount', 'og:price:amount']);
      }

      let priceDigits = String(rawPrice).replace(/[^\d]/g, '');
      let formattedPrice = priceDigits ? Number(priceDigits).toLocaleString('fr-FR').replace(/\s/g, ' ') : '';

      // Find installment text
      const instLeaf = allLeafElements.find(item => /(?:Est\.?\s*)?R\s*[\d\s,.]+\s*(?:p\/m|pm|per month)/i.test(item.text));
      if (instLeaf) {
        installmentText = instLeaf.text.trim();
        if (!installmentText.toLowerCase().startsWith('est.')) {
          installmentText = `Est. ${installmentText}`;
        }
      }

      if (!installmentText && nextDataProps.installment) {
        installmentText = `Est. ${nextDataProps.installment}`;
      }

      let pricingSummary = '';
      const sumLeaf = allLeafElements.find(item => /^R\s*[\d\s,.]+\s*(?:Est\.|\/|\+)\s*R\s*[\d\s,.]+/i.test(item.text));
      if (sumLeaf) {
        pricingSummary = sumLeaf.text.trim();
      }
      if (!pricingSummary) {
        pricingSummary = getSelectorText(doc, ['[data-test="pricing-summary"]', '[data-testid="pricing-summary"]', '#car-price-summary', '.price-summary']);
      }
      if (!pricingSummary && formattedPrice) {
        if (installmentText) {
          pricingSummary = `R ${formattedPrice} / ${installmentText}`;
        } else {
          pricingSummary = `R ${formattedPrice}`;
        }
      } else if (!pricingSummary && nextDataProps.pricingSummary) {
        pricingSummary = nextDataProps.pricingSummary;
      }

      // --- 11, 12, 13. DEALER & RATING ---
      let dealerName = '';
      let dealerAddress = '';
      let averageRating = '';

      // Step A: Extract Dealer Name (distinct from address)
      // 1. Explicit data-cy, data-test, data-testid selectors
      dealerName = getSelectorText(doc, [
        '[data-cy="seller-name"]', '[data-test="dealer-name"]', '[data-testid="dealer-name"]',
        '[data-cy="dealer-name"]', '.dealer-name', '[class*="dealer-name"]', '[class*="dealer__name"]',
        '.seller-info__title', '.dealer-title', '#dealer-name',
        '.dealer-info .name', '.seller-info .name', '.dealer-info [class*="name"]'
      ]);

      // 2. Links to dealer group / profile (excluding navigation buttons)
      if (!dealerName) {
        const dealerLinks = Array.from(doc.querySelectorAll('a[href*="/groups/"], a[href*="/dealers/"], a[href*="/dealer/"], a[href*="/seller/"]'));
        for (const link of dealerLinks) {
          if (link.closest('nav, header, footer')) continue;
          const txt = (link.textContent || '').trim();
          if (txt && txt.length > 2 && txt.length < 80 && !/^(?:view\s*all|all\s*cars|contact|directions|website|dealer\s*banner|back\s*to\s*search)$/i.test(txt)) {
            dealerName = txt;
            break;
          }
        }
      }

      // 3. Dealer Card Container Heading
      if (!dealerName) {
        const sellerContainer = doc.querySelector('[data-cy="seller-address"], [data-cy="seller-info"], [class*="seller-info"], [class*="dealer-info"], [class*="dealer-card"]');
        if (sellerContainer) {
          const titleEl = sellerContainer.querySelector('h1, h2, h3, h4, h5, h6, strong, .name, [class*="name"]');
          if (titleEl) {
            const txt = (titleEl.textContent || '').trim();
            if (txt && txt.length > 2 && txt.length < 80 && !/^(?:seller|dealer|dealership)\s*(?:details|information|info|overview|address)$/i.test(txt)) {
              dealerName = txt;
            }
          }
        }
      }

      // 4. Fallback: Next.js Dehydrated State / JSON-LD
      if (!dealerName) {
        const searchNextDataDealerName = (obj, depth = 0) => {
          if (!obj || typeof obj !== 'object' || depth > 8) return '';
          if (obj.agent_name && typeof obj.agent_name === 'string') return obj.agent_name.trim();
          if (obj.dealer_name && typeof obj.dealer_name === 'string') return obj.dealer_name.trim();
          if (obj.dealer && typeof obj.dealer.name === 'string') return obj.dealer.name.trim();
          if (obj.seller && typeof obj.seller.name === 'string') return obj.seller.name.trim();
          for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              const res = searchNextDataDealerName(obj[key], depth + 1);
              if (res) return res;
            }
          }
          return '';
        };
        dealerName = searchNextDataDealerName(rawNextData) || searchNextDataDealerName(nextDataProps) || jsonLdData.offers?.seller?.name || '';
      }

      // Clean Dealer Name
      if (dealerName) {
        dealerName = dealerName.replace(/^(?:Seller|Dealer|Dealership)\s*:?\s*/i, '').trim();
      }

      // Step B: Extract Dealer Address (distinct from Dealer Name)
      // 1. Look for element next to map pin icon
      const mapPinEl = doc.querySelector('svg.tabler-icon-map-pin, svg[class*="map-pin"], svg[class*="pin"], [data-cy="seller-location"], [data-test="dealer-location"], [data-testid="dealer-location"], [data-test="dealer-address"], [data-testid="dealer-address"], .dealer-address, .dealer-location');
      if (mapPinEl) {
        const parent = mapPinEl.closest('div, p, span, li') || mapPinEl.parentElement;
        if (parent) {
          const txt = (parent.textContent || '').trim();
          if (txt && txt.length > 3 && txt.length < 90 && txt !== dealerName && !/^(?:view\s*map|map|directions)$/i.test(txt)) {
            dealerAddress = txt;
          }
        }
      }

      // 2. Search for explicit City, Province pattern (e.g. "Centurion, Gauteng", "Sandton, Gauteng", "Vredenburg, Western Cape")
      if (!dealerAddress) {
        const provinceRegex = /^[A-Z][a-zA-Z\s\-']+(?:,\s*|\s+)(?:Gauteng|Western Cape|KwaZulu-Natal|Eastern Cape|Free State|Limpopo|Mpumalanga|North West|Northern Cape)$/i;
        const candidates = allLeafElements.filter(item => provinceRegex.test(item.text.trim()) && item.text.trim() !== dealerName);
        if (candidates.length > 0) {
          dealerAddress = candidates[0].text.trim();
        }
      }

      // 3. Search for elements containing city & province
      if (!dealerAddress) {
        const locMatch = allLeafElements.find(item => {
          const t = item.text.trim();
          if (t === dealerName || t.length > 60 || t.startsWith('R') || /^(?:used\s+cars|view\s+map)/i.test(t)) return false;
          return /(?:Sandton|Cape Town|Johannesburg|Durban|Pretoria|Centurion|Vredenburg|Bellville|Randburg|Boksburg|Roodepoort|Bloemfontein|Gqeberha|Port Elizabeth|East London|Pietermaritzburg|Polokwane|Nelspruit|Mbombela)\s*,\s*(?:Gauteng|Western Cape|KwaZulu-Natal|Eastern Cape|Free State|Limpopo|Mpumalanga|North West|Northern Cape)/i.test(t);
        });
        if (locMatch) {
          dealerAddress = locMatch.text.trim();
        }
      }

      // 4. Fallback: Next.js Dehydrated State (agent_locality + province, dealer.address, location)
      if (!dealerAddress) {
        const searchNextDataAddress = (obj, depth = 0) => {
          if (!obj || typeof obj !== 'object' || depth > 8) return '';
          if (obj.agent_locality && obj.province) return `${obj.agent_locality.trim()}, ${obj.province.trim()}`;
          if (obj.agent_locality && !obj.province) return obj.agent_locality.trim();
          if (obj.dealer_location && typeof obj.dealer_location === 'string') return obj.dealer_location.trim();
          if (obj.dealer_address && typeof obj.dealer_address === 'string') return obj.dealer_address.trim();
          if (obj.dealer?.address && typeof obj.dealer.address === 'string') return obj.dealer.address.trim();
          if (obj.dealer?.location && typeof obj.dealer.location === 'string') return obj.dealer.location.trim();
          for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              const res = searchNextDataAddress(obj[key], depth + 1);
              if (res) return res;
            }
          }
          return '';
        };
        dealerAddress = searchNextDataAddress(rawNextData) || searchNextDataAddress(nextDataProps) || jsonLdData.offers?.seller?.address || '';
      }

      // Strict validation: Dealer Address must NEVER equal Dealer Name
      if (dealerAddress === dealerName) {
        dealerAddress = '';
      }

      // Average Rating
      const ratingLeaf = allLeafElements.find(item => /(?:★\s*)?([1-5]\.\d)\s*(?:\/5)?\s*(?:\(\s*(\d+)\s*(?:Reviews?|reviews?)?\s*\)|(\d+)\s*(?:Reviews?|reviews?))/i.test(item.text));
      if (ratingLeaf) {
        const match = ratingLeaf.text.match(/(?:★\s*)?([1-5]\.\d)\s*(?:\/5)?\s*(?:\(\s*(\d+)\s*(?:Reviews?|reviews?)?\s*\)|(\d+)\s*(?:Reviews?|reviews?))/i);
        if (match) {
          const score = match[1];
          const count = match[2] || match[3] || '';
          averageRating = count ? `${score} (${count} Reviews)` : score;
        }
      }
      if (!averageRating) {
        const scoreLeaf = allLeafElements.find(item => /^[★\s]*([1-5]\.\d)[★\s]*$/.test(item.text));
        const revLeaf = allLeafElements.find(item => /^\s*(\d+)\s*(?:reviews?|ratings?)\s*$/i.test(item.text));
        if (scoreLeaf && revLeaf) {
          const scoreMatch = scoreLeaf.text.match(/([1-5]\.\d)/);
          const revMatch = revLeaf.text.match(/(\d+)/);
          if (scoreMatch && revMatch) {
            averageRating = `${scoreMatch[1]} (${revMatch[1]} Reviews)`;
          }
        }
      }
      if (!averageRating) {
        averageRating = nextDataProps.dealer?.rating || nextDataProps.dealer?.aggregateRating || '';
        if (!averageRating && jsonLdData.offers?.seller?.aggregateRating) {
          const agg = jsonLdData.offers.seller.aggregateRating;
          const val = agg.ratingValue || '';
          const count = agg.reviewCount || '';
          if (val) averageRating = `${val}${count ? ` (${count} Reviews)` : ''}`;
        }
      }

      // --- 14. FEATURES (Real DOM-First Repeating Item Extractor) ---
      let featuresList = [];

      // 1. PRIMARY: DOM Structural Extraction (strictly scoped to Features section with repeating item unwrapping)
      // Step A: Find the explicit Features heading element (prefer deepest heading)
      const candidateHeadings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, [class*="heading"], [class*="title"], summary, div, span, p, button, a')).filter(el => {
        const txt = (el.textContent || '').trim();
        if (!/^(?:key\s+|vehicle\s+|standard\s+|installed\s+|comfort\s+|safety\s+|interior\s+|exterior\s+)?features(?:\s*\(\d+\))?(?:\s*&\s*specs|\s*and\s*specs)?$/i.test(txt)) return false;
        if (txt.length > 35) return false;
        if (el.tagName === 'H1' && /20\d\d|[a-z]{3,}\s+[a-z]{3,}/i.test(txt)) return false;
        if (el.querySelector('h1, h2, h3, h4, h5, h6')) return false;
        return true;
      });

      let featureHeading = null;
      if (candidateHeadings.length > 0) {
        featureHeading = candidateHeadings.reduce((deepest, curr) => {
          if (!deepest) return curr;
          return (deepest.contains(curr) && deepest !== curr) ? curr : deepest;
        }, null);
      }

      // Step B: Collect candidate containers
      const candidateContainers = [];
      if (featureHeading) {
        let sib = featureHeading.nextElementSibling;
        while (sib && /^(?:hr|br|script|style)$/i.test(sib.tagName)) {
          sib = sib.nextElementSibling;
        }
        if (sib) candidateContainers.push(sib);

        if (featureHeading.parentElement && featureHeading.parentElement !== doc.body) {
          let parentSib = featureHeading.parentElement.nextElementSibling;
          while (parentSib && /^(?:hr|br|script|style)$/i.test(parentSib.tagName)) {
            parentSib = parentSib.nextElementSibling;
          }
          if (parentSib) candidateContainers.push(parentSib);
          candidateContainers.push(featureHeading.parentElement);
          if (featureHeading.parentElement.parentElement && featureHeading.parentElement.parentElement !== doc.body) {
            candidateContainers.push(featureHeading.parentElement.parentElement);
          }
        }
      }

      const directContainers = doc.querySelectorAll('[data-test*="feature"], [data-testid*="feature"], #car-features, #features, .features-grid, .features-list, .equipment-list, [class*="features-grid"], [class*="features_grid"], [class*="features-section"], [class*="features-list"]');
      directContainers.forEach(el => candidateContainers.push(el));

      // Step C: Extract individual repeating items inside the container ONLY
      const items = [];
      const seen = new Set();

      // Helper: Extract text while preserving spaces across disjoint child elements/tags
      const extractItemText = (el) => {
        if (!el) return '';
        try {
          const clone = el.cloneNode(true);
          const junk = clone.querySelectorAll('script, style, svg, path, img, button');
          junk.forEach(n => n.remove());

          const textParts = [];
          const collectText = (node) => {
            if (node.nodeType === 3) {
              const val = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
              if (val) textParts.push(val);
            } else if (node.nodeType === 1) {
              for (let child = node.firstChild; child; child = child.nextSibling) {
                collectText(child);
              }
            }
          };
          collectText(clone);
          if (textParts.length > 0) {
            return textParts.join(' ').replace(/[ \t]+/g, ' ').trim();
          }
        } catch (e) {}

        return (el.textContent || '').replace(/[ \t]+/g, ' ').trim();
      };

      const addFeature = (rawText) => {
        if (!rawText || typeof rawText !== 'string') return;
        const lines = rawText.split(/\r?\n/);
        for (const line of lines) {
          const clean = line.replace(/[ \t]+/g, ' ').trim();
          if (clean && clean.length >= 2 && clean.length <= 60) {
            if (!/^(?:features|key features|vehicle features|standard features|installed features|show more|show less|view all|view less|read more|read less|back to search|used cars|specs)$/i.test(clean)) {
              if (!/^(?:20\d\d\s+[A-Za-z]+|R\s*[\d\s,.]+|[\d\s]+km)$/i.test(clean)) {
                if (!seen.has(clean.toLowerCase())) {
                  seen.add(clean.toLowerCase());
                  items.push(clean);
                }
              }
            }
          }
        }
      };

      for (const container of candidateContainers) {
        if (!container || items.length >= 2) break;

        // Strategy 1: Direct <li> elements
        const listItems = Array.from(container.querySelectorAll('li')).filter(li => !featureHeading || !li.contains(featureHeading));
        if (listItems.length >= 2) {
          listItems.forEach(li => addFeature(extractItemText(li)));
          if (items.length >= 2) break;
        }

        // Strategy 2: Dedicated feature class elements
        const classItems = Array.from(container.querySelectorAll('[class*="feature-item"], [class*="feature_item"], [class*="featureItem"], [class*="features__item"], [class*="chip"], [class*="pill"], [class*="badge"], [class*="tag"]')).filter(ci => !featureHeading || !ci.contains(featureHeading));
        if (classItems.length >= 2) {
          classItems.forEach(ci => addFeature(extractItemText(ci)));
          if (items.length >= 2) break;
        }

        // Strategy 3: Find repeating wrapper inside container
        const allWrappers = [container, ...Array.from(container.querySelectorAll('div, ul, ol, section, article'))];
        for (const wrapper of allWrappers) {
          if (featureHeading && (wrapper === featureHeading || (wrapper.contains(featureHeading) && wrapper.children.length === 1))) continue;

          const children = Array.from(wrapper.children).filter(c => {
            if (featureHeading && (c === featureHeading || c.contains(featureHeading))) return false;
            if (/^(?:STYLE|SCRIPT|NOSCRIPT|SVG|BUTTON|NAV|HEADER|FOOTER|HR|BR)$/i.test(c.tagName)) return false;
            const txt = (c.textContent || '').trim();
            if (/^(?:features|key features|show more|view all|read more)$/i.test(txt)) return false;
            return true;
          });

          if (children.length >= 2 && children.length <= 80) {
            const sampleTexts = children.map(c => extractItemText(c)).filter(t => t.length >= 2 && t.length <= 60 && !/^(?:features|key features|show more|view all|read more)$/i.test(t));
            if (sampleTexts.length >= 2 && sampleTexts.length >= children.length * 0.7) {
              children.forEach(c => addFeature(extractItemText(c)));
              if (items.length >= 2) break;
            }
          }
        }
      }

      // Strategy 4: Fallback leaf-elements within section
      if (items.length === 0 && featureHeading) {
        const sectionEl = featureHeading.closest('section, article, [class*="section"], [class*="card"], div') || featureHeading.parentElement;
        if (sectionEl && !/^(?:body|html|main)$/i.test(sectionEl.tagName)) {
          const leafEls = Array.from(sectionEl.querySelectorAll('div, span, p, li')).filter(el => {
            if (featureHeading.contains(el) || el.contains(featureHeading)) return false;
            if (el.closest('h1, h2, h3, h4, h5, h6, button, script, style, svg')) return false;
            if (el.children.length > 0) {
              const nonInline = Array.from(el.children).filter(c => !/^(?:SPAN|I|SVG|PATH|IMG|EM|STRONG|B)$/i.test(c.tagName));
              if (nonInline.length > 0) return false;
            }
            const t = extractItemText(el);
            return t.length >= 2 && t.length <= 60 && !/^(?:features|key features|show more|view all|read more)$/i.test(t);
          });
          if (leafEls.length >= 2) {
            leafEls.forEach(el => addFeature(extractItemText(el)));
          }
        }
      }

      if (items.length > 0) {
        featuresList = items;
      }

      // 2. SECONDARY FALLBACK: Check Next.js state props ONLY if DOM yielded no features
      if (!featuresList || featuresList.length === 0) {
        const isValidFeatureArray = (arr) => {
          if (!Array.isArray(arr) || arr.length < 2) return false;
          const strings = arr.map(f => typeof f === 'object' ? (f.name || f.title || f.label || '') : String(f || '')).filter(Boolean);
          if (strings.length < 2) return false;
          // Ensure items are distinct short feature names, not long merged blocks
          const validItems = strings.filter(s => s.length >= 2 && s.length <= 60 && !s.includes('Air ConditioningPower'));
          return validItems.length >= 2;
        };

        if (isValidFeatureArray(nextDataProps.features)) {
          featuresList = nextDataProps.features.map(f => typeof f === 'object' ? (f.name || f.title || f.label || '') : String(f)).filter(Boolean);
        } else if (isValidFeatureArray(nextDataProps.vehicleFeatures)) {
          featuresList = nextDataProps.vehicleFeatures.map(f => typeof f === 'object' ? (f.name || f.title || f.label || '') : String(f)).filter(Boolean);
        } else if (isValidFeatureArray(nextDataProps.equipment)) {
          featuresList = nextDataProps.equipment.map(f => typeof f === 'object' ? (f.name || f.title || f.label || '') : String(f)).filter(Boolean);
        } else if (typeof nextDataProps.features === 'string' && nextDataProps.features.includes('\n')) {
          featuresList = nextDataProps.features.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
        }
      }

      const featuresDebug = {
        scriptVersion: SCRIPT_VERSION,
        buildTimestamp: BUILD_TIMESTAMP,
        headingFound: featureHeading ? {
          tag: featureHeading.tagName,
          class: featureHeading.className || '',
          text: (featureHeading.textContent || '').trim()
        } : null,
        candidateHeadingsCount: candidateHeadings.length,
        candidateContainersCount: candidateContainers.length,
        domItemsCount: items.length,
        domItems: items,
        nextDataFeatures: nextDataProps ? nextDataProps.features : null,
        selectedSource: (items.length > 0) ? 'LIVE_DOM' : ((featuresList && featuresList.length > 0) ? 'NEXT_DATA' : 'NONE'),
        featuresArrayBeforeNorm: featuresList
      };

      // --- 15. DESCRIPTION (CSS-Safe Multi-Strategy Scoped Extractor with Show More Clicker) ---
      let description = '';

      // Guard: Check if a string contains CSS / style / syntax junk
      const hasCssArtifacts = (str) => {
        if (!str || typeof str !== 'string') return false;
        return /[{}\[\]]|font-size:|var\(--|@media|\.__m__|line-height:|color:|margin:|padding:|<style|\.className_|text-transform:|background-color:/i.test(str);
      };

      // Helper: Safely extract human-readable text from a container, stripping style/script/svg/buttons and preserving paragraphs
      const extractPureDescriptionText = (container) => {
        if (!container) return '';
        let clone;
        try {
          clone = container.cloneNode(true);
        } catch (e) {
          clone = container;
        }

        if (clone.querySelectorAll) {
          // 1. Remove all non-content, styling, script and hidden elements completely
          const junk = clone.querySelectorAll('style, script, noscript, svg, button, iframe, nav, header, footer, [aria-hidden="true"], [style*="display: none"], [style*="display:none"], [hidden]');
          junk.forEach(el => el.remove());

          // 2. Remove any Show More / Read More anchors or spans or buttons
          const moreControls = clone.querySelectorAll('a, span, div, p, button');
          moreControls.forEach(el => {
            const txt = (el.textContent || '').trim();
            if (/^(?:show\s*more|read\s*more|view\s*more|show\s*less|read\s*less|expand|\.\.\.\s*more)$/i.test(txt)) {
              el.remove();
            }
          });

          // 3. Replace <br> tags with \n, collapsing adjacent whitespace/newlines
          clone.querySelectorAll('br').forEach(br => {
            if (br.nextSibling && br.nextSibling.nodeType === 3) {
              br.nextSibling.nodeValue = br.nextSibling.nodeValue.replace(/^[ \t]*\r?\n[ \t]*/, '');
            }
            if (br.previousSibling && br.previousSibling.nodeType === 3) {
              br.previousSibling.nodeValue = br.previousSibling.nodeValue.replace(/[ \t]*$/, '');
            }
            br.replaceWith('\n');
          });

          // 4. Strategy A: Extract from explicit <p> paragraph elements
          const pElements = Array.from(clone.querySelectorAll('p'));
          if (pElements.length > 0) {
            const validParagraphs = pElements
              .map(p => {
                const rawLines = (p.textContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
                const cleanLines = rawLines
                  .map(l => l.replace(/[ \t]+/g, ' ').trim())
                  .filter(l => l.length > 0 && !/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(l) && !/^(?:show|read|view)\s*(?:more|less)$/i.test(l) && !hasCssArtifacts(l));
                return cleanLines.join('\n');
              })
              .filter(p => p.length > 0 && !/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(p) && !hasCssArtifacts(p));

            if (validParagraphs.length > 0) {
              const combined = validParagraphs.join('\n\n');
              if (!hasCssArtifacts(combined) && combined.length > 15) {
                return combined;
              }
            }
          }

          // 5. Strategy B: Check if there are multiple child block elements (div, section, article, li)
          const childBlocks = Array.from(clone.children).filter(el => /^(DIV|SECTION|ARTICLE|LI)$/i.test(el.tagName));
          if (childBlocks.length > 1) {
            const validBlocks = childBlocks
              .map(el => {
                const rawLines = (el.textContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
                const cleanLines = rawLines
                  .map(l => l.replace(/[ \t]+/g, ' ').trim())
                  .filter(l => l.length > 0 && !/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(l) && !/^(?:show|read|view)\s*(?:more|less)$/i.test(l) && !hasCssArtifacts(l));
                return cleanLines.join('\n');
              })
              .filter(p => p.length > 0 && !/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(p) && !hasCssArtifacts(p));

            if (validBlocks.length > 0) {
              const combined = validBlocks.join('\n\n');
              if (!hasCssArtifacts(combined) && combined.length > 15) {
                return combined;
              }
            }
          }
        }

        // 6. Strategy C: Text content with newline separation
        const rawText = (clone.textContent || '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');

        const rawBlocks = rawText.split(/\n{2,}/);
        const cleanBlocks = rawBlocks
          .map(block => {
            const rawLines = block.split('\n');
            const cleanLines = rawLines
              .map(l => l.replace(/[ \t]+/g, ' ').trim())
              .filter(l => l.length > 0 && !/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(l) && !/^(?:show|read|view)\s*(?:more|less)$/i.test(l) && !hasCssArtifacts(l));
            return cleanLines.join('\n');
          })
          .filter(p => p.length > 0 && !/^(?:seller\s+|dealer\s+|vehicle\s+)?description:?$/i.test(p) && !hasCssArtifacts(p));

        const combined = cleanBlocks.join('\n\n');
        return hasCssArtifacts(combined) ? '' : combined;
      };

      // Step A: Locate Description Heading Element
      const descHeadingCandidates = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="heading"], [class*="title"], strong, b, button, summary, p, div, span'));
      const descHeading = descHeadingCandidates.find(el => {
        const t = (el.textContent || '').trim();
        return /^(?:Seller\s+|Dealer\s+|Vehicle\s+)?Description:?$/i.test(t) && t.length < 30;
      });

      let descBodyContainer = null;

      if (descHeading) {
        let next = descHeading.nextElementSibling;
        if (!next && descHeading.parentElement && descHeading.parentElement !== doc.body) {
          next = descHeading.parentElement.nextElementSibling;
        }
        while (next && !descBodyContainer) {
          const text = extractPureDescriptionText(next);
          if (text.length > 20 && !text.toLowerCase().includes('back to search') && !hasCssArtifacts(text)) {
            descBodyContainer = next;
            break;
          }
          next = next.nextElementSibling;
        }
        if (!descBodyContainer) {
          descBodyContainer = descHeading.closest('section, article, [class*="description"], [class*="card"], [class*="detail"]');
        }
      }

      // Step B: Direct selector lookup for container if not found via heading
      if (!descBodyContainer) {
        descBodyContainer = doc.querySelector('[data-test="description"], [data-testid="description"], #car-description, #description, .description-content, .vehicle-description, .description-text, [class*="description-section"], [class*="description-content"], section[class*="description"]');
      }

      // Step C: Trigger "Show More" / "Read More" button if present
      if (descBodyContainer) {
        const expandBtns = descBodyContainer.querySelectorAll('button, a, [role="button"], span, div');
        for (const btn of expandBtns) {
          const btnTxt = (btn.textContent || '').trim();
          if (/^(?:show\s*more|read\s*more|view\s*more|expand|\.\.\.\s*more)$/i.test(btnTxt)) {
            try {
              btn.click();
              btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            } catch (e) {}
            break;
          }
        }

        // Step D: Extract pure text from container
        description = extractPureDescriptionText(descBodyContainer);
      }

      // Step E: Clean and sanitize description string
      if (description) {
        description = description
          .replace(/^(?:Seller\s+|Dealer\s+|Vehicle\s+)?Description\s*:?\s*/i, '')
          .replace(/(?:Show|Read|View)\s*(?:more|less)\s*$/i, '')
          .replace(/^(?:Show|Read|View)\s*(?:more|less)\s*/i, '')
          .trim();

        if (description.toLowerCase().includes('back to search') || description.length < 20 || hasCssArtifacts(description)) {
          description = '';
        }
      }

      // Step F: Next.js Dehydrated State / JSON-LD Fallback (contains 100% complete seller description)
      if (!description) {
        const stateDesc = nextDataProps.description || nextDataProps.sellerComments || nextDataProps.dealerComments || nextDataProps.comments || '';
        if (stateDesc && !hasCssArtifacts(stateDesc)) {
          description = stateDesc;
        }
      }
      if (!description && jsonLdData.description && jsonLdData.description.length > 40 && !hasCssArtifacts(jsonLdData.description)) {
        description = jsonLdData.description;
      }

      // Step G: Normalize multi-paragraph spacing
      if (description) {
        description = Normalizers.normalizeDescription(description);
      }

      // --- 16. VEHICLE HIGHLIGHTS (Robust multi-card structural extractor) ---
      let vehicleHighlights = '';

      // Helper: Safely extract human-readable text lines from an element
      const extractHighlightCardLines = (el) => {
        if (!el) return [];
        let clone;
        try { clone = el.cloneNode(true); } catch (e) { clone = el; }
        if (clone.querySelectorAll) {
          const junk = clone.querySelectorAll('style, script, noscript, svg, button, iframe, nav, header, footer, [aria-hidden="true"], [style*="display: none"], [style*="display:none"], [hidden]');
          junk.forEach(j => j.remove());
          clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        }

        const text = (clone.textContent || '')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');

        const rawLines = text.split('\n');
        const cleanLines = rawLines
          .map(l => l.replace(/[ \t]+/g, ' ').trim())
          .filter(l => l.length > 0 && !/^(?:vehicle\s+|key\s+|car\s+)?highlights(?:\s*\(\d+\))?:?$/i.test(l) && !hasCssArtifacts(l));

        const uniqueLines = [];
        for (const line of cleanLines) {
          if (uniqueLines.length === 0 || uniqueLines[uniqueLines.length - 1] !== line) {
            uniqueLines.push(line);
          }
        }
        return uniqueLines;
      };

      // 1. Locate heading element for Vehicle Highlights (prefer deepest element containing the heading text)
      const highlightHeadingCandidates = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"], strong, b, [class*="heading"], [class*="title"], summary, p, div, span')).filter(el => {
        const t = (el.textContent || '').trim();
        if (!/^(?:Vehicle\s+|Key\s+|Car\s+)?Highlights(?:\s*\(\d+\))?:?$/i.test(t)) return false;
        if (t.length > 35 || hasCssArtifacts(t)) return false;
        if (/^(DIV|SPAN|P)$/i.test(el.tagName)) {
          if (el.children.length > 2) return false;
          if (el.textContent.trim().length > 35) return false;
        }
        return true;
      });

      // Deepest candidate element (avoids selecting outer section container)
      let highlightHeading = null;
      if (highlightHeadingCandidates.length > 0) {
        highlightHeading = highlightHeadingCandidates.reduce((deepest, curr) => {
          if (!deepest) return curr;
          return (deepest.contains(curr) && deepest !== curr) ? curr : deepest;
        }, null);
      }

      // 2. Identify candidate container(s) strictly for the highlights section
      const highlightContainers = [];

      if (highlightHeading) {
        // Sibling of heading (e.g. <div class="highlights-grid"> or Mantine SimpleGrid)
        if (highlightHeading.nextElementSibling) {
          highlightContainers.push(highlightHeading.nextElementSibling);
        }
        // Sibling of heading's immediate wrapper (e.g. <div class="mantine-Group-root"><h3>Vehicle Highlights</h3></div>)
        if (highlightHeading.parentElement && highlightHeading.parentElement !== doc.body && highlightHeading.parentElement !== doc.documentElement) {
          if (highlightHeading.parentElement.nextElementSibling) {
            highlightContainers.push(highlightHeading.parentElement.nextElementSibling);
          }
          if (highlightHeading.parentElement.parentElement &&
              highlightHeading.parentElement.parentElement !== doc.body &&
              highlightHeading.parentElement.parentElement !== doc.documentElement &&
              !/^(MAIN|BODY|HTML)$/i.test(highlightHeading.parentElement.parentElement.tagName) &&
              !highlightHeading.parentElement.parentElement.classList?.contains('vehicle-view') &&
              !highlightHeading.parentElement.parentElement.id?.includes('root')) {
            if (highlightHeading.parentElement.parentElement.nextElementSibling) {
              highlightContainers.push(highlightHeading.parentElement.parentElement.nextElementSibling);
            }
          }
        }

        // Enclosing highlights-specific section / container (strictly stop before main/body/vehicle-view/root)
        const enclosingSection = highlightHeading.closest('[data-test*="highlight"], [data-testid*="highlight"], section[class*="highlight"], div[class*="highlights"], [class*="highlights-section"], .mantine-Container-root, section, article');
        if (enclosingSection &&
            enclosingSection !== doc.body &&
            enclosingSection !== doc.documentElement &&
            !/^(MAIN|BODY|HTML)$/i.test(enclosingSection.tagName) &&
            !enclosingSection.classList?.contains('vehicle-view') &&
            !enclosingSection.classList?.contains('page-container') &&
            !enclosingSection.id?.includes('root') &&
            !enclosingSection.id?.includes('next')) {
          highlightContainers.push(enclosingSection);
        }
      } else {
        // If NO heading is found, ONLY accept containers explicitly dedicated to vehicle highlights
        const explicitContainers = doc.querySelectorAll('[data-test="vehicle-highlights"], [data-testid="vehicle-highlights"], [data-test="vehicle_highlights"], #vehicle-highlights, .vehicle-highlights, .highlights-section');
        explicitContainers.forEach(el => highlightContainers.push(el));
      }

      // 3. Find repeated card items inside scoped containers
      let extractedCards = [];

      for (const container of highlightContainers) {
        if (!container || extractedCards.length > 0) break;

        // Make sure container is not an unrelated page wrapper
        if (container === doc.body || container === doc.documentElement || /^(BODY|HTML|MAIN)$/i.test(container.tagName)) continue;
        if (container.classList && (container.classList.contains('vehicle-view') || container.classList.contains('page-container'))) continue;

        // Strategy A: Direct repeated children of a grid/flex wrapper inside container
        const candidateWrappers = [container, ...Array.from(container.querySelectorAll('div, ul, ol, section, article'))];
        
        for (const wrapper of candidateWrappers) {
          if (wrapper === highlightHeading || (wrapper.contains(highlightHeading) && wrapper.children.length === 1)) continue;
          
          const children = Array.from(wrapper.children).filter(c => {
            if (c === highlightHeading || c.contains(highlightHeading)) return false;
            if (/^(STYLE|SCRIPT|NOSCRIPT|SVG|BUTTON|NAV|HEADER|FOOTER)$/i.test(c.tagName)) return false;
            return true;
          });

          if (children.length >= 1 && children.length <= 12) {
            // Check if children look like highlight cards (each having 2 to 6 clean lines)
            const validChildCards = children.map(c => extractHighlightCardLines(c)).filter(lines => lines.length >= 2 && lines.length <= 6);
            
            if (validChildCards.length >= 1 && validChildCards.length === children.length) {
              // Found exact repeated cards wrapper!
              extractedCards = validChildCards.map(lines => lines.join('\n'));
              break;
            } else if (validChildCards.length >= 1 && validChildCards.length >= children.length * 0.6) {
              // Found cards wrapper with some minor decorative sibling nodes
              extractedCards = validChildCards.map(lines => lines.join('\n'));
              break;
            }
          }
        }

        // Strategy B: If no clear wrapper found, gather leaf-like card elements within this highlights container
        if (extractedCards.length === 0) {
          const potentialCards = Array.from(container.querySelectorAll('div, li, article, section')).filter(el => {
            if (el === highlightHeading || el.contains(highlightHeading) || el === container) return false;
            const lines = extractHighlightCardLines(el);
            if (lines.length >= 2 && lines.length <= 6) {
              // Check if child elements themselves have 2+ lines
              const childCards = Array.from(el.children).filter(c => extractHighlightCardLines(c).length >= 2);
              return childCards.length <= 1;
            }
            return false;
          });

          if (potentialCards.length >= 1 && potentialCards.length <= 12) {
            const seen = new Set();
            const cardsList = [];
            for (const cardEl of potentialCards) {
              const lines = extractHighlightCardLines(cardEl);
              if (lines.length >= 2) {
                const text = lines.join('\n');
                if (!seen.has(text) && !hasCssArtifacts(text)) {
                  seen.add(text);
                  cardsList.push(text);
                }
              }
            }
            if (cardsList.length > 0) {
              extractedCards = cardsList;
            }
          }
        }
      }

      if (extractedCards.length > 0) {
        vehicleHighlights = extractedCards.join('\n\n');
      }

      // 4. Fallback: Deep recursive search in Next.js State (ONLY for actual vehicle highlights keys, NEVER key_specs or insights)
      if (!vehicleHighlights && (nextDataProps || rawNextData)) {
        const searchNextDataHighlights = (obj, depth = 0) => {
          if (!obj || typeof obj !== 'object' || depth > 8) return null;
          for (const key of Object.keys(obj)) {
            if (/^(?:vehicle_?highlights?|key_?highlights?|vehicle_?highlight_?cards?)$/i.test(key)) {
              const val = obj[key];
              if (Array.isArray(val) && val.length > 0) return val;
            }
          }
          for (const key of Object.keys(obj)) {
            if (/^(?:specs|specifications|features|dealer|breadcrumbs|seo|finance|pricing)$/i.test(key)) continue;
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              const res = searchNextDataHighlights(obj[key], depth + 1);
              if (res) return res;
            }
          }
          return null;
        };

        const rawHL = searchNextDataHighlights(rawNextData) || searchNextDataHighlights(nextDataProps);
        if (Array.isArray(rawHL) && rawHL.length > 0) {
          const stateCards = rawHL.map(item => {
            if (typeof item === 'string') return item.trim();
            if (typeof item === 'object' && item !== null) {
              const title = item.title || item.heading || item.name || item.label || '';
              const val = item.value || item.metric || item.stat || item.figure || '';
              const desc = item.description || item.desc || item.detail || item.text || item.summary || '';
              return [title, val, desc].filter(Boolean).map(s => String(s).trim()).join('\n');
            }
            return '';
          }).filter(Boolean);
          if (stateCards.length > 0) {
            vehicleHighlights = stateCards.join('\n\n');
          }
        }
      }

      if (vehicleHighlights) {
        vehicleHighlights = Normalizers.normalizeVehicleHighlights(vehicleHighlights);
      }

      // --- 18. SOURCE URL ---
      const sourceUrl = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
                        doc.querySelector('#source-url-meta')?.getAttribute('href') ||
                        getMeta(['og:url']) ||
                        doc.location?.href || '';

      // --- 19. CONTACT NUMBER (Dealer / Seller Phone Number) ---
      let contactNumber = '';

      // Step A: Live DOM check for explicit tel links or revealed phone elements
      const telLinks = doc.querySelectorAll('a[href^="tel:"], [data-test*="phone"], [data-test*="contact-number"], [data-test*="dealer-phone"], [class*="dealer-phone"], [class*="contact-number"]');
      for (const link of telLinks) {
        const href = (link.getAttribute('href') || '').replace(/^tel:\s*/i, '').trim();
        const txt = (link.textContent || '').replace(/\s+/g, ' ').trim();
        const cand = (txt && /\d/.test(txt) && !txt.includes('*') && !txt.toLowerCase().includes('show')) ? txt : (href || txt);
        if (cand && !cand.includes('*') && !cand.toLowerCase().includes('show') && !cand.toLowerCase().includes('missing')) {
          const digits = cand.replace(/[^\d]/g, '');
          if (digits.length >= 7 && digits.length <= 15) {
            contactNumber = cand;
            break;
          }
        }
      }

      // Step B: Search inside dealer / seller / contact cards
      if (!contactNumber) {
        const contactContainers = doc.querySelectorAll('.dealer-card, .dealer-details, .seller-details, .contact-details, [data-test*="dealer"], [data-test*="seller"], [data-test*="contact"]');
        for (const container of contactContainers) {
          const text = container.textContent || '';
          const phoneMatch = text.match(/(?:\+27|0)\s*(?:[1-9]\d|\d{2})[\s.-]?\d{3}[\s.-]?\d{4}/);
          if (phoneMatch) {
            const matchStr = phoneMatch[0].trim();
            if (!matchStr.includes('*')) {
              contactNumber = matchStr;
              break;
            }
          }
        }
      }

      // Step C: Structured data fallback if unmasked
      if (!contactNumber) {
        const cand = nextDataProps.dealer?.phone || nextDataProps.dealer?.telephone || nextDataProps.dealer?.contactNumber || nextDataProps.seller?.telephone || jsonLdData.offers?.seller?.telephone || jsonLdData.seller?.telephone || '';
        if (typeof cand === 'string' && cand && !cand.includes('*')) {
          const digits = cand.replace(/[^\d]/g, '');
          if (digits.length >= 7 && digits.length <= 15) {
            contactNumber = cand;
          }
        }
      }

      return {
        title,
        titleDescription,
        year,
        kilometersDriven,
        transmission,
        fuel,
        drivetrain,
        bodyColor,
        condition,
        pricingSummary,
        dealerName,
        dealerAddress,
        averageRating,
        features: featuresList,
        description,
        vehicleHighlights,
        price: formattedPrice || rawPrice,
        sourceUrl,
        contactNumber,
        _featuresDebug: featuresDebug
      };
    }
  };

  // --- 4. FLOATING UI PANEL CONTROLLER (19 Fields with Individual COPY buttons) ---
  const FIELD_DEFINITIONS = [
    { key: 'title', label: 'Title' },
    { key: 'titleDescription', label: 'Title Description' },
    { key: 'year', label: 'Year' },
    { key: 'kilometersDriven', label: 'Kilometers Driven' },
    { key: 'transmission', label: 'Transmission' },
    { key: 'fuel', label: 'Fuel' },
    { key: 'drivetrain', label: '4x2 / 4x4' },
    { key: 'bodyColor', label: 'Body Color' },
    { key: 'condition', label: 'Condition' },
    { key: 'pricingSummary', label: 'Pricing Summary' },
    { key: 'dealerName', label: 'Dealer Name' },
    { key: 'dealerAddress', label: 'Dealer Address' },
    { key: 'averageRating', label: 'Average Rating' },
    { key: 'features', label: 'Features' },
    { key: 'description', label: 'Description' },
    { key: 'vehicleHighlights', label: 'Vehicle Highlights' },
    { key: 'price', label: 'Price' },
    { key: 'sourceUrl', label: 'Source URL' },
    { key: 'contactNumber', label: 'Contact Number' }
  ];

  let currentExtractedData = {};

  function normalizeAndValidate(raw) {
    const norm = Normalizers;
    const normalized = {
      title: norm.cleanText(raw.title),
      titleDescription: norm.cleanText(raw.titleDescription),
      year: norm.normalizeYear(raw.year),
      kilometersDriven: norm.normalizeKilometersDriven(raw.kilometersDriven),
      transmission: norm.normalizeTransmission(raw.transmission),
      fuel: norm.normalizeFuel(raw.fuel),
      drivetrain: norm.normalize4x2Or4x4(raw.drivetrain),
      bodyColor: norm.cleanText(raw.bodyColor),
      condition: norm.cleanText(raw.condition),
      pricingSummary: norm.cleanText(raw.pricingSummary),
      dealerName: norm.cleanText(raw.dealerName),
      dealerAddress: norm.cleanText(raw.dealerAddress),
      averageRating: norm.cleanText(raw.averageRating),
      features: norm.normalizeFeatures(raw.features),
      description: norm.normalizeDescription(raw.description),
      vehicleHighlights: norm.normalizeVehicleHighlights(raw.vehicleHighlights),
      price: norm.normalizePrice(raw.price),
      sourceUrl: raw.sourceUrl || window.location.href,
      contactNumber: norm.normalizeContactNumber ? norm.normalizeContactNumber(raw.contactNumber) : (raw.contactNumber || ''),
      _featuresDebug: raw._featuresDebug || null
    };
    const validation = Validators.validateAll(normalized);
    return { normalized, validation };
  }

  function formatDescriptionHtml(text) {
    if (!text || typeof text !== 'string') return '';
    const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (/^\s*<p\b/i.test(text)) return text;
    const normalized = Normalizers.normalizeDescription(text);
    const paragraphs = normalized.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    return paragraphs.map(p => {
      const lines = p.split('\n').map(l => escapeHtml(l.trim())).filter(Boolean);
      return `<p>${lines.join('<br>')}</p>`;
    }).join('');
  }

  function copyToClipboard(text, btnElement, event, fieldLabel, fieldKey) {
    if (event) {
      try {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      } catch (e) {}
    }
    let cleanStr = (text == null) ? '' : String(text);
    if (!cleanStr.trim() || cleanStr.trim() === 'Missing / Needs Review') {
      alert('This field is missing or unextracted on this listing.');
      return;
    }

    if (fieldKey === 'features' || (fieldLabel && fieldLabel.includes('Features'))) {
      cleanStr = Normalizers.normalizeFeatures(cleanStr);
    }

    const copyFallback = (str) => {
      const textarea = document.createElement('textarea');
      textarea.value = str;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '2em';
      textarea.style.height = '2em';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      textarea.style.zIndex = '-9999';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.setSelectionRange(0, str.length);
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textarea);
    };

    const isDescription = (fieldKey === 'description' || (fieldLabel && fieldLabel.toLowerCase() === 'description'));

    if (isDescription) {
      const plainStr = cleanStr;
      const htmlStr = formatDescriptionHtml(cleanStr);

      const copyRichFallback = (htmlContent, plainContent) => {
        const container = document.createElement('div');
        container.innerHTML = htmlContent;
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.opacity = '0';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(container);
        selection.removeAllRanges();
        selection.addRange(range);

        const onCopy = (e) => {
          e.preventDefault();
          if (e.clipboardData) {
            e.clipboardData.setData('text/plain', plainContent);
            e.clipboardData.setData('text/html', htmlContent);
          }
        };
        document.addEventListener('copy', onCopy);
        try {
          document.execCommand('copy');
        } catch (e) {
          copyFallback(plainContent);
        }
        document.removeEventListener('copy', onCopy);
        selection.removeAllRanges();
        document.body.removeChild(container);
      };

      let copied = false;
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
        try {
          const textBlob = new Blob([plainStr], { type: 'text/plain' });
          const htmlBlob = new Blob([htmlStr], { type: 'text/html' });
          const item = new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob
          });
          navigator.clipboard.write([item]).catch(() => {
            if (typeof GM_setClipboard === 'function') {
              try { GM_setClipboard(htmlStr, { type: 'html', mimetype: 'text/html' }); } catch (_) { GM_setClipboard(plainStr, 'text'); }
            } else {
              copyRichFallback(htmlStr, plainStr);
            }
          });
          copied = true;
        } catch (_) {
          copied = false;
        }
      }

      if (!copied && typeof GM_setClipboard === 'function') {
        try {
          GM_setClipboard(htmlStr, { type: 'html', mimetype: 'text/html' });
          copied = true;
        } catch (_) {
          try {
            GM_setClipboard(plainStr, 'text');
            copied = true;
          } catch (_) {}
        }
      }

      if (!copied) {
        copyRichFallback(htmlStr, plainStr);
      }
    } else {
      let copied = false;
      if (typeof GM_setClipboard === 'function') {
        try {
          GM_setClipboard(cleanStr, 'text');
          copied = true;
        } catch (gmErr) {
          console.warn('GM_setClipboard failed:', gmErr);
        }
      }

      if (!copied) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(cleanStr).catch(() => copyFallback(cleanStr));
        } else {
          copyFallback(cleanStr);
        }
      }
    }

    if (btnElement) {
      const origText = btnElement.textContent;
      btnElement.textContent = 'COPIED!';
      btnElement.style.background = '#10b981';
      btnElement.style.color = '#ffffff';
      setTimeout(() => {
        btnElement.textContent = origText;
        btnElement.style.background = '#f1f5f9';
        btnElement.style.color = '#0f172a';
      }, 1400);
    }
  }

  let savedPosition = null;

  function clampPosition(targetLeft, targetTop, panelEl) {
    const el = panelEl || (typeof document !== 'undefined' ? document.getElementById('car-data-helper-panel') : null);
    const minMargin = 8;
    const vpWidth = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 360;
    const vpHeight = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 640;
    const pWidth = (el && el.offsetWidth > 0) ? el.offsetWidth : Math.min(420, vpWidth - (minMargin * 2));
    const pHeight = (el && el.offsetHeight > 0) ? el.offsetHeight : 200;

    const maxLeft = Math.max(minMargin, vpWidth - pWidth - minMargin);
    const maxTop = Math.max(minMargin, vpHeight - pHeight - minMargin);

    const clampedLeft = Math.min(Math.max(minMargin, targetLeft), maxLeft);
    const clampedTop = Math.min(Math.max(minMargin, targetTop), maxTop);

    return { left: clampedLeft, top: clampedTop };
  }

  function applyPosition(left, top, panelEl) {
    const el = panelEl || (typeof document !== 'undefined' ? document.getElementById('car-data-helper-panel') : null);
    if (!el) return;
    const clamped = clampPosition(left, top, el);
    savedPosition = { left: clamped.left, top: clamped.top };
    el.style.left = `${clamped.left}px`;
    el.style.top = `${clamped.top}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  function createOpenHelperButton() {
    if (typeof document === 'undefined') return null;
    let openBtn = document.getElementById('car-helper-open-btn');
    if (openBtn) return openBtn;

    openBtn = document.createElement('button');
    openBtn.id = 'car-helper-open-btn';
    openBtn.type = 'button';
    openBtn.title = 'Open Car Data Entry Helper';
    openBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999998;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 24px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      cursor: pointer;
      display: none;
      align-items: center;
      gap: 6px;
      user-select: none;
      -webkit-user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      transition: transform 0.15s ease, background 0.15s ease;
    `;
    openBtn.innerHTML = '<span style="font-size:14px;">🚗</span><span>Open Helper</span>';
    openBtn.onmouseenter = () => { openBtn.style.background = '#1e293b'; };
    openBtn.onmouseleave = () => { openBtn.style.background = '#0f172a'; };
    openBtn.onclick = () => openHelperPanel();
    document.body.appendChild(openBtn);
    return openBtn;
  }

  function closeHelperPanel() {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('car-data-helper-panel');
    const openBtn = document.getElementById('car-helper-open-btn') || createOpenHelperButton();
    if (panel) {
      panel.style.display = 'none';
    }
    if (openBtn) {
      openBtn.style.display = 'flex';
    }
  }

  function openHelperPanel() {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('car-data-helper-panel');
    const openBtn = document.getElementById('car-helper-open-btn');
    if (openBtn) {
      openBtn.style.display = 'none';
    }
    if (panel) {
      panel.style.display = 'flex';
      if (savedPosition) {
        applyPosition(savedPosition.left, savedPosition.top, panel);
      } else {
        const rect = panel.getBoundingClientRect();
        applyPosition(rect.left, rect.top, panel);
      }
    }
  }

  function initDraggablePanel(panel, header) {
    let pointerStartX = 0;
    let pointerStartY = 0;
    let initialPanelLeft = 0;
    let initialPanelTop = 0;
    let pointerDownActive = false;
    let isDragging = false;
    let activePointerId = null;

    const onPointerMove = (e) => {
      if (!pointerDownActive) return;
      if (activePointerId != null && e.pointerId != null && e.pointerId !== activePointerId) return;

      const clientX = e.clientX != null ? e.clientX : (e.touches ? e.touches[0].clientX : 0);
      const clientY = e.clientY != null ? e.clientY : (e.touches ? e.touches[0].clientY : 0);
      const dx = clientX - pointerStartX;
      const dy = clientY - pointerStartY;
      const distance = Math.hypot(dx, dy);

      if (!isDragging && distance >= 4) {
        isDragging = true;
        header.style.touchAction = 'none';
        if (typeof document !== 'undefined' && document.body) {
          document.body.style.userSelect = 'none';
          document.body.style.webkitUserSelect = 'none';
        }
      }

      if (isDragging) {
        if (e.cancelable) {
          e.preventDefault();
        }
        applyPosition(initialPanelLeft + dx, initialPanelTop + dy, panel);
      }
    };

    const onPointerEnd = (e) => {
      if (!pointerDownActive) return;
      if (activePointerId != null && e && e.pointerId != null && e.pointerId !== activePointerId) return;

      if (isDragging && e) {
        if (e.cancelable) e.preventDefault();
        try { e.stopPropagation(); } catch (_) {}
      }

      pointerDownActive = false;
      const wasDragging = isDragging;
      isDragging = false;
      activePointerId = null;
      header.style.touchAction = '';
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerEnd);
        window.removeEventListener('pointercancel', onPointerEnd);
        window.removeEventListener('touchmove', onPointerMove);
        window.removeEventListener('touchend', onPointerEnd);
        window.removeEventListener('touchcancel', onPointerEnd);
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('mouseup', onPointerEnd);

        if (wasDragging) {
          const preventClickOnce = (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            window.removeEventListener('click', preventClickOnce, true);
          };
          window.addEventListener('click', preventClickOnce, true);
          setTimeout(() => {
            window.removeEventListener('click', preventClickOnce, true);
          }, 100);
        }
      }
    };

    const onPointerStart = (e) => {
      const target = e.target;
      if (!target || target.closest('button, a, input, textarea, select, [role="button"]')) {
        return;
      }
      if (e.button !== undefined && e.button !== 0) {
        return;
      }

      const clientX = e.clientX != null ? e.clientX : (e.touches ? e.touches[0].clientX : 0);
      const clientY = e.clientY != null ? e.clientY : (e.touches ? e.touches[0].clientY : 0);

      pointerStartX = clientX;
      pointerStartY = clientY;
      const rect = panel.getBoundingClientRect();
      initialPanelLeft = rect.left;
      initialPanelTop = rect.top;
      pointerDownActive = true;
      isDragging = false;
      activePointerId = e.pointerId != null ? e.pointerId : null;

      if (typeof window !== 'undefined') {
        if (typeof window.PointerEvent !== 'undefined') {
          window.addEventListener('pointermove', onPointerMove, { passive: false });
          window.addEventListener('pointerup', onPointerEnd);
          window.addEventListener('pointercancel', onPointerEnd);
        } else if (e.type === 'touchstart') {
          window.addEventListener('touchmove', onPointerMove, { passive: false });
          window.addEventListener('touchend', onPointerEnd);
          window.addEventListener('touchcancel', onPointerEnd);
        } else {
          window.addEventListener('mousemove', onPointerMove);
          window.addEventListener('mouseup', onPointerEnd);
        }
      }
    };

    if (typeof window !== 'undefined' && typeof window.PointerEvent !== 'undefined') {
      header.addEventListener('pointerdown', onPointerStart);
    } else {
      header.addEventListener('mousedown', onPointerStart);
      header.addEventListener('touchstart', onPointerStart, { passive: true });
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      const panel = document.getElementById('car-data-helper-panel');
      if (panel && panel.style.display !== 'none' && savedPosition) {
        applyPosition(savedPosition.left, savedPosition.top, panel);
      }
    });
  }

  function createHelperPanel() {
    if (document.getElementById('car-data-helper-panel')) return;

    const minMargin = 8;
    const vpWidth = window.innerWidth || document.documentElement.clientWidth || 360;
    const panelWidth = Math.min(420, vpWidth - (minMargin * 2));

    const panel = document.createElement('div');
    panel.id = 'car-data-helper-panel';
    panel.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      width: min(420px, calc(100vw - 20px));
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 24px);
      box-sizing: border-box;
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      z-index: 9999999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    panel.innerHTML = `
      <div id="car-panel-header" style="background:#0f172a; color:#f8fafc; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; cursor:move; user-select:none; -webkit-user-select:none; box-sizing:border-box;">
        <div style="display:flex; align-items:center; gap:8px; pointer-events:none; min-width:0; overflow:hidden;">
          <span style="font-size:16px; flex-shrink:0;">🚗</span>
          <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <strong style="font-size:13px; letter-spacing:0.3px;">Car Data Entry Helper</strong>
            <span style="font-size:10px; background:#3b82f6; color:#ffffff; padding:2px 6px; border-radius:10px; margin-left:6px; font-weight:700;">v${SCRIPT_VERSION}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
          <button id="car-panel-reextract" title="Re-extract live data" style="background:#334155; color:#f8fafc; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;">🔄 Re-extract</button>
          <button id="car-panel-toggle" title="Minimize / Expand" style="background:transparent; color:#94a3b8; border:none; font-size:14px; cursor:pointer; padding:2px 6px;">➖</button>
          <button id="car-panel-close" title="Close / Hide Helper" style="background:transparent; color:#94a3b8; border:none; font-size:16px; font-weight:700; cursor:pointer; padding:2px 6px; line-height:1; border-radius:4px;">✕</button>
        </div>
      </div>

      <div id="car-panel-summary-bar" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:8px 16px; font-size:11px; color:#64748b; display:flex; justify-content:space-between; align-items:center;">
        <span id="car-extracted-count">Extracting fields...</span>
        <span style="font-size:10px; color:#94a3b8;">Manual 1-Click Copy</span>
      </div>

      <div id="car-panel-body" style="padding:10px 14px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px;">
        <!-- Fields will be dynamically injected -->
      </div>

      <div id="car-panel-footer" style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:10px 14px; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; gap:8px;">
          <button id="car-panel-fill-dice" style="background:#16a34a; color:#ffffff; border:none; padding:8px 12px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer; flex:2; display:flex; align-items:center; justify-content:center; gap:6px; transition:all 0.15s ease;">
            ⚡ FILL FORM (DICE)
          </button>
          <button id="car-panel-dryrun-dice" style="background:#0284c7; color:#ffffff; border:none; padding:8px 10px; border-radius:6px; font-weight:700; font-size:11px; cursor:pointer; flex:1; display:flex; align-items:center; justify-content:center; gap:4px; transition:all 0.15s ease;">
            🧪 DRY-RUN
          </button>
        </div>
        <div style="display:flex; gap:8px;">
          <button id="car-panel-copy-all" style="background:#e2e8f0; color:#334155; border:1px solid #cbd5e1; padding:5px 8px; border-radius:5px; font-weight:600; font-size:11px; cursor:pointer; width:100%;">
            📋 Copy JSON (Fallback)
          </button>
        </div>
        <div id="car-panel-toast" style="display:none; font-size:11px; text-align:center; padding:4px 8px; border-radius:4px; font-weight:600;"></div>
      </div>
    `;

    document.body.appendChild(panel);

    createOpenHelperButton();

    const header = panel.querySelector('#car-panel-header');
    initDraggablePanel(panel, header);

    const initialLeft = Math.max(minMargin, vpWidth - panelWidth - 16);
    const initialTop = 16;
    applyPosition(initialLeft, initialTop, panel);

    panel.querySelector('#car-panel-reextract').onclick = () => runExtraction();
    panel.querySelector('#car-panel-close').onclick = () => closeHelperPanel();
    panel.querySelector('#car-panel-toggle').onclick = () => {
      const body = panel.querySelector('#car-panel-body');
      const footer = panel.querySelector('#car-panel-footer');
      const sumBar = panel.querySelector('#car-panel-summary-bar');
      const btn = panel.querySelector('#car-panel-toggle');
      if (body.style.display === 'none') {
        body.style.display = 'flex';
        footer.style.display = 'flex';
        sumBar.style.display = 'flex';
        btn.textContent = '➖';
      } else {
        body.style.display = 'none';
        footer.style.display = 'none';
        sumBar.style.display = 'none';
        btn.textContent = '➕';
      }
      if (savedPosition) {
        applyPosition(savedPosition.left, savedPosition.top, panel);
      }
    };

    const showToast = (msg, isSuccess = true) => {
      const toast = panel.querySelector('#car-panel-toast');
      if (!toast) return;
      toast.textContent = msg;
      toast.style.background = isSuccess ? '#dcfce7' : '#fee2e2';
      toast.style.color = isSuccess ? '#15803d' : '#b91c1c';
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 4500);
    };

    const buildPayload = (actionType = 'autofill') => {
      const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      return {
        marker: 'CAR_DATA_ENTRY_HELPER',
        jobId: jobId,
        action: actionType,
        timestamp: Date.now(),
        version: 2,
        source: 'cars.co.za',
        sourceUrl: currentExtractedData.sourceUrl || window.location.href,
        fields: {
          title: currentExtractedData.title || '',
          titleDescription: currentExtractedData.titleDescription || '',
          year: currentExtractedData.year || '',
          kilometersDriven: currentExtractedData.kilometersDriven || '',
          transmission: currentExtractedData.transmission || '',
          fuel: currentExtractedData.fuel || '',
          drivetrain: currentExtractedData.drivetrain || '',
          bodyColor: currentExtractedData.bodyColor || '',
          condition: currentExtractedData.condition || '',
          pricingSummary: currentExtractedData.pricingSummary || '',
          dealerName: currentExtractedData.dealerName || '',
          dealerAddress: currentExtractedData.dealerAddress || '',
          averageRating: currentExtractedData.averageRating || '',
          features: currentExtractedData.features || '',
          description: currentExtractedData.description || '',
          vehicleHighlights: currentExtractedData.vehicleHighlights || '',
          price: currentExtractedData.price || '',
          sourceUrl: currentExtractedData.sourceUrl || window.location.href,
          contactNumber: currentExtractedData.contactNumber || ''
        }
      };
    };

    panel.querySelector('#car-panel-fill-dice').onclick = () => {
      const payload = buildPayload('autofill');
      if (typeof GM_setValue === 'function') {
        GM_setValue('DICE_PENDING_JOB', payload);
      }
      try {
        localStorage.setItem('DICE_PENDING_JOB', JSON.stringify(payload));
      } catch (e) {}
      copyToClipboard(JSON.stringify(payload, null, 2));
      showToast('✓ Sent to DICE tab! Open DICE tab to run automation.');
    };

    panel.querySelector('#car-panel-dryrun-dice').onclick = () => {
      const payload = buildPayload('dryrun');
      if (typeof GM_setValue === 'function') {
        GM_setValue('DICE_PENDING_JOB', payload);
      }
      try {
        localStorage.setItem('DICE_PENDING_JOB', JSON.stringify(payload));
      } catch (e) {}
      showToast('✓ Dry-Run sent to DICE tab!');
    };

    panel.querySelector('#car-panel-copy-all').onclick = (e) => {
      const payload = buildPayload('autofill');
      const jsonStr = JSON.stringify(payload, null, 2);
      copyToClipboard(jsonStr, e.target);
      showToast('✓ Copied JSON payload to clipboard');
    };

    autoRevealShowNumber(document);
    runExtraction();
  }

  let revealTriggered = false;
  function autoRevealShowNumber(doc) {
    if (!doc) doc = document;
    if (revealTriggered) return;

    const candidateButtons = Array.from(doc.querySelectorAll('button, a, div[role="button"], span[role="button"], [data-test*="show-number"], [data-test*="reveal"], [data-test*="contact-number"], [class*="show-number"], [class*="reveal"]'));
    for (const btn of candidateButtons) {
      const text = (btn.textContent || '').trim();
      const isShowNumber = /^(?:show\s*(?:phone\s*)?number|reveal\s*(?:phone\s*)?number|show\s*contact)$/i.test(text) ||
                           /show\s*number/i.test(text) ||
                           (btn.dataset && (btn.dataset.test === 'show-number' || btn.dataset.test === 'btn-show-number'));
      
      const href = (btn.getAttribute('href') || '').toLowerCase();
      if (href.startsWith('tel:') && !text.includes('*') && !/show\s*number/i.test(text)) {
        continue;
      }
      if (href.startsWith('https://wa.me') || href.includes('whatsapp') || href.startsWith('mailto:')) {
        continue;
      }

      if (isShowNumber) {
        revealTriggered = true;
        try {
          btn.click();
        } catch (e) {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }

        setTimeout(() => { if (typeof runExtraction === 'function') runExtraction(); }, 300);
        setTimeout(() => { if (typeof runExtraction === 'function') runExtraction(); }, 800);
        setTimeout(() => { if (typeof runExtraction === 'function') runExtraction(); }, 1500);
        break;
      }
    }
  }

  function runExtraction() {
    const bodyEl = document.getElementById('car-panel-body');
    const countEl = document.getElementById('car-extracted-count');
    if (!bodyEl) return;

    bodyEl.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Extracting live page specifications...</div>';

    setTimeout(() => {
      const raw = CarsCoZaAdapter.extract(document);
      const { normalized, validation } = normalizeAndValidate(raw);
      currentExtractedData = normalized;

      let extractedCount = 0;
      bodyEl.innerHTML = '';

      FIELD_DEFINITIONS.forEach(({ key, label }) => {
        const val = normalized[key];
        const statusObj = validation[key];
        const isExtracted = statusObj.status === 'extracted';
        if (isExtracted) extractedCount++;

        const row = document.createElement('div');
        row.style.cssText = `
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 6px 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          transition: all 0.15s ease;
        `;

        const leftCol = document.createElement('div');
        leftCol.style.cssText = 'flex:1; min-width:0;';

        const labelEl = document.createElement('div');
        labelEl.style.cssText = 'font-size:10.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.4px;';
        labelEl.textContent = label;

        const valEl = document.createElement('div');
        valEl.style.cssText = 'font-size:12.5px; font-weight:600; margin-top:2px; word-break:break-word; white-space:pre-wrap; max-height:80px; overflow-y:auto;';

        if (isExtracted) {
          valEl.style.color = '#0f172a';
          valEl.textContent = val;
        } else {
          valEl.style.color = '#dc2626';
          valEl.innerHTML = `<span style="background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">Missing / Needs Review</span>`;
        }

        leftCol.appendChild(labelEl);
        leftCol.appendChild(valEl);

        const copyBtn = document.createElement('button');
        copyBtn.style.cssText = `
          background: #f1f5f9;
          color: #0f172a;
          border: 1px solid #cbd5e1;
          padding: 5px 10px;
          border-radius: 5px;
          font-weight: 700;
          font-size: 11px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        `;
        copyBtn.type = 'button';
        copyBtn.textContent = 'COPY';
        copyBtn.title = `Copy ${label}`;
        copyBtn.onclick = (e) => copyToClipboard(val, copyBtn, e, label, key);

        row.appendChild(leftCol);
        row.appendChild(copyBtn);
        bodyEl.appendChild(row);
      });

      // Inject Live Features Diagnostic Card
      const diagCard = document.createElement('div');
      diagCard.id = 'car-panel-diagnostic-card';
      diagCard.style.cssText = 'background:#0f172a; color:#f8fafc; border-radius:6px; padding:10px; font-family:monospace; font-size:11px; margin-top:8px; line-height:1.4; word-break:break-all;';
      
      const dbg = normalized._featuresDebug || {};
      diagCard.innerHTML = `
        <div style="color:#38bdf8; font-weight:700; border-bottom:1px solid #334155; padding-bottom:4px; margin-bottom:6px;">
          🔍 LIVE FEATURES DIAGNOSTIC TRACE
        </div>
        <div><strong style="color:#94a3b8;">Runtime Build:</strong> <span style="color:#f43f5e; font-weight:700;">${SCRIPT_VERSION}</span> (${BUILD_TIMESTAMP})</div>
        <div><strong style="color:#94a3b8;">Selected Source:</strong> <span style="color:#fbbf24; font-weight:700;">${dbg.selectedSource || 'NONE'}</span></div>
        <div><strong style="color:#94a3b8;">DOM Heading Found:</strong> ${dbg.headingFound ? `&lt;${dbg.headingFound.tag}&gt; "${dbg.headingFound.text}"` : 'None'}</div>
        <div><strong style="color:#94a3b8;">DOM Items Count:</strong> ${dbg.domItemsCount || 0}</div>
        <div><strong style="color:#94a3b8;">DOM Items Array:</strong> ${JSON.stringify(dbg.domItems || [])}</div>
        <div><strong style="color:#94a3b8;">NEXT_DATA Features:</strong> ${JSON.stringify(dbg.nextDataFeatures || 'None')}</div>
        <div><strong style="color:#94a3b8;">Features Array Before Norm:</strong> ${JSON.stringify(dbg.featuresArrayBeforeNorm || [])}</div>
        <div><strong style="color:#94a3b8;">Final Features JSON:</strong> <span style="color:#34d399;">${JSON.stringify(normalized.features)}</span></div>
      `;
      bodyEl.appendChild(diagCard);

      console.log('🚗 [CAR DATA HELPER DIAGNOSTIC TRACE]:', {
        version: SCRIPT_VERSION,
        build: BUILD_TIMESTAMP,
        heading: dbg.headingFound,
        containersCount: dbg.candidateContainersCount,
        domItemsCount: dbg.domItemsCount,
        domItems: dbg.domItems,
        nextDataRaw: dbg.nextDataFeatures,
        selectedSource: dbg.selectedSource,
        featuresArrayBeforeNorm: dbg.featuresArrayBeforeNorm,
        finalNormalizedFeatures: normalized.features,
        finalNormalizedFeaturesJSON: JSON.stringify(normalized.features)
      });

      if (countEl) {
        countEl.textContent = `Extracted ${extractedCount} of 19 fields`;
        countEl.style.color = extractedCount >= 16 ? '#16a34a' : (extractedCount >= 10 ? '#d97706' : '#dc2626');
        countEl.style.fontWeight = '700';
      }
    }, 100);
  }

  // --- 5. SMART PASTE ENGINE (Silent Background Transport Layer) ---
  const SmartPasteEngine = {
    init() {
      if (window.__carSmartPasteInitialized) return;
      window.__carSmartPasteInitialized = true;
      document.addEventListener('paste', this.handlePaste.bind(this), true);
    },

    handlePaste(e) {
      let text = '';
      try {
        if (e.clipboardData) {
          text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
        } else if (window.clipboardData) {
          text = window.clipboardData.getData('Text');
        }
      } catch (err) {
        return;
      }

      if (!text || typeof text !== 'string') return;
      const trimmed = text.trim();

      // Fast check for marker
      if (!trimmed.startsWith('{') || !trimmed.includes('CAR_DATA_ENTRY_HELPER')) {
        // Normal paste - DO NOT intercept, DO NOT preventDefault, DO NOT stopPropagation
        return;
      }

      let payload;
      try {
        payload = JSON.parse(trimmed);
      } catch (err) {
        return;
      }

      if (!payload || payload.marker !== 'CAR_DATA_ENTRY_HELPER' || !payload.fields) {
        return;
      }

      // Intercept our Smart Paste payload
      e.preventDefault();
      e.stopPropagation();

      this.fillTargetForm(document, payload.fields);
    },

    fillTargetForm(doc, fields) {
      if (!doc || !fields) return;

      const triggerEvents = (el) => {
        try {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        } catch (err) {}
      };

      const isClean = (v) => {
        if (v == null) return false;
        const s = String(v).trim();
        return s !== '' && s !== 'Missing / Needs Review';
      };

      // Helper to find input/textarea by exact semantic criteria
      const findFieldElement = (identifiers) => {
        // 1. Direct selector match
        for (const sel of identifiers.selectors || []) {
          try {
            const el = doc.querySelector(sel);
            if (el && this.isSafeEditable(el, identifiers.allowSelect)) return el;
          } catch (e) {}
        }

        // 2. Label match
        if (identifiers.labels && identifiers.labels.length > 0) {
          const allLabels = doc.querySelectorAll('label, .control-label, .form-label');
          for (const lbl of allLabels) {
            const lText = lbl.textContent.replace(/\s+/g, ' ').trim();
            for (const targetLabel of identifiers.labels) {
              const matches = typeof targetLabel === 'string'
                ? lText.toLowerCase() === targetLabel.toLowerCase()
                : targetLabel.test(lText);

              if (matches) {
                // Check if label has a "for" attribute
                const forId = lbl.getAttribute('for');
                if (forId) {
                  const el = (doc.getElementById ? doc.getElementById(forId) : (doc.ownerDocument || document).getElementById(forId)) || (doc.querySelector ? doc.querySelector('#' + CSS.escape(forId)) : null);
                  if (el && this.isSafeEditable(el, identifiers.allowSelect)) return el;
                }
                // Check inside label
                const inside = lbl.querySelector('textarea, input');
                if (inside && this.isSafeEditable(inside, identifiers.allowSelect)) return inside;

                // Check container/sibling (prefer textarea if present)
                const container = lbl.closest('.form-group, .control-group, .demo-form-group, tr, td, .form-item, div');
                if (container) {
                  const siblingTextarea = container.querySelector('textarea');
                  if (siblingTextarea && this.isSafeEditable(siblingTextarea, identifiers.allowSelect)) return siblingTextarea;
                  const siblingInput = container.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
                  if (siblingInput && this.isSafeEditable(siblingInput, identifiers.allowSelect)) return siblingInput;
                }
              }
            }
          }
        }

        // 3. Name fallback
        if (identifiers.names) {
          for (const name of identifiers.names) {
            const el = doc.querySelector(`textarea[name="${name}"], input[name="${name}"]`);
            if (el && this.isSafeEditable(el, identifiers.allowSelect)) return el;
          }
        }

        return null;
      };

      // 1. TITLE
      if (isClean(fields.title)) {
        const el = findFieldElement({
          selectors: ['#target_vehicle_title', '#target_title', '#title', 'input[name="title"]', 'input[name="advert_title"]', 'input[name="target_vehicle_title"]'],
          labels: [/^title\s*\*?$/i, /^vehicle title\s*(?:\/\s*full name)?\s*\*?$/i],
          names: ['title', 'advert_title', 'target_vehicle_title']
        });
        if (el) { el.value = fields.title; triggerEvents(el); }
      }

      // 2. TITLE DESCRIPTION
      if (isClean(fields.titleDescription)) {
        const el = findFieldElement({
          selectors: ['#target_title_description', '#title_description', 'input[name="title_description"]', 'input[name="fields[title_description]"]', 'input[name*="title_description"]'],
          labels: [/^title description\s*\*?$/i],
          names: ['title_description', 'target_title_description']
        });
        if (el) { el.value = fields.titleDescription; triggerEvents(el); }
      }

      // 3. YEAR
      if (isClean(fields.year)) {
        const el = findFieldElement({
          selectors: ['#target_year', '#year', 'input[name="year"]', 'input[name="fields[year]"]', 'input[name*="year"]', 'input[name="target_year"]'],
          labels: [/^year\s*\*?$/i, /^year of manufacture\s*\*?$/i],
          names: ['year', 'target_year']
        });
        if (el) { el.value = fields.year; triggerEvents(el); }
      }

      // 4. KILOMETERS DRIVEN
      if (isClean(fields.kilometersDriven)) {
        const el = findFieldElement({
          selectors: ['#target_kilometers_driven', '#target_mileage', '#kilometers_driven', '#mileage', 'input[name="kilometers_driven"]', 'input[name="mileage"]', 'input[name*="kilometer"]', 'input[name="target_mileage"]'],
          labels: [/^kilometers driven\s*\*?$/i, /^odometer mileage\s*(?:\(km\))?\s*\*?$/i, /^mileage\s*\*?$/i],
          names: ['kilometers_driven', 'mileage', 'target_mileage']
        });
        if (el) { el.value = fields.kilometersDriven; triggerEvents(el); }
      }

      // 5. TRANSMISSION
      if (isClean(fields.transmission)) {
        const el = findFieldElement({
          selectors: ['#target_transmission_input', '#target_transmission', '#transmission', 'input[name="transmission"]', 'input[name="fields[transmission]"]', 'input[name*="transmission"]'],
          labels: [/^transmission\s*\*?$/i],
          names: ['transmission', 'target_transmission']
        });
        if (el) { el.value = fields.transmission; triggerEvents(el); }
      }

      // 6. FUEL
      if (isClean(fields.fuel)) {
        const el = findFieldElement({
          selectors: ['#target_fuel_input', '#target_fuel', '#fuel', 'input[name="fuel"]', 'input[name="fields[fuel]"]', 'input[name*="fuel"]'],
          labels: [/^fuel\s*\*?$/i, /^fuel type\s*\*?$/i],
          names: ['fuel', 'target_fuel']
        });
        if (el) { el.value = fields.fuel; triggerEvents(el); }
      }

      // 7. 4x2 / 4x4 (DRIVETRAIN)
      if (isClean(fields.drivetrain)) {
        const el = findFieldElement({
          selectors: ['#target_drivetrain', '#drivetrain', 'input[name="drivetrain"]', 'input[name="fields[drivetrain]"]', 'input[name*="drivetrain"]', 'input[name*="4x"]'],
          labels: [/^4x2\s*\/\s*4x4\s*\*?$/i, /^drivetrain\s*\*?$/i],
          names: ['drivetrain', 'target_drivetrain']
        });
        if (el) { el.value = fields.drivetrain; triggerEvents(el); }
      }

      // 8. BODY COLOUR
      if (isClean(fields.bodyColor)) {
        const el = findFieldElement({
          selectors: ['#target_body_colour', '#target_body_color', '#body_colour', '#body_color', '#colour', '#color', 'input[name="body_colour"]', 'input[name="body_color"]', 'input[name="fields[body_colour]"]', 'input[name*="colour"]', 'input[name*="color"]'],
          labels: [/^body colou?r\s*\*?$/i, /^colou?r\s*\*?$/i],
          names: ['body_colour', 'body_color', 'target_body_colour']
        });
        if (el) { el.value = fields.bodyColor; triggerEvents(el); }
      }

      // 9. CONDITION (Target SECOND Condition input ONLY; NEVER touch #condition / name="condition" / "Used Or New")
      if (isClean(fields.condition)) {
        const findSecondConditionField = () => {
          // Helper: Strict exclusion check to ensure element is NOT the first condition or other excluded controls
          const isEligibleSecondCondition = (el) => {
            if (!el) return false;
            const tag = (el.tagName || '').toUpperCase();
            if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return false;
            if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return false;
            const id = (el.id || '').toLowerCase();
            const name = (el.name || '').toLowerCase();
            if (id === 'condition' || name === 'condition') return false;
            if (/used_or_new|used-or-new|usedornew|category|currency|phone|contact|seat|rating|price|address|dealer/i.test(id + ' ' + name)) return false;
            const val = (el.value || '').trim().toLowerCase();
            if (val === 'used or new' || val === 'used / new') return false;
            return true;
          };

          // 1. Direct real custom field selectors (JomClassifieds / Joomla #fields_45, custom field names, test harness)
          const directSelectors = [
            '#fields_45',
            'input[name="fields[45]"]',
            'textarea[name="fields[45]"]',
            'select[name="fields[45]"]',
            '#target_condition_input',
            'input[name="target_condition_input"]',
            '#target_condition_text',
            'input[name="target_condition_text"]',
            'input[name="fields[condition]"]',
            'textarea[name="fields[condition]"]'
          ];
          for (const sel of directSelectors) {
            try {
              const el = doc.querySelector(sel);
              if (isEligibleSecondCondition(el)) return el;
            } catch (e) {}
          }

          // 2. Semantic label and control-group lookup (find all labels with "Condition", excluding Air Conditioning)
          const allLabels = doc.querySelectorAll('label, .control-label, .form-label, span.hasPopover, div.control-label');
          const candidateElements = [];

          for (const lbl of allLabels) {
            const lText = ((lbl.textContent || '') + ' ' + (lbl.getAttribute('title') || '') + ' ' + (lbl.getAttribute('data-content') || '')).replace(/\s+/g, ' ').trim();
            if (/\bcondition\b/i.test(lText) && !/air[\s-]*condition/i.test(lText)) {
              const forId = lbl.getAttribute('for');
              if (forId && forId !== 'condition' && !forId.toLowerCase().includes('used')) {
                const el = (doc.getElementById ? doc.getElementById(forId) : (doc.ownerDocument || document).getElementById(forId)) || (doc.querySelector ? doc.querySelector('#' + CSS.escape(forId)) : null);
                if (isEligibleSecondCondition(el) && !candidateElements.includes(el)) {
                  candidateElements.push(el);
                }
              }
              const inside = lbl.querySelector('input, textarea, select');
              if (isEligibleSecondCondition(inside) && !candidateElements.includes(inside)) {
                candidateElements.push(inside);
              }
              const container = lbl.closest('.control-group, .form-group, .demo-form-group, tr, td, .form-item, fieldset, div') || lbl.parentElement;
              if (container) {
                const inputs = container.querySelectorAll('input, textarea, select');
                for (const inp of inputs) {
                  if (isEligibleSecondCondition(inp) && !candidateElements.includes(inp)) {
                    candidateElements.push(inp);
                  }
                }
              }
            }
          }

          if (candidateElements.length > 0) {
            // Return the first eligible non-first condition element
            return candidateElements[0];
          }

          return null;
        };

        const el = findSecondConditionField();
        if (el) {
          const currentVal = (el.value || '').trim().toLowerCase();
          const currentId = (el.id || '').toLowerCase();
          const currentName = (el.name || '').toLowerCase();
          if (currentVal !== 'used or new' && currentId !== 'condition' && currentName !== 'condition') {
            if (el.tagName === 'SELECT') {
              let matched = false;
              for (const opt of el.options) {
                if (opt.text.toLowerCase().includes(fields.condition.toLowerCase()) || opt.value.toLowerCase().includes(fields.condition.toLowerCase())) {
                  el.value = opt.value;
                  matched = true;
                  break;
                }
              }
              if (!matched && el.options.length > 0) el.selectedIndex = 1;
            } else {
              el.value = fields.condition;
              try {
                const proto = Object.getPrototypeOf(el);
                const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                if (desc && desc.set) desc.set.call(el, fields.condition);
              } catch (e) {}
            }
            triggerEvents(el);
            try {
              const $ = (typeof unsafeWindow !== 'undefined' && unsafeWindow.$) || (typeof window !== 'undefined' && window.$);
              if ($ && typeof $(el).trigger === 'function') {
                $(el).trigger('input').trigger('change');
              }
            } catch (e) {}
          }
        }
      }

      // 10. PRICING SUMMARY
      if (isClean(fields.pricingSummary)) {
        const el = findFieldElement({
          selectors: ['#target_pricing_summary', '#pricing_summary', '#price_summary', 'input[name*="pricing_summary"]', 'input[name*="price_summary"]'],
          labels: [/^pricing summary\s*\*?$/i, /\bpricing\s+summary\b/i],
          names: ['pricing_summary', 'target_pricing_summary']
        });
        if (el) { el.value = fields.pricingSummary; triggerEvents(el); }
      }

      // 11. DEALER NAME
      if (isClean(fields.dealerName)) {
        const el = findFieldElement({
          selectors: ['#target_dealer_name', '#dealer_name', 'input[name*="dealer_name"]'],
          labels: [/^dealer(?:ship)? name\s*\*?$/i, /\bdealer(?:ship)?\s+name\b/i],
          names: ['dealer_name', 'target_dealer_name']
        });
        if (el) { el.value = fields.dealerName; triggerEvents(el); }
      }

      // 12. DEALER ADDRESS (Target Dealer Address field)
      if (isClean(fields.dealerAddress)) {
        const el = findFieldElement({
          selectors: ['#target_dealer_address', '#dealer_address', 'input[name="dealer_address"]', 'input[name*="dealer_address"]'],
          labels: [/^dealer(?:ship)? address\s*\*?$/i, /\bdealer(?:ship)?\s+address\b/i],
          names: ['dealer_address', 'target_dealer_address']
        });
        if (el) { el.value = fields.dealerAddress; triggerEvents(el); }
      }

      // 12B. CONTACT DETAILS ADDRESS (Overwrites existing default address with dealerAddress)
      if (isClean(fields.dealerAddress)) {
        const findContactAddressField = () => {
          // 1. Direct selectors
          const directSelectors = [
            '#target_contact_address',
            'input[name="target_contact_address"]',
            'textarea[name="target_contact_address"]',
            '#contact_address',
            'input[name="contact_address"]',
            'textarea[name="contact_address"]',
            '#contact-address',
            'textarea[name="address"]',
            'input[name="address"]',
            '#address'
          ];
          for (const sel of directSelectors) {
            try {
              const el = doc.querySelector(sel);
              if (el && el.id !== 'target_dealer_address' && el.id !== 'dealer_address' && el.name !== 'dealer_address' && (!el.name || !el.name.includes('dealer_address'))) {
                return el;
              }
            } catch (e) {}
          }

          // 2. Look inside Contact Details section container
          const contactSectionHeaders = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, legend, strong, b, .section-title, .panel-title, .control-group')).filter(el => {
            return /contact\s*(?:details|info|information)?/i.test((el.textContent || '').trim());
          });
          for (const header of contactSectionHeaders) {
            const container = header.closest('.form-section, .panel, .control-group, .form-group, fieldset, div') || header.parentElement;
            if (container) {
              const addrEl = container.querySelector('textarea, input[name*="address"], input[id*="address"]');
              if (addrEl && addrEl.id !== 'target_dealer_address' && addrEl.id !== 'dealer_address' && addrEl.name !== 'dealer_address') {
                return addrEl;
              }
            }
          }

          // 3. Look for Address label in Contact section or general Address label (distinct from Dealer Address)
          const allLabels = doc.querySelectorAll('label, .control-label, .form-label');
          for (const lbl of allLabels) {
            const lText = lbl.textContent.replace(/\s+/g, ' ').trim();
            if (/\b(?:contact\s+)?address\b/i.test(lText) && !/dealer/i.test(lText)) {
              const forId = lbl.getAttribute('for');
              let inputEl = null;
              if (forId && forId !== 'target_dealer_address' && forId !== 'dealer_address') {
                inputEl = (doc.getElementById ? doc.getElementById(forId) : (doc.ownerDocument || document).getElementById(forId)) || (doc.querySelector ? doc.querySelector('#' + CSS.escape(forId)) : null);
              }
              if (!inputEl) {
                const container = lbl.closest('.control-group, .form-group, .demo-form-group, tr, td, .form-item') || lbl.parentElement;
                if (container) {
                  inputEl = container.querySelector('textarea, input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
                }
              }
              if (inputEl && inputEl.id !== 'target_dealer_address' && inputEl.id !== 'dealer_address' && inputEl.name !== 'dealer_address') {
                return inputEl;
              }
            }
          }

          return null;
        };

        const contactAddrEl = findContactAddressField();
        if (contactAddrEl && (contactAddrEl.tagName === 'INPUT' || contactAddrEl.tagName === 'TEXTAREA')) {
          contactAddrEl.value = fields.dealerAddress;
          triggerEvents(contactAddrEl);
        }
      }

      // 12C. CONTACT NUMBER (Target Contact Number input)
      if (isClean(fields.contactNumber)) {
        const findContactNumberField = () => {
          // 1. Direct selectors
          const directSelectors = [
            '#target_contact_number',
            'input[name="target_contact_number"]',
            '#contact_number',
            'input[name="contact_number"]',
            '#contact-number',
            'input[name="contact-number"]',
            '#phone',
            'input[name="phone"]',
            '#telephone',
            'input[name="telephone"]',
            '#target_phone',
            'input[name="target_phone"]',
            'input[name*="contact_number"]',
            'input[name*="contact_phone"]',
            'input[name*="phone_number"]'
          ];
          for (const sel of directSelectors) {
            try {
              const el = doc.querySelector(sel);
              if (el && el.type !== 'hidden' && el.type !== 'button' && el.type !== 'submit') {
                return el;
              }
            } catch (e) {}
          }

          // 2. Look for Contact Number / Phone label
          const allLabels = doc.querySelectorAll('label, .control-label, .form-label');
          for (const lbl of allLabels) {
            const lText = lbl.textContent.replace(/\s+/g, ' ').trim();
            if (/^(?:contact\s+(?:phone\s+)?number|phone\s*(?:number)?|telephone|cell\s*(?:number)?|mobile\s*(?:number)?)\s*\*?$/i.test(lText)) {
              const forId = lbl.getAttribute('for');
              let inputEl = null;
              if (forId) {
                inputEl = (doc.getElementById ? doc.getElementById(forId) : (doc.ownerDocument || document).getElementById(forId)) || (doc.querySelector ? doc.querySelector('#' + CSS.escape(forId)) : null);
              }
              if (!inputEl) {
                const container = lbl.closest('.control-group, .form-group, .demo-form-group, tr, td, .form-item') || lbl.parentElement;
                if (container) {
                  inputEl = container.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
                }
              }
              if (inputEl) {
                return inputEl;
              }
            }
          }
          return null;
        };

        const contactNumEl = findContactNumberField();
        if (contactNumEl && contactNumEl.tagName === 'INPUT') {
          contactNumEl.value = fields.contactNumber;
          triggerEvents(contactNumEl);
        }
      }

      // 13. DEALER AVERAGE RATING
      if (isClean(fields.averageRating)) {
        const el = findFieldElement({
          selectors: ['#target_dealer_rating', '#dealer_rating', '#average_rating', 'input[name*="dealer_rating"]', 'input[name*="average_rating"]'],
          labels: [/^dealer (?:average )?rating\s*(?:\(1-5\))?\s*\*?$/i, /^average rating\s*\*?$/i, /\bdealer\s+(?:average\s+)?rating\b/i],
          names: ['dealer_rating', 'average_rating', 'target_dealer_rating']
        });
        if (el) { el.value = fields.averageRating; triggerEvents(el); }
      }

      // 14. FEATURES (Textarea / Input - exact preservation of internal word spacing and newlines)
      if (isClean(fields.features)) {
        const findFeaturesElement = () => {
          // Helper to check safety and prevent targeting excluded fields
          const isSafeFeaturesEl = (el) => {
            if (!el || !this.isSafeEditable(el, false)) return false;
            const id = (el.id || '').toLowerCase();
            const name = (el.name || '').toLowerCase();
            if (id === 'condition' || name === 'condition' || id === 'fields_45' || name === 'fields[45]') return false;
            if (/highlight|address|dealer|contact|phone|number|price|source_url|description/i.test(id + ' ' + name)) return false;
            return true;
          };

          // 1. Direct known IDs and names
          const directSelectors = [
            'textarea#target_features_text',
            'textarea#target_features',
            'textarea#features',
            '#target_features_text',
            '#target_features',
            '#features',
            'textarea[name="target_features_text"]',
            'textarea[name="target_features"]',
            'textarea[name="features"]',
            'textarea[name="fields[features]"]',
            'textarea[name="fields[Features]"]',
            'input#target_features_text',
            'input#target_features',
            'input[name="target_features_text"]',
            'input[name="target_features"]'
          ];
          for (const sel of directSelectors) {
            try {
              const el = doc.querySelector(sel);
              if (isSafeFeaturesEl(el)) return el;
            } catch (e) {}
          }

          // 2. Direct attribute inspection (placeholder, title, data-placeholder) without relying on CSS flags
          const candidateElements = doc.querySelectorAll('textarea, input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"])');
          for (const cand of candidateElements) {
            if (!isSafeFeaturesEl(cand)) continue;
            const ph = (cand.getAttribute('placeholder') || '') + ' ' + (cand.getAttribute('title') || '') + ' ' + (cand.getAttribute('data-placeholder') || '') + ' ' + (cand.getAttribute('aria-label') || '');
            if (/minimum\s*3\s*features|\bfeatures\b/i.test(ph)) {
              return cand;
            }
          }

          // 3. Semantic label lookup specifically searching for element associated with "Features"
          const allLabels = doc.querySelectorAll('label, .control-label, .form-label, span.hasPopover, div.control-label');
          for (const lbl of allLabels) {
            const lText = ((lbl.textContent || '') + ' ' + (lbl.getAttribute('title') || '') + ' ' + (lbl.getAttribute('data-content') || '') + ' ' + (lbl.getAttribute('data-original-title') || '')).replace(/\s+/g, ' ').trim();
            if (/\bfeatures\b/i.test(lText) || /minimum\s*3\s*features/i.test(lText)) {
              const forId = lbl.getAttribute('for');
              if (forId) {
                const el = (doc.getElementById ? doc.getElementById(forId) : (doc.ownerDocument || document).getElementById(forId)) || (doc.querySelector ? doc.querySelector('#' + CSS.escape(forId)) : null);
                if (isSafeFeaturesEl(el)) return el;
              }
              // Check inside label
              const inside = lbl.querySelector('textarea, input');
              if (isSafeFeaturesEl(inside)) return inside;

              // Check container / sibling hierarchy (.control-group, .form-group, etc.)
              const container = lbl.closest('.control-group, .form-group, .demo-form-group, tr, td, .form-item, fieldset, div') || lbl.parentElement;
              if (container) {
                const siblingTextarea = container.querySelector('textarea');
                if (isSafeFeaturesEl(siblingTextarea)) return siblingTextarea;
                const siblingInput = container.querySelector('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"])');
                if (isSafeFeaturesEl(siblingInput)) return siblingInput;
                const contentEditable = container.querySelector('[contenteditable="true"]');
                if (contentEditable) return contentEditable;
              }
            }
          }
          return null;
        };

        const el = findFeaturesElement();
        if (el) {
          const rawFeaturesText = Normalizers.normalizeFeatures(fields.features);
          if (el.isContentEditable) {
            el.innerText = rawFeaturesText;
            triggerEvents(el);
          } else {
            el.value = rawFeaturesText;
            try {
              const proto = Object.getPrototypeOf(el);
              const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
              if (descriptor && descriptor.set) {
                descriptor.set.call(el, rawFeaturesText);
              }
            } catch (e) {}
            triggerEvents(el);
            try {
              const $ = (typeof unsafeWindow !== 'undefined' && unsafeWindow.$) || (typeof window !== 'undefined' && window.$);
              if ($ && typeof $(el).trigger === 'function') {
                $(el).trigger('input').trigger('change');
              }
            } catch (e) {}
          }
        }
      }

      // 15. SOURCE LINK
      if (isClean(fields.sourceUrl)) {
        const el = findFieldElement({
          selectors: ['#target_source_url', '#target_source_link', '#source_url', '#source_link', 'input[name*="source_link"]', 'input[name*="source_url"]'],
          labels: [/^source link\s*\*?$/i, /^source listing link\s*\*?$/i, /\bsource\s+(?:listing\s+)?link\b/i, /\bsource\s+url\b/i],
          names: ['source_link', 'source_url', 'target_source_url']
        });
        if (el) { el.value = fields.sourceUrl; triggerEvents(el); }
      }

      // 16. VEHICLE HIGHLIGHTS (Textarea - receives ONLY Vehicle Highlights data)
      if (isClean(fields.vehicleHighlights)) {
        const findVehicleHighlightsElement = () => {
          // Direct textarea selectors
          const directSelectors = [
            'textarea#target_vehicle_highlights',
            'textarea#vehicle_highlights',
            'textarea[name="target_vehicle_highlights"]',
            'textarea[name="vehicle_highlights"]'
          ];
          for (const sel of directSelectors) {
            try {
              const el = doc.querySelector(sel);
              if (el && this.isSafeEditable(el, false)) return el;
            } catch (e) {}
          }

          // Semantic label lookup specifically searching for textarea associated with "Vehicle Highlights"
          const allLabels = doc.querySelectorAll('label, .control-label, .form-label');
          for (const lbl of allLabels) {
            const lText = lbl.textContent.replace(/\s+/g, ' ').trim();
            if (/\b(?:vehicle\s+|key\s+|car\s+)?highlights\b/i.test(lText)) {
              const forId = lbl.getAttribute('for');
              if (forId) {
                const el = (doc.getElementById ? doc.getElementById(forId) : (doc.ownerDocument || document).getElementById(forId)) || (doc.querySelector ? doc.querySelector('#' + CSS.escape(forId)) : null);
                if (el && this.isSafeEditable(el, false)) return el;
              }
              const container = lbl.closest('.control-group, .form-group, .demo-form-group, tr, td, .form-item') || lbl.parentElement;
              if (container) {
                const siblingTextarea = container.querySelector('textarea');
                if (siblingTextarea && this.isSafeEditable(siblingTextarea, false)) return siblingTextarea;
              }
            }
          }
          return null;
        };

        const el = findVehicleHighlightsElement();
        if (el) {
          el.value = fields.vehicleHighlights;
          triggerEvents(el);
        }
      }

      // 17. PRICE (Numeric digits only)
      if (isClean(fields.price)) {
        const digitsOnly = String(fields.price).replace(/[^\d]/g, '');
        const el = findFieldElement({
          selectors: ['#target_price', '#price', 'input[name="price"]', 'input[name*="listing_price"]'],
          labels: [/^price\s*\*?$/i, /^listing price\s*(?:\(zar\))?\s*\*?$/i, /\b(?:listing\s+)?price\b/i],
          names: ['price', 'target_price']
        });
        if (el && digitsOnly) { el.value = digitsOnly; triggerEvents(el); }
      }

      // 18. DESCRIPTION (Rich text editor / TinyMCE / exact description textarea only)
      if (isClean(fields.description)) {
        this.fillDescription(doc, fields.description);
      }
    },

    isSafeEditable(el, allowSelect) {
      if (!el) return false;
      const tag = el.tagName ? el.tagName.toUpperCase() : '';
      if (tag === 'SELECT' && !allowSelect) return false;
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return false;

      // Check excluded IDs / names
      const idOrName = `${el.id || ''} ${el.name || ''}`.toLowerCase();
      if (el.id === 'condition' || el.name === 'condition') {
        // Exclude the top #condition / name="condition" field
        return false;
      }
      const excludedKeywords = [
        'category', 'used_or_new', 'used_cars', 'seat', 'contact_number', 'phone',
        'currency', 'tag', 'country'
      ];
      if (excludedKeywords.some(kw => idOrName.includes(kw))) {
        return false;
      }

      return true;
    },

    isSafeConditionField(el) {
      if (!el || !this.isSafeEditable(el, false)) return false;
      if (el.tagName === 'SELECT') return false;
      if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'hidden') return false;

      // Ensure it is not the first "Used Or New" control
      const idOrName = `${el.id || ''} ${el.name || ''}`.toLowerCase();
      if (/used_or_new|used-or-new|usedornew|used_new|new_or_used/i.test(idOrName)) return false;

      const container = el.closest('.form-group, .control-group, .demo-form-group, tr, td, div') || el.parentElement;
      const text = `${container ? container.textContent : ''} ${el.placeholder || ''} ${el.value || ''}`.toLowerCase();
      if (/used\s*(?:or|\/)\s*new/i.test(text)) return false;

      return true;
    },

    fillDescription(doc, text) {
      if (!text) return;
      const cleanDesc = Normalizers.normalizeDescription(text);
      const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const paragraphs = cleanDesc.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
      const htmlContent = paragraphs.map(p => {
        const lines = p.split('\n').map(l => escapeHtml(l.trim())).filter(Boolean);
        return `<p>${lines.join('<br>')}</p>`;
      }).join('');

      // 1. Check TinyMCE instances
      try {
        if (typeof window.tinymce !== 'undefined' && window.tinymce.get) {
          const editor = window.tinymce.get('description') ||
                         window.tinymce.get('target_description') ||
                         window.tinymce.activeEditor;
          if (editor && !editor.isHidden()) {
            editor.setContent(htmlContent);
            editor.save();
            return;
          }
        }
      } catch (e) {}

      // 2. Check Joomla editor instance
      try {
        if (typeof window.Joomla !== 'undefined' && window.Joomla.editors?.instances?.description) {
          window.Joomla.editors.instances.description.setValue(htmlContent);
          return;
        }
      } catch (e) {}

      // 3. Check TinyMCE / Rich Text iframe
      try {
        const iframe = doc.querySelector('#description_ifr, iframe[id*="description"], .tox-edit-area iframe, .mce-edit-area iframe');
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
          iframe.contentDocument.body.innerHTML = htmlContent;
          iframe.contentDocument.body.dispatchEvent(new Event('input', { bubbles: true }));
          iframe.contentDocument.body.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (e) {}

      // 4. Contenteditable element
      try {
        const contentEditable = doc.querySelector('#target_description[contenteditable="true"], #description[contenteditable="true"], [name="description"][contenteditable="true"], .description-editor[contenteditable="true"], div.note-editable');
        if (contentEditable) {
          contentEditable.innerHTML = htmlContent;
          contentEditable.dispatchEvent(new Event('input', { bubbles: true }));
          contentEditable.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (e) {}

      // 5. Target Textarea / Input (Specifically exclude custom fields like fields[46], fields[47], etc.)
      const textarea = doc.querySelector('#target_description, #description, textarea[name="description"]');
      if (textarea && !textarea.name?.startsWith('fields[') && !textarea.id?.startsWith('fields_')) {
        textarea.value = cleanDesc;
        try {
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          textarea.dispatchEvent(new Event('blur', { bubbles: true }));
        } catch (e) {}
      }
    }
  };

  // --- 6. DICE AUTOMATOR ENGINE ---
  const DiceAutomator = (function () {
    const Utils = {
      sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },
      cleanText(str) { return (!str || typeof str !== 'string') ? '' : str.replace(/\s+/g, ' ').trim(); },
      triggerEvents(el) {
        if (!el) return;
        try {
          el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
          el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }));
        } catch (e) {}
        try {
          if (typeof el.onchange === 'function') el.onchange.call(el);
        } catch (e) {}
        try {
          const win = el.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
          const unsafe = typeof unsafeWindow !== 'undefined' ? unsafeWindow : null;
          if (typeof win?.getsubcat === 'function') {
            win.getsubcat(el.value);
          } else if (typeof unsafe?.getsubcat === 'function') {
            unsafe.getsubcat(el.value);
          }
        } catch (e) {}
        try {
          const win = el.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
          const $ = win?.$ || win?.jQuery || (typeof unsafeWindow !== 'undefined' ? (unsafeWindow.$ || unsafeWindow.jQuery) : null);
          if ($ && typeof $(el).trigger === 'function') {
            $(el).trigger('input').trigger('change').trigger('chosen:updated').trigger('select2:select');
          }
        } catch (e) {}
      },
      triggerCategoryEvents(el, level = 0, doc = document, optionValue = null) {
        if (!el) return;
        const actualVal = optionValue !== null && optionValue !== undefined ? optionValue : el.value;

        try {
          el.dispatchEvent(new Event('focus', { bubbles: true, cancelable: true, composed: true }));
          el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
          el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }));
        } catch (e) {}
        try {
          if (typeof el.onchange === 'function') el.onchange.call(el);
        } catch (e) {}

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
              try { win.getsubcat(actualVal, level); } catch (e) {}
              try { win.getsubcat(actualVal); } catch (e) {}
            }
            if (typeof win.get_sub_cat === 'function') {
              try { win.get_sub_cat(actualVal, level); } catch (e) {}
            }
            if (typeof win.getSubCategories === 'function') {
              try { win.getSubCategories(actualVal, level); } catch (e) {}
            }
            if (typeof win.getCategoryFields === 'function') {
              try { win.getCategoryFields(actualVal); } catch (e) {}
            }
          } catch (e) {}
          try {
            const $ = win.$ || win.jQuery;
            if ($ && typeof $(el).trigger === 'function') {
              $(el).trigger('chosen:updated').trigger('liszt:updated').trigger('input').trigger('change').trigger('select2:select');
            }
          } catch (e) {}
          try {
            if (win.document && typeof win.document.id === 'function') {
              const mEl = win.document.id(el);
              if (mEl && typeof mEl.fireEvent === 'function') mEl.fireEvent('change');
            }
          } catch (e) {}
        }

        try {
          const targetDoc = el.ownerDocument || doc || document;
          const root = targetDoc.head || targetDoc.documentElement || targetDoc.body;
          if (root) {
            const scriptEl = targetDoc.createElement('script');
            const elId = el.id ? JSON.stringify(el.id) : 'null';
            const elName = el.name ? JSON.stringify(el.name) : 'null';
            const valStr = JSON.stringify(actualVal);
            const lvlNum = typeof level === 'number' ? level : 0;
            scriptEl.textContent = `(function() {
              try {
                var target = null;
                if (${elId}) target = document.getElementById(${elId});
                if (!target && ${elName}) {
                  var formScope = document.querySelector('form#adminForm, form.form-validate, form[name="adminForm"], #adminForm, #jomcl_item_form, #legacy-vehicle-form, #dice-vehicle-form') || document;
                  target = formScope.querySelector('select[name=' + ${elName} + ']');
                }
                if (!target) {
                  var formScope = document.querySelector('form#adminForm, form.form-validate, form[name="adminForm"], #adminForm, #jomcl_item_form, #legacy-vehicle-form, #dice-vehicle-form') || document;
                  var allCats = formScope.querySelectorAll('select[name="parent_id[]"], select[name="category"], select[name="sub_category"], select[name="third_category"], .jomcl-category');
                  if (allCats && allCats[${lvlNum}]) target = allCats[${lvlNum}];
                }
                if (target) {
                  target.value = ${valStr};
                  if (typeof target.onchange === 'function') {
                    try { target.onchange.call(target); } catch(e) {}
                  }
                  var ev = new Event('change', { bubbles: true, cancelable: true });
                  target.dispatchEvent(ev);
                  if (typeof window.jQuery === 'function') {
                    try {
                      window.jQuery(target).trigger('chosen:updated').trigger('liszt:updated').trigger('change');
                    } catch(e) {}
                  }
                }
                if (typeof window.getsubcat === 'function') {
                  try { window.getsubcat(${valStr}, ${lvlNum}); } catch(e) {}
                  try { window.getsubcat(${valStr}); } catch(e) {}
                }
                if (typeof window.get_sub_cat === 'function') {
                  try { window.get_sub_cat(${valStr}, ${lvlNum}); } catch(e) {}
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

    const DropdownManager = {
      isValidSelectElement(el) {
        if (!el) return false;
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'SELECT') return true;
        if (el.classList && (el.classList.contains('chosen-container') || el.classList.contains('select2-container'))) return true;
        if (el.getAttribute && (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox')) return true;
        return false;
      },

      getListingForm(doc) {
        if (!doc) doc = document;
        return doc.querySelector('form#adminForm, form.form-validate, form[name="adminForm"], #adminForm, #jomcl_item_form, #legacy-vehicle-form, #dice-vehicle-form') || doc;
      },

      getCategorySelect(doc, level = 0) {
        if (!doc) doc = document;
        const form = this.getListingForm(doc);

        if (level === 0) {
          return form.querySelector('#parent_id_0') ||
                 form.querySelector('#category') ||
                 form.querySelector('#target_category') ||
                 form.querySelector('#category_div select') ||
                 form.querySelector('select#catid') ||
                 form.querySelector('select[name="catid"]') ||
                 form.querySelector('select[name="category"]') ||
                 form.querySelector('#jform_category') ||
                 form.querySelectorAll('select[name="parent_id[]"]')[0] ||
                 form.querySelectorAll('.jomcl-category')[0] ||
                 null;
        } else if (level === 1) {
          return form.querySelector('#parent_id_1') ||
                 form.querySelector('#sub_category') ||
                 form.querySelector('#target_sub_category') ||
                 form.querySelector('#target_cars_parts') ||
                 form.querySelector('#sub_category_div select') ||
                 form.querySelector('#cat_id_2') ||
                 form.querySelector('select[name="sub_category"]') ||
                 form.querySelectorAll('select[name="parent_id[]"]')[1] ||
                 form.querySelectorAll('.jomcl-category')[1] ||
                 null;
        } else if (level === 2) {
          return form.querySelector('#parent_id_2') ||
                 form.querySelector('#sub_sub_category') ||
                 form.querySelector('#target_used_cars_sa') ||
                 form.querySelector('#third_category') ||
                 form.querySelector('#sub_sub_category_div select') ||
                 form.querySelector('#cat_id_3') ||
                 form.querySelector('select[name="third_category"]') ||
                 form.querySelectorAll('select[name="parent_id[]"]')[2] ||
                 form.querySelectorAll('.jomcl-category')[2] ||
                 null;
        }
        return null;
      },

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
        if (control.classList && (control.classList.contains('chosen-container') || control.classList.contains('select2-container'))) {
          const nativeSelect = control.parentElement?.querySelector('select') || control.previousElementSibling;
          if (nativeSelect && nativeSelect.tagName === 'SELECT') return this.getOptions(nativeSelect);
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

      matchOption(options, targetMatcher) {
        if (!options || options.length === 0) return null;
        if (typeof targetMatcher === 'function') return options.find(targetMatcher) || null;
        if (targetMatcher instanceof RegExp) {
          return options.find(o => targetMatcher.test(o.text) || targetMatcher.test(o.value)) || null;
        }
        const search = Utils.cleanText(String(targetMatcher)).toLowerCase();
        let matched = options.find(o => o.text.toLowerCase() === search);
        if (!matched) matched = options.find(o => o.value.toLowerCase() === search);
        if (!matched) matched = options.find(o => {
          const t = o.text.toLowerCase();
          return t.startsWith(search) || t.endsWith(search) || t.includes(` ${search} `);
        });
        if (!matched) matched = options.find(o => o.text.toLowerCase().includes(search));
        if (!matched) matched = options.find(o => o.value.toLowerCase().includes(search));
        return matched || null;
      },

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
          return null;
        }
        return this.findDropdownWithOption(doc, targetMatcher, fallbackCriteria);
      },

      async waitForLevelOption(doc, level, targetMatcher, fallbackCriteria = {}, maxWaitMs = 8000, pollIntervalMs = 150) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
          const match = this.findDropdownForLevel(doc, level, targetMatcher, fallbackCriteria);
          if (match && match.control && match.option) return match;
          await Utils.sleep(pollIntervalMs);
        }
        return null;
      },

      findDropdownWithOption(doc, targetMatcher, criteria = {}) {
        if (!doc) doc = document;
        const form = this.getListingForm(doc);

        const candidates = [];
        if (criteria.selectors) {
          for (const sel of criteria.selectors) {
            try {
              const els = form.querySelectorAll(sel);
              els.forEach(el => {
                if (this.isValidSelectElement(el) && !candidates.includes(el)) candidates.push(el);
              });
            } catch (e) {}
          }
        }
        if (criteria.labels) {
          const allLabels = form.querySelectorAll('label, .control-label, .form-label, span.hasPopover, div.control-label, th');
          for (const lbl of allLabels) {
            const lText = Utils.cleanText((lbl.textContent || '') + ' ' + (lbl.getAttribute('title') || ''));
            for (const targetLabel of criteria.labels) {
              const matches = typeof targetLabel === 'string'
                ? lText.toLowerCase().includes(targetLabel.toLowerCase())
                : targetLabel.test(lText);
              if (matches) {
                const forId = lbl.getAttribute('for');
                if (forId) {
                  const el = form.querySelector('#' + CSS.escape(forId)) || (doc.getElementById ? doc.getElementById(forId) : null);
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
        if (criteria.names) {
          for (const name of criteria.names) {
            try {
              const els = form.querySelectorAll(`select[name="${name}"], select[id="${name}"], select[name*="${name}"], select[id*="${name}"]`);
              els.forEach(el => {
                if (this.isValidSelectElement(el) && !candidates.includes(el)) candidates.push(el);
              });
            } catch (e) {}
          }
        }
        const formSelects = form.querySelectorAll('select, [role="combobox"], .chosen-container, .select2-container');
        formSelects.forEach(el => {
          if (!candidates.includes(el)) candidates.push(el);
        });

        for (const ctrl of candidates) {
          const opts = this.getOptions(ctrl);
          const matched = this.matchOption(opts, targetMatcher);
          if (matched) {
            return { control: ctrl, option: matched, allOptions: opts };
          }
        }
        return null;
      },

      async waitForDropdownWithOption(doc, targetMatcher, criteria = {}, maxWaitMs = 8000, pollIntervalMs = 150) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
          const match = this.findDropdownWithOption(doc, targetMatcher, criteria);
          if (match && match.control && match.option) return match;
          await Utils.sleep(pollIntervalMs);
        }
        return null;
      },

      selectAndVerify(control, targetValueOrText, level = null, doc = null) {
        if (!control) return { success: false, error: 'No dropdown control provided' };

        if (control.classList && (control.classList.contains('chosen-container') || control.classList.contains('select2-container'))) {
          const nativeSelect = control.parentElement?.querySelector('select') || control.previousElementSibling;
          if (nativeSelect && nativeSelect.tagName === 'SELECT') {
            return this.selectAndVerify(nativeSelect, targetValueOrText, level, doc);
          }
        }

        const options = this.getOptions(control);
        if (options.length === 0) return { success: false, error: 'Dropdown has no options' };

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
            Utils.triggerCategoryEvents(control, level, doc || control.ownerDocument || document, matched.value);
          } else {
            Utils.triggerEvents(control);
          }

          const chosenSpan = control.parentElement?.querySelector('.chosen-container .chosen-single span, .chosen-container a span') ||
                             (control.id ? (control.ownerDocument || doc || document).querySelector(`#${control.id}_chzn .chosen-single span`) : null);
          if (chosenSpan) {
            chosenSpan.textContent = matched.text;
          }

          const actualIndex = control.selectedIndex;
          const actualOption = control.options[actualIndex];
          const actualText = actualOption ? Utils.cleanText(actualOption.text) : '';
          const actualValue = control.value;

          const isVerified = (actualValue === matched.value) &&
                             (actualText.toLowerCase() === matched.text.toLowerCase() || actualText.toLowerCase().includes(matched.text.toLowerCase()));

          if (!isVerified) {
            return {
              success: false,
              error: `Selection verification failed. Expected text "${matched.text}" with value "${matched.value}", actual selected: text "${actualText}", value "${actualValue}"`,
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

        return { success: false, error: 'Unsupported control type' };
      },

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

    const DescriptionManager = {
      findDescriptionControls(doc) {
        if (!doc) doc = document;
        const toggleButtons = Array.from(doc.querySelectorAll('button, a, .btn, [role="button"], input[type="button"]')).filter(el => {
          const text = Utils.cleanText(el.textContent || el.value || '');
          const onclick = (el.getAttribute('onclick') || '').toLowerCase();
          const title = (el.getAttribute('title') || '').toLowerCase();
          const idOrClass = `${el.id || ''} ${el.className || ''}`.toLowerCase();
          return /toggle\s*editor/i.test(text) || /toggle\s*editor/i.test(title) || /toggleeditor/i.test(onclick) || /toggle-editor|editor-toggle/i.test(idOrClass);
        });
        const textarea = doc.querySelector('#target_description, #description, textarea[name="description"], textarea[name*="description"]');
        const iframe = doc.querySelector('#description_ifr, iframe[id*="description"], .tox-edit-area iframe, .mce-edit-area iframe');
        const contentEditable = doc.querySelector('#target_description[contenteditable="true"], #description[contenteditable="true"], [name="description"][contenteditable="true"], div.note-editable, .tox-edit-area [contenteditable="true"]');
        return { toggleEditorBtn: toggleButtons[0] || null, textarea, iframe, contentEditable };
      },

      async ensureAndFillDescription(doc, rawDescription, log) {
        if (!rawDescription) return { success: false, error: 'No description text provided' };
        const htmlContent = formatDescriptionHtml(rawDescription);
        const cleanPlainText = rawDescription.replace(/<[^>]+>/g, '').trim();

        log?.('Checking Description editor state...');
        let controls = this.findDescriptionControls(doc);

        if (controls.toggleEditorBtn) {
          log?.(`Found Toggle Editor control: "${Utils.cleanText(controls.toggleEditorBtn.textContent || 'Toggle Editor')}"`);
          const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
          const hasTinyMce = !!(win?.tinymce?.get('description') || win?.tinymce?.activeEditor);
          const hasIframeBody = !!(controls.iframe && controls.iframe.contentDocument?.body);

          if (!hasTinyMce && !hasIframeBody && !controls.contentEditable) {
            log?.('Activating Toggle Editor...');
            try { controls.toggleEditorBtn.click(); } catch (e) {
              controls.toggleEditorBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
            await Utils.waitFor(() => {
              const re = this.findDescriptionControls(doc);
              const w = doc.defaultView || window;
              return (re.iframe && re.iframe.contentDocument?.body) || (w?.tinymce?.get('description')) || re.contentEditable;
            }, 3000, 150);
          }
        }

        let insertedIntoRichText = false;
        let insertedContent = '';

        try {
          const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
          if (win?.tinymce && typeof win.tinymce.get === 'function') {
            const editor = win.tinymce.get('description') || win.tinymce.get('target_description') || win.tinymce.activeEditor;
            if (editor) {
              editor.setContent(htmlContent);
              editor.save();
              insertedIntoRichText = true;
              insertedContent = editor.getContent();
              log?.('Inserted formatted HTML via TinyMCE editor instance API.');
            }
          }
        } catch (e) {}

        try {
          const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
          if (win?.Joomla?.editors?.instances?.description) {
            win.Joomla.editors.instances.description.setValue(htmlContent);
            insertedIntoRichText = true;
            log?.('Inserted formatted HTML via Joomla.editors instance.');
          }
        } catch (e) {}

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

        controls = this.findDescriptionControls(doc);
        const textarea = controls.textarea;
        if (textarea) {
          textarea.value = cleanPlainText;
          Utils.triggerEvents(textarea);
          log?.('Updated description textarea with clean paragraphs.');
        }

        let isVerified = false;
        if (insertedIntoRichText && insertedContent && insertedContent.length > 10) {
          isVerified = true;
        } else if (textarea && textarea.value && textarea.value.length > 10) {
          isVerified = true;
        }

        return isVerified ? { success: true, isRichText: insertedIntoRichText } : { success: false, error: 'Description insertion verification failed' };
      }
    };

    return {
      version: '2.4.0-DICE2',
      async runDryRun(targetDoc, extractedFields = {}, options = {}) {
        if (!targetDoc) targetDoc = document;
        const log = (msg) => { if (typeof options.logCallback === 'function') options.logCallback(msg); };
        log(`🔍 [DICE DRY-RUN] Starting diagnostic inspection on document: "${targetDoc.title || 'Untitled'}"...`);

        const checks = {
          diceForm: !!targetDoc.querySelector('form, #adminForm, #legacy-vehicle-form, .form-validate'),
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

        const catMatch = DropdownManager.findDropdownForLevel(targetDoc, 0, /vehicles/i, {
          selectors: ['#target_category', '#category', '#jform_category', 'select[name="category"]', 'select[name="parent_id"]', 'select[name="parent_id[]"]', 'select[name*="cat"]'],
          labels: [/^category\s*\*?$/i, /\bcategory\b/i],
          names: ['category', 'target_category', 'parent_id', 'parent_id[]', 'catid']
        });
        if (catMatch) {
          checks.category.found = true;
          checks.category.control = catMatch.control.id || catMatch.control.name || catMatch.control.tagName;
          checks.category.optionFound = true;
          log(`✓ Category dropdown found (id: "${checks.category.control}"). "Vehicles": FOUND ✓`);
        }

        const subCatMatch = DropdownManager.findDropdownForLevel(targetDoc, 1, /car\s*-\s*parts/i, {
          selectors: ['#target_cars_parts', '#target_sub_category', '#sub_category', 'select[name="sub_category"]', 'select[name*="sub_cat"]', '#cat_id_2', 'select[name="parent_id[]"]'],
          labels: [/sub\s*category\s*\*?$/i, /cars?\s*-\s*parts\s*\*?$/i, /\bsub-category\b/i],
          names: ['sub_category', 'target_cars_parts', 'subcatid', 'cat_id_2', 'parent_id[]']
        });
        if (subCatMatch) {
          checks.subCategory.found = true;
          checks.subCategory.control = subCatMatch.control.id || subCatMatch.control.name || subCatMatch.control.tagName;
          checks.subCategory.optionFound = true;
          log(`✓ Sub Category dropdown found. "Car - parts": FOUND ✓`);
        }

        const thirdCatMatch = DropdownManager.findDropdownForLevel(targetDoc, 2, /used\s*cars\s*in\s*south\s*africa|all\s*south\s*africa/i, {
          selectors: ['#target_used_cars_sa', '#third_category', 'select[name="third_category"]', 'select[name*="third"]', '#cat_id_3', 'select[name="parent_id[]"]'],
          labels: [/used\s*cars\s*in\s*south\s*africa\s*\*?$/i, /third-level/i, /sub\s*sub\s*category/i],
          names: ['third_category', 'target_used_cars_sa', 'cat_id_3', 'parent_id[]']
        });
        if (thirdCatMatch) {
          checks.thirdLevelCategory.found = true;
          checks.thirdLevelCategory.control = thirdCatMatch.control.id || thirdCatMatch.control.name || thirdCatMatch.control.tagName;
          checks.thirdLevelCategory.optionFound = true;
          log(`✓ 3rd-level Category dropdown found. "Used cars in South Africa": FOUND ✓`);
        }

        const priceInp = targetDoc.querySelector('#target_price, #price, input[name="price"], input[name*="listing_price"]');
        if (priceInp) {
          checks.priceInput.found = true;
          checks.priceInput.element = priceInp.id || priceInp.name;
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
          log(`✓ Price currency dropdown found. "R (Rand)": FOUND ✓`);
        }

        const tagMatch = DropdownManager.findDropdownWithOption(targetDoc, /sale/i, {
          selectors: ['#target_tags', '#target_tag', '#tags', '#tag', 'select[name="tags"]', 'select[name="tag"]', 'select[name*="tag"]'],
          labels: [/^tags?\s*(?:dropdown)?\s*\*?$/i, /\btag\b/i],
          names: ['tags', 'tag', 'target_tags']
        });
        if (tagMatch) {
          checks.tagDropdown.found = true;
          checks.tagDropdown.control = tagMatch.control.id || tagMatch.control.name || tagMatch.control.tagName;
          checks.tagDropdown.optionFound = true;
          log(`✓ Tag dropdown found. "Sale": FOUND ✓`);
        }

        const locMatch = DropdownManager.findDropdownWithOption(targetDoc, /south\s*africa/i, {
          selectors: ['#target_country', '#target_location', '#country', '#location', 'select[name="location"]', 'select[name="country"]', 'select[name*="location"]', 'select[name*="country"]'],
          labels: [/^location\s*(?:dropdown)?\s*\*?$/i, /^country\s*(?:\/\s*location)?\s*\*?$/i, /\blocation\b/i],
          names: ['country', 'location', 'target_country', 'target_location']
        });
        if (locMatch) {
          checks.locationDropdown.found = true;
          checks.locationDropdown.control = locMatch.control.id || locMatch.control.name || locMatch.control.tagName;
          checks.locationDropdown.optionFound = true;
          log(`✓ Location dropdown found. "South Africa": FOUND ✓`);
        }

        const descControls = DescriptionManager.findDescriptionControls(targetDoc);
        checks.toggleEditor.found = !!descControls.toggleEditorBtn;
        checks.descriptionEditor.found = !!(descControls.textarea || descControls.iframe || descControls.contentEditable);

        log('✓ Dry-run completed with 0 form modifications.');
        return { success: true, isDryRun: true, checks };
      },

      /**
       * Inspects and logs detailed diagnostics on all select elements, iframes, and shadow roots in the document.
       * Purely diagnostic — performs ZERO DOM mutations or dropdown events.
       */
      runCategoryDomDiagnostic(targetDoc, options = {}) {
        if (!targetDoc) targetDoc = document;
        const opts = Object.assign({}, options);
        const log = (msg) => {
          if (typeof opts.logCallback === 'function') opts.logCallback(msg);
          console.log(msg);
        };

        log('========================================');
        log('🔎 CATEGORY DOM DIAGNOSTIC');
        log(`URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}`);
        log(`Time: ${new Date().toISOString()}`);
        log('========================================\n');

        // 1. Core High-Level Candidates
        const parentId0 = targetDoc.getElementById('parent_id_0');
        const adminForm = targetDoc.querySelector('form#adminForm, form.form-validate, form[name="adminForm"], #adminForm');
        const parentIdSelects = targetDoc.querySelectorAll('select[name="parent_id[]"]');
        const jomclCategorySelects = targetDoc.querySelectorAll('select.jomcl-category');
        const catDiv = targetDoc.getElementById('category_div');

        log('CATEGORY MATCH CANDIDATES');
        log(`#parent_id_0 = ${parentId0 ? 'FOUND' : 'NOT FOUND'}`);
        log(`form#adminForm = ${adminForm ? `FOUND (id: "${adminForm.id || ''}", name: "${adminForm.name || ''}", action: "${adminForm.getAttribute('action') || ''}")` : 'NOT FOUND'}`);
        log(`select[name="parent_id[]"] = ${parentIdSelects.length} elements`);
        log(`select.jomcl-category = ${jomclCategorySelects.length} elements`);
        log(`#category_div = ${catDiv ? 'FOUND' : 'NOT FOUND'}`);
        if (catDiv) {
          log(`  #category_div innerHTML snippet: ${(catDiv.innerHTML || '').slice(0, 250).replace(/\\s+/g, ' ')}...`);
        }
        log('');

        // 2. Specific Query Patterns & outerHTML
        const queryPatterns = [
          'select[name="parent_id[]"]',
          'select.jomcl-category',
          '#parent_id_0',
          'select[name*="cat"]',
          'select[id*="cat"]',
          'select[name*="category"]',
          'select[id*="category"]',
          '.chosen-container'
        ];

        log('--- PATTERN QUERY RESULTS ---');
        for (const q of queryPatterns) {
          try {
            const matches = targetDoc.querySelectorAll(q);
            log(`Query: "${q}" → ${matches.length} elements`);
            matches.forEach((el, idx) => {
              const outer = (el.outerHTML || '').slice(0, 350).replace(/\\s+/g, ' ');
              log(`  [${idx}] <${(el.tagName || '').toLowerCase()}> id="${el.id || ''}" name="${el.name || ''}" class="${el.className || ''}"`);
              log(`      outerHTML: ${outer}...`);
            });
          } catch (e) {
            log(`Query "${q}" → ERROR: ${e.message}`);
          }
        }
        log('');

        // 3. Enumerate ALL <select> Elements
        const allSelects = Array.from(targetDoc.querySelectorAll('select'));
        log(`--- ALL <SELECT> ELEMENTS (${allSelects.length} total) ---`);

        allSelects.forEach((sel, idx) => {
          const parentForm = sel.closest('form');
          const parentContainer = sel.parentElement;
          const computed = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(sel) : null;
          const isVisible = computed ? (computed.display !== 'none' && computed.visibility !== 'hidden') : true;

          log(`\nSelect #${idx}:`);
          log(`  id: "${sel.id || ''}"`);
          log(`  name: "${sel.name || ''}"`);
          log(`  class: "${sel.className || ''}"`);
          log(`  type: "${sel.type || ''}"`);
          log(`  disabled: ${sel.disabled}`);
          log(`  visible: ${isVisible} (display: ${computed?.display || '?'}, visibility: ${computed?.visibility || '?'})`);
          log(`  nearest form: ${parentForm ? `<form id="${parentForm.id || ''}" name="${parentForm.name || ''}">` : 'NONE (outside form)'}`);
          log(`  parent/container: <${(parentContainer?.tagName || '').toLowerCase()} id="${parentContainer?.id || ''}" class="${parentContainer?.className || ''}">`);
          log(`  selectedIndex: ${sel.selectedIndex}`);
          log(`  options count: ${sel.options ? sel.options.length : 0}`);

          if (sel.options && sel.options.length > 0) {
            log('  options:');
            Array.from(sel.options).forEach((opt, oIdx) => {
              const cleanT = (opt.text || '').replace(/\\s+/g, ' ').trim();
              log(`    [${oIdx}] text="${cleanT}" value="${opt.value}" selected=${opt.selected}`);
            });
          } else {
            log('    [NO OPTIONS PRESENT IN SELECT]');
          }

          const outer = (sel.outerHTML || '').slice(0, 350).replace(/\\s+/g, ' ');
          log(`  outerHTML: ${outer}...`);
        });
        log('');

        // 4. Inspect Iframes
        const allIframes = Array.from(targetDoc.querySelectorAll('iframe'));
        log(`--- IFRAMES (${allIframes.length} total) ---`);
        allIframes.forEach((ifr, idx) => {
          log(`  Iframe #${idx}: id="${ifr.id || ''}" name="${ifr.name || ''}" src="${ifr.src || ''}"`);
          try {
            if (ifr.contentDocument) {
              const innerSelects = ifr.contentDocument.querySelectorAll('select');
              log(`    → accessible contentDocument contains ${innerSelects.length} <select> elements`);
            }
          } catch (e) {
            log(`    → contentDocument cross-origin restricted (${e.message})`);
          }
        });
        log('');

        // 5. Inspect Shadow Roots
        log('--- SHADOW ROOTS INSPECTION ---');
        let shadowCount = 0;
        targetDoc.querySelectorAll('*').forEach(el => {
          if (el.shadowRoot) {
            shadowCount++;
            log(`  Shadow root found on: <${(el.tagName || '').toLowerCase()} id="${el.id || ''}" class="${el.className || ''}">`);
          }
        });
        if (shadowCount === 0) {
          log('  No shadow roots detected on document elements.');
        }

        log('\n========================================');
        log('🏁 DIAGNOSTIC COMPLETE');
        log('========================================');

        return {
          success: true,
          selectCount: allSelects.length,
          iframeCount: allIframes.length,
          hasAdminForm: !!adminForm,
          hasParentId0: !!parentId0
        };
      },

      async fillForm(targetDoc, extractedData, options = {}) {
        if (!targetDoc) targetDoc = document;
        if (!extractedData) return { success: false, error: 'No extracted vehicle data provided.' };
        const fields = extractedData.fields || extractedData.normalized || extractedData;
        const opts = Object.assign({ stepDelayMs: 300, maxWaitMs: 8000, pollIntervalMs: 150 }, options);
        const log = (msg) => { if (typeof opts.logCallback === 'function') opts.logCallback(msg); };

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
          // 1. Category -> Vehicles (Level 0)
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
            return result;
          }
          result.stepsCompleted.push('Category: Vehicles');

          // 2. Sub Category -> Car - parts (Level 1, WAIT FOR AJAX UPDATE)
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
            return result;
          }
          result.stepsCompleted.push('SubCategory: Car - parts');

          // 3. Third-level Category -> Used cars in South Africa (Level 2, WAIT FOR AJAX UPDATE)
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
            return result;
          }
          result.stepsCompleted.push('ThirdLevelCategory: Used cars in South Africa');

          // 4. Wait for vehicle fields to reveal
          log('4. Waiting for vehicle form fields to reveal in DOM...');
          await Utils.waitFor(() => {
            const titleInp = targetDoc.querySelector('#target_vehicle_title, #target_title, #title, input[name="title"]');
            const priceInp = targetDoc.querySelector('#target_price, #price, input[name="price"]');
            const container = targetDoc.querySelector('#dice-vehicle-fields-section, .form-horizontal, form');
            return !!(titleInp || priceInp || (container && container.style.display !== 'none'));
          }, opts.maxWaitMs, opts.pollIntervalMs);

          await Utils.sleep(opts.stepDelayMs);

          // 5. Populate Vehicle Fields
          log('5. Populating vehicle input fields...');
          SmartPasteEngine.fillTargetForm(targetDoc, fields);
          result.stepsCompleted.push('Vehicle Fields Populated');

          // 6. Price & Currency -> R (Rand)
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
              const fallbackRes = DropdownManager.selectAndVerify(currMatch.control, 'ZAR') || DropdownManager.selectAndVerify(currMatch.control, 'R');
              if (fallbackRes && fallbackRes.success) {
                log(`✓ Selected Price Currency fallback → "${fallbackRes.selectedText}"`);
                result.stepsCompleted.push(`Price Currency: ${fallbackRes.selectedText}`);
              }
            }
          }

          // 7. Tag -> Sale
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
            }
          }

          // 8. Location -> South Africa
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
            }
          }

          // 9. Description with Toggle Editor
          log('9. Processing Description editor area and Toggle Editor...');
          if (fields.description) {
            const descRes = await DescriptionManager.ensureAndFillDescription(targetDoc, fields.description, log);
            log(`Description:\n  editor type → ${descRes.isRichText ? 'RichText (TinyMCE/iframe)' : 'Textarea'}\n  content inserted → ${descRes.success ? 'PASS' : 'FAIL'}`);
            if (descRes.success) {
              result.stepsCompleted.push('Description Inserted');
            } else {
              log(`❌ Description error: ${descRes.error}`);
              result.errors.push(`Description: ${descRes.error}`);
            }
          }

          // 10. Verify Fields in DOM
          log('10. Verifying all field values in DOM...');
          await Utils.sleep(opts.stepDelayMs);

          const fieldVerificationList = [
            { key: 'title', label: 'Title', selectors: ['#target_vehicle_title', '#target_title', '#title', 'input[name="title"]'] },
            { key: 'year', label: 'Year', selectors: ['#target_year', '#year', 'input[name="year"]'] },
            { key: 'kilometersDriven', label: 'Kilometers Driven', selectors: ['#target_kilometers_driven', '#target_mileage', '#kilometers_driven', '#mileage', 'input[name="kilometers_driven"]'] },
            { key: 'price', label: 'Price', selectors: ['#target_price', '#price', 'input[name="price"]'] }
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
            return result;
          }

          result.success = true;
          log('\n==================================================');
          log('✓ Auto-fill completed');
          log('Please review the form before manually submitting.');
          log('==================================================');

          this.renderCompletionBanner(targetDoc);
          return result;

        } catch (err) {
          log(`❌ Auto-fill encountered an error: ${err.message}`);
          result.errors.push(err.message);
          this.renderErrorBanner(targetDoc, err.message);
          return result;
        }
      },

      renderCompletionBanner(targetDoc) {
        if (!targetDoc || !targetDoc.body) return;
        try {
          const existing = targetDoc.getElementById('dice-autofill-banner');
          if (existing) existing.remove();
          const banner = targetDoc.createElement('div');
          banner.id = 'dice-autofill-banner';
          banner.style.cssText = 'position:fixed; top:16px; left:50%; transform:translateX(-50%); background:#0f172a; color:#f8fafc; padding:12px 20px; border-radius:8px; border-left:5px solid #22c55e; box-shadow:0 10px 25px rgba(0,0,0,0.35); z-index:99999999; font-family:sans-serif; font-size:13px; display:flex; align-items:center; gap:12px;';
          banner.innerHTML = '<div style="font-size:18px;">✅</div><div><div style="font-weight:700; color:#4ade80; font-size:14px;">✓ Auto-fill completed</div><div style="color:#94a3b8; font-size:12px;">Please review the form before manually submitting.</div></div><button id="dice-banner-close" style="background:transparent; border:none; color:#64748b; font-size:16px; cursor:pointer; padding:2px 6px; margin-left:8px;">✕</button>';
          targetDoc.body.appendChild(banner);
          banner.querySelector('#dice-banner-close').onclick = () => banner.remove();
          setTimeout(() => { if (banner.parentElement) banner.remove(); }, 12000);
        } catch (e) {}
      },

      renderErrorBanner(targetDoc, reason) {
        if (!targetDoc || !targetDoc.body) return;
        try {
          const existing = targetDoc.getElementById('dice-autofill-banner');
          if (existing) existing.remove();
          const banner = targetDoc.createElement('div');
          banner.id = 'dice-autofill-banner';
          banner.style.cssText = 'position:fixed; top:16px; left:50%; transform:translateX(-50%); background:#1e1014; color:#f8fafc; padding:12px 20px; border-radius:8px; border-left:5px solid #ef4444; box-shadow:0 10px 25px rgba(0,0,0,0.35); z-index:99999999; font-family:sans-serif; font-size:13px; display:flex; align-items:center; gap:12px;';
          banner.innerHTML = `<div style="font-size:18px;">❌</div><div><div style="font-weight:700; color:#f87171; font-size:14px;">❌ Auto-fill stopped</div><div style="color:#cbd5e1; font-size:12px;">${reason}</div></div><button id="dice-banner-close" style="background:transparent; border:none; color:#94a3b8; font-size:16px; cursor:pointer; padding:2px 6px; margin-left:8px;">✕</button>`;
          targetDoc.body.appendChild(banner);
          banner.querySelector('#dice-banner-close').onclick = () => banner.remove();
        } catch (e) {}
      }
    };
  })();

  // --- 7. DICE TAB CROSS-TAB LISTENER ---
  const DiceTabListener = {
    processedJobIds: new Set(),
    statusBarEl: null,

    init() {
      if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener('DICE_PENDING_JOB', (name, oldValue, newValue, remote) => {
          if (newValue) {
            this.handleJob(newValue, true);
          }
        });
      }

      window.addEventListener('storage', (e) => {
        if (e.key === 'DICE_PENDING_JOB' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            this.handleJob(parsed, true);
          } catch (err) {}
        }
      });

      this.checkPendingColdStart();
    },

    checkPendingColdStart() {
      let pendingJob = null;
      if (typeof GM_getValue === 'function') {
        pendingJob = GM_getValue('DICE_PENDING_JOB');
      }
      if (!pendingJob) {
        try {
          const stored = localStorage.getItem('DICE_PENDING_JOB');
          if (stored) pendingJob = JSON.parse(stored);
        } catch (e) {}
      }

      if (pendingJob && pendingJob.jobId && !this.processedJobIds.has(pendingJob.jobId)) {
        const ageMs = Date.now() - (pendingJob.timestamp || 0);
        if (ageMs < 600000) {
          this.renderPendingWidget(pendingJob);
        }
      }
    },

    async handleJob(job, isLiveEvent = false) {
      if (!job || !job.jobId) return;
      if (this.processedJobIds.has(job.jobId)) return;

      const ageMs = Date.now() - (job.timestamp || 0);
      if (ageMs > 600000) return;

      this.processedJobIds.add(job.jobId);
      this.renderPendingWidget(job);

      if (isLiveEvent) {
        if (job.action === 'dryrun') {
          await DiceAutomator.runDryRun(document, job.fields || {}, {
            logCallback: (m) => this.logToWidget(m)
          });
        } else {
          const res = await DiceAutomator.fillForm(document, job, {
            logCallback: (m) => this.logToWidget(m)
          });
          this.updateWidgetStatus(res);
        }
      }
    },

    renderPendingWidget(job) {
      if (this.statusBarEl) this.statusBarEl.remove();

      const title = job.fields?.title || 'Vehicle Listing';
      const price = job.fields?.price ? `R ${job.fields.price}` : '';

      const widget = document.createElement('div');
      widget.id = 'dice-floating-automation-bar';
      widget.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: #0f172a;
        color: #f8fafc;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
        border: 1px solid #334155;
        z-index: 9999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        overflow: hidden;
      `;

      widget.innerHTML = `
        <div style="background: #1e293b; padding: 8px 12px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #334155;">
          <div>
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #38bdf8;">
              <span>🚗</span> DICE Form Automator
            </div>
            <div style="font-size: 10px; color: #94a3b8; font-family: monospace; line-height: 1.3; margin-top: 3px;">
              BUILD: ${BUILD_COMMIT}<br>VERSION: ${SCRIPT_VERSION}
            </div>
          </div>
          <button id="dice-bar-close" style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 2px 4px;">✕</button>
        </div>
        <div style="padding: 10px 12px;">
          <div id="dice-bar-status-text" style="color: #4ade80; font-weight: 700; margin-bottom: 4px;">Vehicle data received ✓</div>
          <div style="font-weight: 600; color: #f8fafc; word-break: break-word;">${title}</div>
          ${price ? `<div style="color: #94a3b8; font-size: 11px;">Price: ${price}</div>` : ''}
          <div id="dice-bar-log" style="margin-top: 8px; max-height: 220px; overflow-y: auto; font-family: monospace; font-size: 10px; color: #94a3b8; background: #020617; padding: 6px; border-radius: 4px; display: none; white-space: pre-wrap; user-select: text; -webkit-user-select: text;"></div>
          <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; gap: 6px;">
              <button id="dice-bar-run-autofill" style="background: #16a34a; color: #ffffff; border: none; padding: 6px 10px; border-radius: 4px; font-weight: 700; font-size: 11px; cursor: pointer; flex: 2;">
                ⚡ Run Auto-Fill
              </button>
              <button id="dice-bar-run-dryrun" style="background: #0284c7; color: #ffffff; border: none; padding: 6px 8px; border-radius: 4px; font-weight: 700; font-size: 10.5px; cursor: pointer; flex: 1;">
                🧪 Dry-Run
              </button>
            </div>
            <button id="dice-bar-run-inspect" style="background: #6366f1; color: #ffffff; border: none; padding: 6px 10px; border-radius: 4px; font-weight: 700; font-size: 11px; cursor: pointer; width: 100%;">
              🔎 INSPECT CATEGORY DOM
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(widget);
      this.statusBarEl = widget;

      widget.querySelector('#dice-bar-close').onclick = () => widget.remove();
      widget.querySelector('#dice-bar-run-autofill').onclick = async () => {
        this.logToWidget('Starting auto-fill sequence...');
        const res = await DiceAutomator.fillForm(document, job, {
          logCallback: (m) => this.logToWidget(m)
        });
        this.updateWidgetStatus(res);
      };
      widget.querySelector('#dice-bar-run-dryrun').onclick = async () => {
        this.logToWidget('Starting dry-run inspection...');
        await DiceAutomator.runDryRun(document, job.fields || {}, {
          logCallback: (m) => this.logToWidget(m)
        });
      };
      widget.querySelector('#dice-bar-run-inspect').onclick = () => {
        const logEl = widget.querySelector('#dice-bar-log');
        if (logEl) {
          logEl.style.display = 'block';
          logEl.textContent = '';
        }
        DiceAutomator.runCategoryDomDiagnostic(document, {
          logCallback: (m) => this.logToWidget(m)
        });
      };
    },

    updateWidgetStatus(result) {
      if (!this.statusBarEl) return;
      const statusEl = this.statusBarEl.querySelector('#dice-bar-status-text');
      if (!statusEl) return;
      if (result && result.success) {
        statusEl.style.color = '#4ade80';
        statusEl.textContent = 'Auto-fill completed ✓';
      } else {
        statusEl.style.color = '#f87171';
        statusEl.textContent = `❌ Auto-fill stopped: ${result?.failedStep || 'Error'}`;
      }
    },

    logToWidget(msg) {
      if (!this.statusBarEl) return;
      const logEl = this.statusBarEl.querySelector('#dice-bar-log');
      if (logEl) {
        logEl.style.display = 'block';
        logEl.textContent += (logEl.textContent ? '\n' : '') + msg;
        logEl.scrollTop = logEl.scrollHeight;
      }
    }
  };

  // Expose engines for test harnesses & browser global scope
  if (typeof window !== 'undefined') {
    window.CarSmartPasteEngine = SmartPasteEngine;
    window.CarsCoZaAdapter = CarsCoZaAdapter;
    window.CarDataHelperNormalizers = Normalizers;
    window.CarDataHelperValidators = Validators;
    window.CarDataHelperClipboard = { copyToClipboard, formatDescriptionHtml };
    window.CarDataHelperAutoReveal = autoRevealShowNumber;
    window.DiceAutomator = DiceAutomator;
    window.DiceTabListener = DiceTabListener;
    window.CarDataHelperUI = {
      createHelperPanel,
      closeHelperPanel,
      openHelperPanel,
      clampPosition,
      applyPosition,
      getSavedPosition: () => savedPosition,
      initDraggablePanel
    };
  }

  // Active initialization
  SmartPasteEngine.init();

  const isSourceListing = CarsCoZaAdapter.canHandle(document);
  if (isSourceListing) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(createHelperPanel, 300);
      });
    } else {
      setTimeout(createHelperPanel, 300);
    }
  } else {
    // We are on a DICE form / target page
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        DiceTabListener.init();
      });
    } else {
      DiceTabListener.init();
    }
  }
})();
