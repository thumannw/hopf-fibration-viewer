// Bundle the app and its dependencies into one portable, offline HTML file.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const result = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'inline',
  write: false,
});
const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const [template, styles, license, metadata] = await Promise.all([
  readFile(new URL('src/index.html', root), 'utf8'),
  readFile(new URL('src/styles.css', root), 'utf8'),
  readFile(new URL('../LICENSE', import.meta.resolve('three')), 'utf8'),
  readFile(new URL('../package.json', import.meta.resolve('three')), 'utf8'),
]);
const html = template
  .replace('/* APP_STYLES */', () => styles)
  .replace('/* APP_SCRIPT */', () => script)
  + `\n<!-- Third-party license: Three.js ${JSON.parse(metadata).version}\n${license}\n-->\n`;
await writeFile(new URL('index.html', root), html);
console.log(`Built index.html (${Buffer.byteLength(html).toLocaleString('en-US')} bytes). Open it directly in a browser.`);
