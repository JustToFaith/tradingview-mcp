/**
 * Locale-aware UI text and selector helpers.
 *
 * TradingView ships separate DOMs per language (cn.tradingview.com is zh-Hans,
 * www.tradingview.com is en). `data-name` attributes are stable across
 * languages (they are TradingView's internal IDs), but `aria-label` /
 * `textContent` strings are localized. Some buttons have no `data-name` at
 * all, so we fall back to a locale-aware text/aria-label map.
 *
 * Locale is auto-detected from `document.documentElement.lang`; callers can
 * override by passing a locale string.
 */

const LOCALE_LABELS = {
  // data-name first (stable, language-independent) + aria-label fallback per locale.
  // aria-label values here are Chinese (zh-Hans); add more locales as needed.
  watchlist: { dataName: 'base', ariaLabel: { 'zh-Hans': '自选表、详情和新闻', en: 'Watchlist, details and news' } },
  alerts:    { dataName: 'alerts', ariaLabel: { 'zh-Hans': '警报', en: 'Alerts' } },
  trading:   { dataName: 'trading-button', ariaLabel: { 'zh-Hans': '交易面板', en: 'Trading Panel' } },
  pine:      { dataName: 'pine-dialog-button', ariaLabel: { 'zh-Hans': 'Pine', en: 'Pine' } },
};

const LOCALE_BUTTONS = {
  createAlert: { 'zh-Hans': '创建警报', en: 'Create Alert' },
  addSymbol:   { 'zh-Hans': '添加商品代码', en: 'Add symbol' },
  // Dialog action buttons
  save:        { 'zh-Hans': '保存', en: 'Save' },
  cancel:      { 'zh-Hans': '取消', en: 'Cancel' },
  ok:          { 'zh-Hans': '确定', en: 'OK' },
  close:       { 'zh-Hans': '关闭', en: 'Close' },
  delete:      { 'zh-Hans': '删除', en: 'Delete' },
  apply:       { 'zh-Hans': '应用', en: 'Apply' },
  // Unsaved-changes dialog: continue/discard
  openAnyway:  { 'zh-Hans': '仍然打开', en: 'Open anyway' },
  dontSave:    { 'zh-Hans': '不保存', en: "Don't save" },
  discard:     { 'zh-Hans': '放弃', en: 'Discard' },
};

// Key buttons that health.js keyLabels recognizes — bilingual regexes.
const LOCALE_REGEX = {
  addToChart:   /add to chart|添加到图表/i,
  saveAndAdd:   /save and add|保存并添加/i,
  updateOnChart:/update on chart|更新到图表/i,
  save:         /^(Save|Save Script|保存|保存脚本)$/,
  saved:        /^(Saved|已保存)/,
  publish:      /publish script|发布脚本/i,
  compileErrors:/compile errors?|编译错误/i,
  unsaved:      /unsaved version|未保存版本/i,
  // Input labels (price/value)
  priceField:   /(price|value|价格|值)/i,
};

function detectLocale() {
  try {
    const lang = document?.documentElement?.lang || '';
    return lang || 'en';
  } catch (e) {
    return 'en';
  }
}

/**
 * Build a JS expression fragment that queries a button by the best available
 * selector for the current locale, falling back through:
 *   data-name → aria-label (localized) → text content (localized).
 * Pass the result of this through evaluate() to click the element.
 */
function buildClickExpr({ key, locale, by, value }) {
  // Explicit selector requested
  if (by && value !== undefined) {
    if (by === 'data-name') {
      return `document.querySelector('[data-name="${String(value).replace(/"/g, '\\"')}"]')`;
    }
    if (by === 'aria-label') {
      return `document.querySelector('[aria-label="${String(value).replace(/"/g, '\\"')}"]')`;
    }
    if (by === 'class-contains') {
      return `document.querySelector('[class*="${String(value).replace(/"/g, '\\"')}"]')`;
    }
    if (by === 'text') {
      const escaped = JSON.stringify(value);
      // Robust text matcher: exact → startsWith → contains → case-insensitive contains.
      // Scoped to clickable elements.
      return `(function(){
        var v = ${escaped};
        var cands = document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], span, div');
        function hit(el){ var t = el.textContent.trim(); return t===v || t===v.toLowerCase() || t.startsWith(v) || t.toLowerCase().indexOf(v.toLowerCase())>=0; }
        for (var i=0;i<cands.length;i++){ if (cands[i].offsetParent!==null && hit(cands[i])) return cands[i]; }
        return null;
      })()`;
    }
  }
  // Key-based lookup (watchlist / alerts / trading / pine)
  const def = LOCALE_LABELS[key];
  if (def) {
    const ariaForLocale = def.ariaLabel[locale] || def.ariaLabel.en || '';
    const dataName = def.dataName;
    return `(function(){
      var dn = ${JSON.stringify(dataName)};
      var al = ${JSON.stringify(ariaForLocale)};
      var el = document.querySelector('[data-name="' + dn + '"]');
      if (el) return el;
      if (al) {
        el = document.querySelector('[aria-label="' + al + '"]');
        if (el) return el;
        var all = document.querySelectorAll('[aria-label]');
        for (var i=0;i<all.length;i++){ if (all[i].offsetParent!==null && all[i].getAttribute('aria-label') && all[i].getAttribute('aria-label').indexOf(al)>=0) return all[i]; }
      }
      return null;
    })()`;
  }
  return 'null';
}

/**
 * Get all locale variants for a button key (for regex / multi-match).
 */
function buttonVariants(key) {
  const def = LOCALE_BUTTONS[key];
  if (!def) return [];
  return Object.values(def);
}

function regex(key) {
  return LOCALE_REGEX[key];
}

export {
  detectLocale,
  buildClickExpr,
  buttonVariants,
  regex,
  LOCALE_LABELS,
  LOCALE_BUTTONS,
  LOCALE_REGEX,
};
