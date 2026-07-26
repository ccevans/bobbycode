// lib/template.js
import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

export function renderTemplate(templateName, data) {
  const templatePath = path.join(TEMPLATES_DIR, templateName);
  const template = fs.readFileSync(templatePath, 'utf8');
  return ejs.render(template, data, { filename: templatePath });
}

export function copyStaticTemplate(templateName, destPath) {
  const src = path.join(TEMPLATES_DIR, templateName);
  fs.copyFileSync(src, destPath);
}

/**
 * Render a templates/-relative directory tree into destDir: `.ejs` files are
 * rendered (extension stripped), everything else copied verbatim. Used by the
 * starter scaffolding system.
 */
export function renderTemplateDir(templateRelDir, destDir, data) {
  renderDir(path.join(TEMPLATES_DIR, templateRelDir), destDir, data);
}

/**
 * Same rendering, but from an absolute source (a pack's `scaffolds/`) and
 * never overwriting: a pack drops in what is missing and leaves your code
 * alone. Returns the number of files written.
 */
export function renderExternalDir(srcDir, destDir, data) {
  let written = 0;
  const walk = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      const srcPath = path.join(src, entry);
      if (fs.statSync(srcPath).isDirectory()) {
        walk(srcPath, path.join(dest, entry));
        continue;
      }
      const outName = entry.endsWith('.ejs') ? entry.replace(/\.ejs$/, '') : entry;
      const outPath = path.join(dest, outName);
      if (fs.existsSync(outPath)) continue; // never clobber the user's work
      if (entry.endsWith('.ejs')) {
        fs.writeFileSync(outPath, ejs.render(fs.readFileSync(srcPath, 'utf8'), data, { filename: srcPath }), 'utf8');
      } else {
        fs.copyFileSync(srcPath, outPath);
      }
      written += 1;
    }
  };
  walk(srcDir, destDir);
  return written;
}

function renderDir(srcDir, destDir, data) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      renderDir(srcPath, path.join(destDir, entry), data);
    } else if (entry.endsWith('.ejs')) {
      const rendered = ejs.render(fs.readFileSync(srcPath, 'utf8'), data, { filename: srcPath });
      fs.writeFileSync(path.join(destDir, entry.replace('.ejs', '')), rendered, 'utf8');
    } else {
      fs.copyFileSync(srcPath, path.join(destDir, entry));
    }
  }
}

export function renderSkillTemplates(destDir, data) {
  const skillsTemplateDir = path.join(TEMPLATES_DIR, 'skills');
  const skills = fs.readdirSync(skillsTemplateDir);

  for (const skill of skills) {
    const skillSrcDir = path.join(skillsTemplateDir, skill);
    renderDir(skillSrcDir, path.join(destDir, skill), data);
  }
}
