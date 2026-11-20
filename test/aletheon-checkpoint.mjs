/** Run with the Aletheon checkout path and the normal checkout resolver. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { statementSequenceDiagram, witnessLedgerSequenceDiagram } from '../src/diagram-sequence.mjs';
import { readPlantUml, writePlantUml } from '../src/plantuml.mjs';

if (!process.argv[2]) throw new Error('Pass the Aletheon checkout path');
const title = resolve(process.argv[2]);
const worldModule = name => import(pathToFileURL(join(title, 'server/world', name)));
const { readWorld, saveWorld } = await worldModule('checkpoint.mjs');
const { tick } = await worldModule('ticking.mjs');
const { stake } = await worldModule('claims.mjs');

const scratch = await mkdtemp(join(tmpdir(), 'aletheon-sequence-'));
try {
  const checkpoint = join(scratch, 'world.bin');
  const fixture = await readFile(join(title, 'test/fixtures/contested-altar.bin.gz'));
  await writeFile(checkpoint, gunzipSync(fixture));
  const world = readWorld(checkpoint);
  const historical = [...world.journal];
  assert.equal(historical.length, 5);
  assert.equal(world.tick, 9);

  tick(world);
  const decision = stake(world, world.entities.get('altar-2'), world.entities.get('player-1'), 'abstain');
  assert.deepEqual(decision, { ok: true, state: 'unknown' });
  saveWorld(checkpoint, world);
  const restored = readWorld(checkpoint);
  assert.equal(restored.tick, 10);
  assert.equal(restored.entities.get('player-1').marks, 2);
  assert.equal(restored.journal.length, 13);
  for (const project of [statementSequenceDiagram, witnessLedgerSequenceDiagram]) {
    const diagram = project(restored.journal);
    assert.deepEqual(diagram.morphisms.slice(0, historical.length), project(historical).morphisms);
    assert.ok(diagram.morphisms.slice(historical.length).every(message => message.detail.endsWith(' at 10')));
    assert.deepEqual(readPlantUml(writePlantUml(diagram)), diagram);
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
