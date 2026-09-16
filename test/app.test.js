const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('dashboard exposes clear filter feedback elements', () => {
    assert.match(html, /id="result-summary"/);
    assert.match(html, /id="data-status"/);
    assert.match(html, /aria-live="polite"/);
});

test('dashboard does not load the Tailwind runtime', () => {
    assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
});

test('chart updates reuse existing instances without destroying them', () => {
    assert.match(app, /const existingChart = state\.charts\[chartId\];/);
    assert.match(app, /existingChart\.update\('none'\);/);
    assert.doesNotMatch(app, /existingChart\.destroy\(\);/);
});