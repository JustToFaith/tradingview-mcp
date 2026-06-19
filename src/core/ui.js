/**
 * Core UI automation logic.
 */
import { evaluate, evaluateAsync, getClient } from '../connection.js';

// Locale-aware matcher helpers (data-name preferred, then aria-label, then text).
// Imported lazily inside functions so this file can be loaded without locale.js
// during unit tests.
async function _matcher() {
  const m = await import('./locale.js');
  return m;
}

// Build a JS expression that finds + clicks a single element matching
// the strategy: data-name → aria-label → text (robust).
function _clickExpr({ by, value }) {
  if (by === 'data-name') {
    return `(function(){var e=document.querySelector('[data-name="${String(value).replace(/"/g, '\\"')}"]'); if(e){e.click(); return {found:true,tag:e.tagName.toLowerCase(),text:(e.textContent||'').trim().substring(0,80),aria_label:e.getAttribute('aria-label'),data_name:e.getAttribute('data-name')};} return {found:false};})()`;
  }
  if (by === 'aria-label') {
    return `(function(){
      var v = ${JSON.stringify(String(value))};
      var e = document.querySelector('[aria-label="' + v.replace(/"/g, '\\"') + '"]');
      if (!e) e = document.querySelector('[aria-label*="' + v.replace(/"/g, '\\"') + '"]');
      if (!e) return {found:false};
      e.click();
      return {found:true,tag:e.tagName.toLowerCase(),text:(e.textContent||'').trim().substring(0,80),aria_label:e.getAttribute('aria-label'),data_name:e.getAttribute('data-name')};
    })()`;
  }
  if (by === 'class-contains') {
    return `(function(){var e=document.querySelector('[class*="${String(value).replace(/"/g, '\\"')}"]'); if(e){e.click(); return {found:true,tag:e.tagName.toLowerCase(),text:(e.textContent||'').trim().substring(0,80),aria_label:e.getAttribute('aria-label'),data_name:e.getAttribute('data-name')};} return {found:false};})()`;
  }
  if (by === 'text') {
    // Robust text matcher: exact → startsWith → contains (case-insensitive).
    // Scoped to interactive elements so we don't click huge container divs.
    const escaped = JSON.stringify(String(value));
    return `(function(){
      var v = ${escaped};
      var vLower = v.toLowerCase();
      var cands = document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], label, span, div');
      function hit(t){ return t===v || t===vLower || t.startsWith(v) || t.toLowerCase().indexOf(vLower)>=0; }
      // Pass 1: prefer small interactive elements (button/anchor/role=*)
      for (var i=0;i<cands.length;i++){ var el=cands[i]; if (el.offsetParent===null) continue; if ((el.tagName==='BUTTON'||el.tagName==='A'||el.getAttribute('role')) && el.children.length===0 && hit((el.textContent||'').trim())) { el.click(); return {found:true,tag:el.tagName.toLowerCase(),text:(el.textContent||'').trim().substring(0,80),aria_label:el.getAttribute('aria-label'),data_name:el.getAttribute('data-name'),match_pass:'strict'}; } }
      // Pass 2: any visible element with exact text match
      for (var j=0;j<cands.length;j++){ var el2=cands[j]; if (el2.offsetParent===null) continue; var t=(el2.textContent||'').trim(); if (t===v && el2.children.length<10) { el2.click(); return {found:true,tag:el2.tagName.toLowerCase(),text:t.substring(0,80),aria_label:el2.getAttribute('aria-label'),data_name:el2.getAttribute('data-name'),match_pass:'exact'}; } }
      // Pass 3: contains match (case-insensitive)
      for (var k=0;k<cands.length;k++){ var el3=cands[k]; if (el3.offsetParent===null) continue; var t3=(el3.textContent||'').trim(); if (t3.toLowerCase().indexOf(vLower)>=0 && el3.children.length<10 && t3.length<200) { el3.click(); return {found:true,tag:el3.tagName.toLowerCase(),text:t3.substring(0,80),aria_label:el3.getAttribute('aria-label'),data_name:el3.getAttribute('data-name'),match_pass:'contains'}; } }
      return {found:false};
    })()`;
  }
  return `(function(){return {found:false,error:'unsupported by: ${by}'};})()`;
}

