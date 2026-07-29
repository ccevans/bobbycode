// commands/skill.js
//
// `bobby skill create <name>` — scaffold a custom skill that plugs into
// everything Bobby already does with skills, with the naming rules enforced
// instead of documented:
//   - kebab-case, verb-noun preferred (deploy-check, review-copy)
//   - the `bobby-` prefix is reserved for core; refresh prunes that namespace
//   - the folder is entirely user-owned: refresh and upgrade never touch it
import fs from 'fs';
import path from 'path';
import { findProjectRoot, readConfig } from '../lib/config.js';
import { success, error, bold, dim } from '../lib/colors.js';
import { getTarget } from '../lib/targets/index.js';

const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function skillTemplate(name, description) {
  return `---
name: ${name}
description: "${description} MANDATORY TRIGGERS: ${name.replace(/-/g, ' ')}."
---

# ${name}

> One line on what this skill produces and when to reach for it.

## Before Starting

1. Read \`learnings.local.md\` in this folder — anti-patterns this project has hit.

## Process

1. Describe the first step.
2. Then the next.

## Completing Work

- What done looks like, and what to report back.
`;
}

function agentTemplate(name, skillsPath) {
  return `---
name: ${name}
description: Runs the ${name} skill.
---

You are **${name}**, a custom agent for this project.

## Instructions

Load and follow \`${skillsPath}/${name}/SKILL.md\`.
Read \`${skillsPath}/${name}/learnings.local.md\` before starting.
`;
}

export function registerSkill(program) {
  const skill = program
    .command('skill')
    .description('Create custom skills that plug into Bobby');

  skill
    .command('create <name> [description...]')
    .description('Scaffold a custom skill (kebab-case name; `bobby-` prefix is reserved for core)')
    .option('--agent', 'Also create a matching agent so `bobby run <name>` dispatches it')
    .action((name, descriptionWords, opts) => {
      try {
        if (!NAME_RE.test(name)) {
          error(`Invalid name '${name}'. Use kebab-case: lowercase letters, digits, single hyphens (e.g. deploy-check).`);
          process.exit(1);
        }
        if (name.startsWith('bobby-') || name === 'bobby') {
          error(`The 'bobby-' prefix is reserved for shipped skills — refresh prunes that namespace. Pick another name.`);
          process.exit(1);
        }

        const root = findProjectRoot();
        const config = readConfig(root);
        const tp = getTarget(config.target || 'claude-code').paths();
        const skillDir = path.join(root, tp.skills, name);

        if (fs.existsSync(skillDir)) {
          error(`${tp.skills}/${name}/ already exists.`);
          process.exit(1);
        }

        const description = (descriptionWords || []).join(' ') || `Custom ${name.replace(/-/g, ' ')} skill.`;

        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillTemplate(name, description), 'utf8');
        fs.writeFileSync(
          path.join(skillDir, 'learnings.local.md'),
          `# ${name} — This Project's Learnings\n\n## Anti-Patterns\n<!-- bobby learn ${name} "pattern" "description" to add entries -->\n`,
          'utf8'
        );
        success(`Created ${tp.skills}/${name}/ (yours — refresh and upgrade never touch it)`);

        if (opts.agent) {
          const agentPath = path.join(root, tp.agents, `${name}.md`);
          if (fs.existsSync(agentPath)) {
            error(`${tp.agents}/${name}.md already exists — skill created, agent skipped.`);
          } else {
            fs.mkdirSync(path.dirname(agentPath), { recursive: true });
            fs.writeFileSync(agentPath, agentTemplate(name, tp.skills), 'utf8');
            success(`Created ${tp.agents}/${name}.md`);
          }
        }

        console.log('');
        console.log(`  Next: edit ${bold(`${tp.skills}/${name}/SKILL.md`)} — the description's triggers decide when it activates.`);
        if (opts.agent) {
          console.log(`  Run it: ${bold(`bobby run ${name}`)} (or \`bobby run ${name} TKT-001\` against a ticket)`);
        } else {
          console.log(`  ${dim(`Want \`bobby run ${name}\`? Re-run with --agent, or add ${tp.agents}/${name}.md yourself.`)}`);
        }
        console.log(`  ${dim(`\`bobby learn ${name} "pattern" "description"\` records learnings for it.`)}`);
        console.log('');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });

  return skill;
}
