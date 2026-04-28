import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const VENDOR_DIR = 'docs/js/vendor';

const LIBRARIES = [
  {
    name: 'marked.js',
    url: 'https://esm.sh/marked@13.0.3/es2022/marked.bundle.mjs'
  },
  {
    name: 'dompurify.js',
    url: 'https://esm.sh/dompurify@3.4.1/es2022/dompurify.bundle.mjs'
  }
];

if (!fs.existsSync(VENDOR_DIR)) {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
}

LIBRARIES.forEach(lib => {
  const dest = path.join(VENDOR_DIR, lib.name);
  console.log(`Downloading ${lib.name} from ${lib.url}...`);
  try {
    execSync(`curl -L -o ${dest} "${lib.url}"`);
    console.log(`Successfully downloaded ${lib.name}`);
  } catch (error) {
    console.error(`Failed to download ${lib.name}:`, error.message);
    process.exit(1);
  }
});

console.log('All vendor libraries updated.');