export async function click({ by, value }) {
  const result = await evaluate(_clickExpr({ by, value }));
  if (!result || !result.found) throw new Error('No matching element found for ' + by + '="' + value + '"');
  return { success: true, clicked: result };
}

export async function openPanel({ panel, action }) {
  const isBottomPanel = panel === 'pine-editor' || panel === 'strategy-tester';
  if (isBottomPanel) {
    const widgetName = panel === 'pine-editor' ? 'pine-editor' : 'backtesting';
    const result = await evaluate(`
      (function() {
        var bwb = window.TradingView && window.TradingView.bottomWidgetBar;
        if (!bwb) return { error: 'bottomWidgetBar not available' };
        var panel = ${JSON.stringify(panel)};
        var widgetName = ${JSON.stringify(widgetName)};
        var action = ${JSON.stringify(action)};
        var bottomArea = document.querySelector('[class*="layout__area--bottom"]');
        var isOpen = !!(bottomArea && bottomArea.offsetHeight > 50);
        if (panel === 'pine-editor') { var monacoEl = document.querySelector('.monaco-editor.pine-editor-monaco'); isOpen = isOpen && !!monacoEl; }
        if (panel === 'strategy-tester') { var stratPanel = document.querySelector('[data-name="backtesting"]') || document.querySelector('[class*="strategyReport"]'); isOpen = isOpen && !!(stratPanel && stratPanel.offsetParent); }
        var performed = 'none';
        if (action === 'open' || (action === 'toggle' && !isOpen)) {
          if (panel === 'pine-editor') { if (typeof bwb.activateScriptEditorTab === 'function') bwb.activateScriptEditorTab(); else if (typeof bwb.showWidget === 'function') bwb.showWidget(widgetName); }
          else { if (typeof bwb.showWidget === 'function') bwb.showWidget(widgetName); }
          performed = 'opened';
        } else if (action === 'close' || (action === 'toggle' && isOpen)) {
          if (typeof bwb.hideWidget === 'function') bwb.hideWidget(widgetName);
          performed = 'closed';
        }
        return { was_open: isOpen, performed: performed };
      })()
    `);
    if (result && result.error) throw new Error(result.error);
    return { success: true, panel, action, was_open: result?.was_open ?? false, performed: result?.performed ?? 'unknown' };
  } else {
    // Locale-aware panel selectors. data-name is preferred (language-independent),
    // then per-locale aria-label fallback. Each entry can carry multiple
    // aria-labels (zh-Hans + en) so we try them all.
    const selectorMap = {
      'watchlist': { dataName: 'base', ariaLabels: ['自选表、详情和新闻', 'Watchlist, details and news', 'Watchlist'] },
      'alerts':    { dataName: 'alerts', ariaLabels: ['警报', 'Alerts'] },
      'trading':   { dataName: 'trading-button', ariaLabels: ['交易面板', 'Trading Panel'] },
    };
    const sel = selectorMap[panel];
    if (!sel) throw new Error('Unknown panel: ' + panel + '. Supported: pine-editor, strategy-tester, watchlist, alerts, trading');
    // Build a JS expression that tries data-name first, then each aria-label.
    const ariaLabelsJs = JSON.stringify(sel.ariaLabels);
    const result = await evaluate(`
      (function() {
        var dataName = ${JSON.stringify(sel.dataName)};
        var ariaLabels = ${ariaLabelsJs};
        var action = ${JSON.stringify(action)};
        var btn = document.querySelector('[data-name="' + dataName + '"]');
        if (!btn) {
          for (var i=0;i<ariaLabels.length;i++){
            var al = ariaLabels[i];
            btn = document.querySelector('[aria-label="' + al + '"]');
            if (btn) break;
            // contains fallback (handles longer localized labels with extra context)
            var all = document.querySelectorAll('[aria-label]');
            for (var j=0;j<all.length;j++){
              if (all[j].offsetParent!==null && (all[j].getAttribute('aria-label')||'').indexOf(al)>=0) { btn = all[j]; break; }
            }
            if (btn) break;
          }
        }
        if (!btn) return { error: 'Button not found for panel: ' + ${JSON.stringify(panel)} };
        var isActive = btn.getAttribute('aria-pressed') === 'true' || btn.classList.contains('isActive') || btn.classList.toString().indexOf('active') !== -1 || btn.classList.toString().indexOf('Active') !== -1;
        var rightArea = document.querySelector('[class*="layout__area--right"]');
        var sidebarOpen = !!(rightArea && rightArea.offsetWidth > 50);
        var isOpen = isActive && sidebarOpen;
        var performed = 'none';
        if (action === 'open' && !isOpen) { btn.click(); performed = 'opened'; }
        else if (action === 'close' && isOpen) { btn.click(); performed = 'closed'; }
        else if (action === 'toggle') { btn.click(); performed = isOpen ? 'closed' : 'opened'; }
        else { performed = isOpen ? 'already_open' : 'already_closed'; }
        return { was_open: isOpen, performed: performed };
      })()
    `);
    if (result && result.error) throw new Error(result.error);
    return { success: true, panel, action, was_open: result?.was_open ?? false, performed: result?.performed ?? 'unknown' };
  }
}

