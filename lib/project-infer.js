// lib/project-infer.js
// Studio: a ticket ID names its project (RF-12 -> the project whose prefix is RF),
// so a ticket command needs no `bobby project use` first (TKT-084).
import { listStudioProjects, configForProject } from './config.js';

const ID_RE = /^([A-Za-z]+)-\d+$/;

// Arguments that are ticket IDs by name. Anything else (sprint/pack/session IDs,
// free text for do/vet/new) is never read, so `utf-8` or `SPR-001` can't become
// a false "unknown prefix" error.
const ID_ARGS_ANY_COMMAND = ['ticketIds', 'epicId'];
const ID_ARGS_UNDER = { ticket: ['id', 'ids'], worktree: ['id', 'ids'] };

function flat(v) {
  return (Array.isArray(v) ? v : [v]).filter(x => typeof x === 'string');
}

/**
 * The ticket IDs a parsed command names, read from commander's `actionCommand`.
 * Returns [] when commander's internals aren't there (never throws).
 */
export function ticketIdsFromCommand(cmd) {
  const defs = cmd && cmd.registeredArguments;
  const values = cmd && cmd.processedArgs;
  const found = [];
  if (Array.isArray(defs) && Array.isArray(values)) {
    const parent = cmd.parent && cmd.parent.name();
    const name = cmd.name();
    defs.forEach((def, i) => {
      const argName = def.name();
      const wanted =
        ID_ARGS_ANY_COMMAND.includes(argName) ||
        (ID_ARGS_UNDER[parent] || []).includes(argName) ||
        (name === 'retro' && argName === 'id') ||
        // `go <what...>`: one word is a ticket ID, more is a title (mirrors go's own rule)
        (name === 'go' && argName === 'what' && Array.isArray(values[i]) && values[i].length === 1);
      if (wanted && values[i] != null) found.push(...flat(values[i]));
    });
  }
  const opts = (cmd && typeof cmd.opts === 'function') ? cmd.opts() : {};
  for (const k of ['parent', 'foundIn']) if (opts[k]) found.push(...flat(opts[k]));
  return found.filter(s => ID_RE.test(s));
}

/**
 * Which project do these ticket IDs belong to? null when there are none.
 * Throws an explicit error for an unknown prefix, a prefix two projects share,
 * or IDs that span projects. Never guesses.
 */
export function inferProjectFromIds(studioRoot, ids) {
  if (!ids || ids.length === 0) return null;
  const projects = listStudioProjects(studioRoot);
  const byPrefix = new Map();   // UPPER prefix -> [project]
  const prefixOf = {};
  for (const p of projects) {
    const prefix = String(configForProject(studioRoot, p).ticket_prefix || '').toUpperCase();
    prefixOf[p] = prefix;
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(p);
  }
  const resolved = new Map();   // project -> first ID that named it
  for (const id of ids) {
    const prefix = id.match(ID_RE)[1].toUpperCase();
    const owners = byPrefix.get(prefix) || [];
    if (owners.length === 0) {
      const list = projects.map(p => `${p} (${prefixOf[p]})`).join(', ');
      throw new Error(`${id}: no project in this studio uses prefix ${prefix}. Projects: ${list} — pass --project <name>`);
    }
    if (owners.length > 1) {
      throw new Error(`Prefix ${prefix} is used by more than one project (${owners.join(', ')}): pass --project <name>`);
    }
    if (!resolved.has(owners[0])) resolved.set(owners[0], id);
  }
  if (resolved.size > 1) {
    const parts = [...resolved].map(([p, id]) => `${id} is ${p}`).join(', ');
    throw new Error(`${parts}: pass --project <name>`);
  }
  return [...resolved.keys()][0];
}
