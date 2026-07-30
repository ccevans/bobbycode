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