export async function fullscreen() {
  const result = await evaluate(`
    (function() {
      var btn = document.querySelector('[data-name="header-toolbar-fullscreen"]');
      if (!btn) return { found: false };
      btn.click();
      return { found: true };
    })()
  `);
  if (!result || !result.found) throw new Error('Fullscreen button not found');
  return { success: true, action: 'fullscreen_toggled' };
}

export async function layoutList() {
  const layouts = await evaluateAsync(`
    new Promise(function(resolve) {
      try {
        window.TradingViewApi.getSavedCharts(function(charts) {
          if (!charts || !Array.isArray(charts)) { resolve({layouts: [], source: 'internal_api', error: 'getSavedCharts returned no data'}); return; }
          var result = charts.map(function(c) { return { id: c.id || c.chartId || null, name: c.name || c.title || 'Untitled', symbol: c.symbol || null, resolution: c.resolution || null, modified: c.timestamp || c.modified || null }; });
          resolve({layouts: result, source: 'internal_api'});
        });
        setTimeout(function() { resolve({layouts: [], source: 'internal_api', error: 'getSavedCharts timed out'}); }, 5000);
      } catch(e) { resolve({layouts: [], source: 'internal_api', error: e.message}); }
    })
  `);
  return { success: true, layout_count: layouts?.layouts?.length || 0, source: layouts?.source, layouts: layouts?.layouts || [], error: layouts?.error };
}

export async function layoutSwitch({ name }) {
  const escaped = JSON.stringify(name);
  const result = await evaluateAsync(`
    new Promise(function(resolve) {
      try {
        var target = ${escaped};
        if (/^\\d+$/.test(target)) { window.TradingViewApi.loadChartFromServer(target); resolve({success: true, method: 'loadChartFromServer', id: target, source: 'internal_api'}); return; }
        window.TradingViewApi.getSavedCharts(function(charts) {
          if (!charts || !Array.isArray(charts)) { resolve({success: false, error: 'getSavedCharts returned no data', source: 'internal_api'}); return; }
          var match = null;
          for (var i = 0; i < charts.length; i++) { var cname = charts[i].name || charts[i].title || ''; if (cname === target || cname.toLowerCase() === target.toLowerCase()) { match = charts[i]; break; } }
          if (!match) { for (var j = 0; j < charts.length; j++) { var cn = (charts[j].name || charts[j].title || '').toLowerCase(); if (cn.indexOf(target.toLowerCase()) !== -1) { match = charts[j]; break; } } }
          if (!match) { resolve({success: false, error: 'Layout "' + target + '" not found.', source: 'internal_api'}); return; }
          var chartId = match.id || match.chartId;
          window.TradingViewApi.loadChartFromServer(chartId);
          resolve({success: true, method: 'loadChartFromServer', id: chartId, name: match.name || match.title, source: 'internal_api'});
        });
        setTimeout(function() { resolve({success: false, error: 'getSavedCharts timed out', source: 'internal_api'}); }, 5000);
      } catch(e) { resolve({success: false, error: e.message, source: 'internal_api'}); }
    })
  `);
  if (!result?.success) throw new Error(result?.error || 'Unknown error switching layout');

  // Handle "unsaved changes" confirmation dialog
  await new Promise(r => setTimeout(r, 500));
  const dismissed = await evaluate(`
    (function() {
      // Bilingual: en (Open anyway / Don't save / Discard) and zh-Hans (仍然打开 / 不保存 / 放弃)
      var btns = document.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var text = btns[i].textContent.trim();
        if (/open anyway|don't save|discard|仍然打开|不保存|放弃/i.test(text)) {
          btns[i].click();
          return true;
        }
      }
      return false;
    })()
  `);

  if (dismissed) await new Promise(r => setTimeout(r, 1000));
  return { success: true, layout: result.name || name, layout_id: result.id, source: result.source, action: 'switched', unsaved_dialog_dismissed: dismissed };
}

