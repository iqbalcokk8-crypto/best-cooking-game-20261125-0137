// DAPUR SENJA — the hand-in program (Node 22, standard library only).
// It gathers the game and its screenshots from beside this file, writes
// them to /output (or MAKEFUN_OUTPUT_DIR outside the grader), and writes
// /output/dossier.json with the vendored make.fun library, so the judge
// reads the screenshots and the source outline from one deterministic file.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

function repoRoot() {
  return fileURLToPath(new URL('.', import.meta.url));
}

function outputDir() {
  return process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function writeDossierFile(out) {
  const dossier = buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(out, 'dossier.json'), dossier);
}

function handIn() {
  const here = repoRoot();
  const out = outputDir();
  mkdirSync(out, { recursive: true });
  copyTree(join(here, 'game'), join(out, 'game'));
  if (existsSync(join(here, 'screenshots'))) {
    copyTree(join(here, 'screenshots'), join(out, 'screenshots'));
  }
  writeDossierFile(out);
}

handIn();
