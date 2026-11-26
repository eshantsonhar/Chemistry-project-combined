const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const publicDirectory = path.join(projectRoot, 'public');
const atomMakerDirectory = path.join(projectRoot, 'apps', 'atommaker');
const atomMakerOutput = path.join(atomMakerDirectory, 'dist');

function runNodeScript(scriptPath, workingDirectory) {
  execFileSync(process.execPath, [scriptPath], {
    cwd: workingDirectory,
    stdio: 'inherit'
  });
}

function installThemeAssets(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      installThemeAssets(entryPath);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.html') {
      continue;
    }

    let html = fs.readFileSync(entryPath, 'utf8');
    html = html
      .replace(/href=["']\.\.\/site\/theme\.css["']/gi, 'href="/theme.css"')
      .replace(/src=["']\.\.\/site\/theme\.js["']/gi, 'src="/theme.js"');
    if (!/<link[^>]+rel=["'][^"']*icon/i.test(html)) {
      html = html.replace(/<\/head>/i, '  <link rel="icon" type="image/svg+xml" href="/favicon.svg">\n</head>');
    }
    if (!/href=["']\/theme\.css["']/i.test(html)) {
      html = html.replace(/<\/head>/i, '  <link rel="stylesheet" href="/theme.css">\n</head>');
    }
    if (!/src=["']\/theme\.js["']/i.test(html)) {
      html = html.replace(/<\/head>/i, '  <script src="/theme.js" defer></script>\n</head>');
    }
    fs.writeFileSync(entryPath, html);
  }
}

fs.rmSync(publicDirectory, { recursive: true, force: true });
fs.mkdirSync(publicDirectory, { recursive: true });

console.log('Preparing AtomView pages and the chemistry API runtime...');
runNodeScript(path.join(projectRoot, 'scripts', 'prepare-vercel-runtime.js'), projectRoot);

console.log('Building the complete Atommaker experience...');
runNodeScript(path.join(atomMakerDirectory, 'build-site.cjs'), atomMakerDirectory);
if (!fs.existsSync(atomMakerOutput)) {
  throw new Error('Atommaker did not create its expected dist output.');
}
fs.cpSync(atomMakerOutput, publicDirectory, { recursive: true });

console.log('Adding the ChemistryX landing page and shared theme controls...');
fs.copyFileSync(path.join(projectRoot, 'index.html'), path.join(publicDirectory, 'index.html'));
for (const asset of ['theme.css', 'theme.js', 'launcher.css', 'favicon.svg']) {
  fs.copyFileSync(path.join(projectRoot, 'site', asset), path.join(publicDirectory, asset));
}
const imageDirectory = path.join(publicDirectory, 'images');
fs.mkdirSync(imageDirectory, { recursive: true });
for (const image of ['atommaker-homepage.jpg', 'atomview-homepage.jpg']) {
  fs.copyFileSync(path.join(projectRoot, 'site', image), path.join(imageDirectory, image));
}
installThemeAssets(publicDirectory);

console.log('ChemistryX is ready in public/.');