export async function keyboard({ key, modifiers }) {
  const c = await getClient();
  let mod = 0;
  if (modifiers) {
    if (modifiers.includes('alt')) mod |= 1;
    if (modifiers.includes('ctrl')) mod |= 2;
    if (modifiers.includes('meta')) mod |= 4;
    if (modifiers.includes('shift')) mod |= 8;
  }
  const keyMap = {
    'Enter': { code: 'Enter', vk: 13 }, 'Escape': { code: 'Escape', vk: 27 }, 'Tab': { code: 'Tab', vk: 9 },
    'Backspace': { code: 'Backspace', vk: 8 }, 'Delete': { code: 'Delete', vk: 46 },
    'ArrowUp': { code: 'ArrowUp', vk: 38 }, 'ArrowDown': { code: 'ArrowDown', vk: 40 },
    'ArrowLeft': { code: 'ArrowLeft', vk: 37 }, 'ArrowRight': { code: 'ArrowRight', vk: 39 },
    'Space': { code: 'Space', vk: 32 }, 'Home': { code: 'Home', vk: 36 }, 'End': { code: 'End', vk: 35 },
    'PageUp': { code: 'PageUp', vk: 33 }, 'PageDown': { code: 'PageDown', vk: 34 },
    'F1': { code: 'F1', vk: 112 }, 'F2': { code: 'F2', vk: 113 }, 'F5': { code: 'F5', vk: 116 },
  };
  const mapped = keyMap[key] || { code: 'Key' + key.toUpperCase(), vk: key.toUpperCase().charCodeAt(0) };
  await c.Input.dispatchKeyEvent({ type: 'keyDown', modifiers: mod, key, code: mapped.code, windowsVirtualKeyCode: mapped.vk });
  await c.Input.dispatchKeyEvent({ type: 'keyUp', key, code: mapped.code });
  return { success: true, key, modifiers: modifiers || [] };
}

export async function typeText({ text }) {
  const c = await getClient();
  await c.Input.insertText({ text });
  return { success: true, typed: text.substring(0, 100), length: text.length };
}

export async function hover({ by, value }) {
  const coords = await evaluate(`
    (function() {
      var by = ${JSON.stringify(by)};
      var value = ${JSON.stringify(value)};
      var el = null;
      if (by === 'aria-label') {
        el = document.querySelector('[aria-label="' + value.replace(/"/g, '\\\\"') + '"]');
        if (!el) el = document.querySelector('[aria-label*="' + value.replace(/"/g, '\\\\"') + '"]');
      }
      else if (by === 'data-name') el = document.querySelector('[data-name="' + value.replace(/"/g, '\\\\"') + '"]');
      else if (by === 'text') {
        // Robust text matcher: exact → startsWith → contains (case-insensitive).
        var vLower = value.toLowerCase();
        var candidates = document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], span, div, label');
        function hit(el){ var t=(el.textContent||'').trim(); return t===value || t===vLower || t.startsWith(value) || t.toLowerCase().indexOf(vLower)>=0; }
        for (var i = 0; i < candidates.length; i++) { if (candidates[i].offsetParent!==null && (candidates[i].tagName==='BUTTON'||candidates[i].tagName==='A'||candidates[i].getAttribute('role')) && candidates[i].children.length===0 && hit(candidates[i])) { el = candidates[i]; break; } }
        if (!el) for (var j = 0; j < candidates.length; j++) { if (candidates[j].offsetParent!==null && hit(candidates[j]) && candidates[j].children.length<10) { el = candidates[j]; break; } }
      } else if (by === 'class-contains') el = document.querySelector('[class*="' + value.replace(/"/g, '\\\\"') + '"]');
      if (!el) return null;
      var rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, tag: el.tagName.toLowerCase() };
    })()
  `);
  if (!coords) throw new Error('Element not found for ' + by + '="' + value + '"');
  const c = await getClient();
  await c.Input.dispatchMouseEvent({ type: 'mouseMoved', x: coords.x, y: coords.y });
  return { success: true, hovered: { by, value, tag: coords.tag, x: coords.x, y: coords.y } };
}

