// lib/targets/cline.js
import fs from 'fs';
import path from 'path';

export default {
  name: 'cline',

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

  scaffoldExtras(rootDir) {
    const content = `.bobby/\n.bobbyrc.yml\n`;
    fs.writeFileSync(path.join(rootDir, '.clineignore'), content, 'utf8');
  },
};
