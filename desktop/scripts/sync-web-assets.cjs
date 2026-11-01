const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'desktop/dist');
const destination = path.join(root, 'src/telegram_bot_control/web_assets');
if (!fs.existsSync(path.join(source, 'index.html'))) throw new Error('Build the frontend first');
// Only this generated directory is replaced; it never contains bot data.
if (!destination.startsWith(root + path.sep) || path.basename(destination) !== 'web_assets')
  throw new Error('Invalid generated-assets path');
fs.mkdirSync(destination, { recursive: true });
if (
  fs.lstatSync(destination).isSymbolicLink() ||
  !fs.realpathSync(destination).startsWith(fs.realpathSync(root) + path.sep)
)
  throw new Error('Generated assets must stay in the checkout');
for (const name of fs.readdirSync(destination)) {
  const target = path.join(destination, name);
  if (!fs.realpathSync(target).startsWith(fs.realpathSync(destination) + path.sep))
    throw new Error('Generated child escaped its directory');
  fs.rmSync(target, { recursive: true, force: true });
}
fs.cpSync(source, destination, { recursive: true });
const license = path.join(root, 'desktop/node_modules/@fontsource-variable/inter/LICENSE');
fs.copyFileSync(license, path.join(destination, 'INTER-LICENSE.txt'));
fs.copyFileSync(license, path.join(root, 'desktop/assets/INTER-LICENSE.txt'));
const notices = ['react', 'react-dom', 'lucide-react']
  .map(
    (name) =>
      name +
      '\n' +
      '='.repeat(name.length) +
      '\n' +
      fs.readFileSync(path.join(root, 'desktop/node_modules', name, 'LICENSE'), 'utf8'),
  )
  .join('\n\n');
fs.writeFileSync(path.join(destination, 'WEB-LIBRARY-LICENSES.txt'), notices);
fs.writeFileSync(path.join(root, 'desktop/assets/WEB-LIBRARY-LICENSES.txt'), notices);
console.log('Synced standalone web assets for Python wheel/source distribution.');