export async function scroll({ direction, amount }) {
  const c = await getClient();
  const px = amount || 300;
  const center = await evaluate(`
    (function() {
      var el = document.querySelector('[data-name="pane-canvas"]') || document.querySelector('[class*="chart-container"]') || document.querySelector('canvas');
      if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      var rect = el.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()
  `);
  let deltaX = 0, deltaY = 0;
  if (direction === 'up') deltaY = -px; else if (direction === 'down') deltaY = px;
  else if (direction === 'left') deltaX = -px; else if (direction === 'right') deltaX = px;
  await c.Input.dispatchMouseEvent({ type: 'mouseWheel', x: center.x, y: center.y, deltaX, deltaY });
  return { success: true, direction, amount: px };
}

export async function mouseClick({ x, y, button, double_click }) {
  const c = await getClient();
  const btn = button === 'right' ? 'right' : button === 'middle' ? 'middle' : 'left';
  const btnNum = btn === 'right' ? 2 : btn === 'middle' ? 1 : 0;
  await c.Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
  await c.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: btn, buttons: btnNum, clickCount: 1 });
  await c.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: btn });
  if (double_click) {
    await new Promise(r => setTimeout(r, 50));
    await c.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: btn, buttons: btnNum, clickCount: 2 });
    await c.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: btn });
  }
  return { success: true, x, y, button: btn, double_click: !!double_click };
}

export async function findElement({ query, strategy }) {
  const strat = strategy || 'text';
  const results = await evaluate(`
    (function() {
      var query = ${JSON.stringify(query)};
      var strategy = ${JSON.stringify(strat)};
      var results = [];
      if (strategy === 'css') {
        var els = document.querySelectorAll(query);
        for (var i = 0; i < Math.min(els.length, 20); i++) {
          var rect = els[i].getBoundingClientRect();
          results.push({ tag: els[i].tagName.toLowerCase(), text: (els[i].textContent || '').trim().substring(0, 80), aria_label: els[i].getAttribute('aria-label') || null, data_name: els[i].getAttribute('data-name') || null, x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: els[i].offsetParent !== null });
        }
      } else if (strategy === 'aria-label') {
        var els = document.querySelectorAll('[aria-label*="' + query.replace(/"/g, '\\\\"') + '"]');
        for (var i = 0; i < Math.min(els.length, 20); i++) {
          var rect = els[i].getBoundingClientRect();
          results.push({ tag: els[i].tagName.toLowerCase(), text: (els[i].textContent || '').trim().substring(0, 80), aria_label: els[i].getAttribute('aria-label') || null, data_name: els[i].getAttribute('data-name') || null, x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: els[i].offsetParent !== null });
        }
      } else {
        // text strategy: collect all matching elements, then sort so that
        // interactive / leaf elements appear first (more useful to callers).
        var all = document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], input, select, label, span, div, h1, h2, h3, h4');
        var matches = [];
        for (var i = 0; i < all.length; i++) {
          var text = all[i].textContent.trim();
          if (text.toLowerCase().indexOf(query.toLowerCase()) !== -1 && text.length < 200 && all[i].offsetParent !== null) {
            var rect = all[i].getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              matches.push({ el: all[i], tag: all[i].tagName.toLowerCase(), text: text, role: all[i].getAttribute('role'), al: all[i].getAttribute('aria-label'), dn: all[i].getAttribute('data-name'), children: all[i].children.length, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
            }
          }
        }
        matches.sort(function(a, b){
          // Priority: BUTTON/A/role=button first, then small leaf elements, then anything else
          var score = function(m){
            if (m.tag==='button' || m.tag==='a' || m.role) return 0;
            if (m.children === 0) return 1;
            return 2;
          };
          return score(a) - score(b);
        });
        for (var k = 0; k < Math.min(matches.length, 20); k++) {
          var m = matches[k];
          results.push({ tag: m.tag, text: m.text.substring(0, 80), aria_label: m.al, data_name: m.dn, x: m.x, y: m.y, width: m.width, height: m.height, visible: true });
        }
      }
      return results;
    })()
  `);
  return { success: true, query, strategy: strat, count: results?.length || 0, elements: results || [] };
}

export async function uiEvaluate({ expression }) {
  const result = await evaluate(expression);
  return { success: true, result };
}
