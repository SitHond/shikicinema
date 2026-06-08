const fs = require('fs');
const path = require('path');

const remotePolyfillUrl = 'https://cdn.jsdelivr.net/gh/MurhafSousli/ngx-scrollbar@19.1.0/projects/ngx-scrollbar/src/assets/scroll-timeline-polyfill.js';
const localPolyfillUrl = 'assets/scroll-timeline-polyfill.js';
const targets = [
  path.resolve(__dirname, '..', 'node_modules', 'ngx-scrollbar', 'fesm2022', 'ngx-scrollbar.mjs'),
  path.resolve(__dirname, '..', 'node_modules', 'ngx-scrollbar', 'fesm2022', 'ngx-scrollbar.mjs.map'),
];

for (const target of targets) {
  if (!fs.existsSync(target)) {
    continue;
  }

  const content = fs.readFileSync(target, 'utf8');
  const patchedContent = content.split(remotePolyfillUrl).join(localPolyfillUrl);

  if (patchedContent !== content) {
    fs.writeFileSync(target, patchedContent);
    console.log(`Patched ngx-scrollbar remote polyfill URL in ${path.relative(process.cwd(), target)}`);
  }
}
