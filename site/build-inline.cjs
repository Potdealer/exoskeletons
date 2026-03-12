#!/usr/bin/env node
/**
 * Build script: inlines shared CSS and JS into each HTML page
 * for deployment to storedon.net (Net Protocol onchain storage).
 *
 * Usage: node build-inline.js [page1.html page2.html ...]
 * If no pages specified, builds all HTML files in site/.
 * Output: site/dist/<filename>
 */

const fs = require('fs');
const path = require('path');

const SITE_DIR = __dirname;
const DIST_DIR = path.join(SITE_DIR, 'dist');
const SHARED_DIR = path.join(SITE_DIR, 'shared');

// Read shared files
const sharedFiles = {
  'shared/exo-style.css': fs.readFileSync(path.join(SHARED_DIR, 'exo-style.css'), 'utf-8'),
  'shared/exo-core.js': fs.readFileSync(path.join(SHARED_DIR, 'exo-core.js'), 'utf-8'),
  'shared/exo-ui.js': fs.readFileSync(path.join(SHARED_DIR, 'exo-ui.js'), 'utf-8'),
};

function inlineHtml(html) {
  // Replace <link rel="stylesheet" href="shared/exo-style.css"> with inline <style>
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="shared\/exo-style\.css"\s*\/?>/,
    `<style>\n${sharedFiles['shared/exo-style.css']}\n</style>`
  );

  // Replace <script src="shared/exo-core.js"></script> with inline <script>
  html = html.replace(
    /<script\s+src="shared\/exo-core\.js"><\/script>/,
    `<script>\n${sharedFiles['shared/exo-core.js']}\n</script>`
  );

  // Replace <script src="shared/exo-ui.js"></script> with inline <script>
  html = html.replace(
    /<script\s+src="shared\/exo-ui\.js"><\/script>/,
    `<script>\n${sharedFiles['shared/exo-ui.js']}\n</script>`
  );

  return html;
}

// Determine which pages to build
let pages = process.argv.slice(2);
if (pages.length === 0) {
  pages = fs.readdirSync(SITE_DIR).filter(f => f.endsWith('.html'));
}

// Create dist directory
if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR);

for (const page of pages) {
  const srcPath = path.join(SITE_DIR, page);
  if (!fs.existsSync(srcPath)) {
    console.error(`  SKIP: ${page} (not found)`);
    continue;
  }

  const html = fs.readFileSync(srcPath, 'utf-8');
  const inlined = inlineHtml(html);
  const outPath = path.join(DIST_DIR, page);
  fs.writeFileSync(outPath, inlined, 'utf-8');

  const sizeKB = (Buffer.byteLength(inlined, 'utf-8') / 1024).toFixed(1);
  console.log(`  BUILT: ${page} → dist/${page} (${sizeKB} KB)`);
}

console.log('\nDone. Inlined pages in site/dist/');
