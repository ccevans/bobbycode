// lib/targets/cline.js
import fs from 'fs';
import path from 'path';

export default {
  name: 'cline',

  displayName() {
    return 'Cline';
  },

  paths() {
    return {
      agents: '.clinerules/agents',
      skills: '.clinerules/skills',
      commands: '.clinerules/workflows',
      rules: '.clinerules/rules.md',
    };
  },

  supportsSubagents() {
    return false;
  },

  promptHint() {
    return 'Copy this prompt into Cline:';
  },

  keepsCommandFrontmatter() {
    // HISTORICAL behavior, unverified against a Cline binary: workflows ship
    // with the claude frontmatter intact. Declared so the matrix pins what IS,
    // and a deliberate change here fails a test instead of drifting.
    return true;
  },

  transformCommand(content) {
    return content;
  },

  extraPaths() {
    return ['.clineignore'];
  },

  scaffoldExtras(rootDir) {
    const content = `.bobby/\n.bobbyrc.yml\n`;
    fs.writeFileSync(path.join(rootDir, '.clineignore'), content, 'utf8');
  },
};
