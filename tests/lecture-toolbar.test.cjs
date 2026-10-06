const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
const css = fs.readFileSync(__dirname + '/../css/app.css', 'utf8');

test('lecture toolbar measures the header and keeps a reversible compact state', () => {
  const vars = {}, stored = {};
  let collapsed = false;
  const bar = {
    classList: { toggle(name) { assert.equal(name, 'collapsed'); collapsed = !collapsed; return collapsed; } },
    getBoundingClientRect() { return { height: collapsed ? 40 : 170 }; }
  };
  const button = { textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const document = {
    addEventListener() {},
    documentElement: { style: { setProperty(k, v) { vars[k] = v; } } },
    getElementById(id) {
      return { topbar: { getBoundingClientRect: () => ({ height: 76 }) },
        lectbar: bar, lectbarToggle: button }[id] || null;
    }
  };
  const ZS = { data: {} }, window = { ZS };
  vm.runInNewContext(app, { window, ZS, document, localStorage: { getItem(k) { return stored[k]; }, setItem(k, v) { stored[k] = v; } }, Date, console });
  window.ZS_LECTBAR();
  assert.equal(vars['--topbar-height'], '76px');
  assert.equal(vars['--lectbar-height'], '40px');
  assert.equal(button.attrs['aria-expanded'], 'false');
  assert.equal(stored['zz720.lectbarCollapsed'], '1');
  window.ZS_LECTBAR();
  assert.equal(vars['--lectbar-height'], '170px');
  assert.equal(button.attrs['aria-expanded'], 'true');
  assert.equal(stored['zz720.lectbarCollapsed'], '0');
  assert.match(css, /top:calc\(var\(--topbar-height/);
  assert.match(css, /scroll-margin-top:calc\(var\(--topbar-height/);
});
