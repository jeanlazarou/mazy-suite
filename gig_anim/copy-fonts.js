import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceDir = path.join(__dirname, 'node_modules', 'khoshnus', 'public', 'fonts');
const targetDir = path.join(__dirname, 'public', 'fonts');

// Create target directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy all fonts
fs.readdirSync(sourceDir).forEach(file => {
  if (file.match(/\.(ttf|TTF|otf|OTF)$/)) {
    fs.copyFileSync(
      path.join(sourceDir, file),
      path.join(targetDir, file)
    );
    console.log(`Copied ${file} to public/fonts/`);
  }
});