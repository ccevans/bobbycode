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

export function renderSkillTemplates(destDir, data) {
  const skillsTemplateDir = path.join(TEMPLATES_DIR, 'skills');
  const skills = fs.readdirSync(skillsTemplateDir);

  for (const skill of skills) {
    const skillSrcDir = path.join(skillsTemplateDir, skill);
    const skillDestDir = path.join(destDir, skill);
    fs.mkdirSync(skillDestDir, { recursive: true });

    const files = fs.readdirSync(skillSrcDir);
    for (const file of files) {
      const srcFile = path.join(skillSrcDir, file);
      if (file.endsWith('.ejs')) {
        const destFile = path.join(skillDestDir, file.replace('.ejs', ''));
        const rendered = ejs.render(fs.readFileSync(srcFile, 'utf8'), data, { filename: srcFile });
        fs.writeFileSync(destFile, rendered, 'utf8');
      } else {
        fs.copyFileSync(srcFile, path.join(skillDestDir, file));
      }
    }
  }
}
