import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeFeatherGGraphCollection,
  encodeFeatherGGraphCollection,
  decodeFeatherGEmbeddingCsv,
} from '../src/feather-g-codec.mjs';

const role = (performed, side) => ({ performed, side });
const source = [
  { occurrence: 'o1', sourceRecord: 'r1', cell: { subject: role('a', 'token'), predicate: 'axial', object: role('b', 'token') } },
  { occurrence: 'o2', sourceRecord: 'r2', cell: { subject: role('b', 'token'), predicate: 'axial', object: role('c', 'token') } },
  { occurrence: 'o3', sourceRecord: 'r3', cell: { subject: role('a', 'token'), predicate: 'across', object: role('c', 'token') } },
];
const selectors = { axialPredicate: 'axial', transversePredicate: 'across' };

test('decodeFeatherGGraphCollection reads edge lists from JSON text and objects', () => {
  const fromText = decodeFeatherGGraphCollection('{"0":[[1,0],[1,2]],"1":[[0,1]]}');
  assert.equal(fromText.kind, 'signgraph.featherG.structuralCollection.v1');
  assert.equal(fromText.graphs.length, 2);
  assert.deepEqual(fromText.graphs[0].vertices, [0, 1, 2]);
  assert.deepEqual(fromText.graphs[0].incidences.map(i => i.endpoints), [[0, 1], [1, 2]]);
  assert.equal(fromText.graphs[0].directed, false);
  const fromObject = decodeFeatherGGraphCollection({ 0: [[0, 1]] });
  assert.equal(fromObject.graphs[0].incidences.length, 1);
  assert.ok(Object.isFrozen(fromObject));
});

test('decodeFeatherGGraphCollection refuses invalid wire data', () => {
  assert.throws(() => decodeFeatherGGraphCollection('not json'), /graphs must be valid JSON/);
  assert.throws(() => decodeFeatherGGraphCollection({ 0: [[0, 0]] }), /self-loops/);
  assert.throws(() => decodeFeatherGGraphCollection({ 0: [[0, 1], [1, 0]] }), /duplicate undirected edge/);
  assert.throws(() => decodeFeatherGGraphCollection({ 0: [[0, 2]] }), /no gaps/);
  assert.throws(() => decodeFeatherGGraphCollection({ 1: [[0, 1]] }), /consecutive/);
});

test('encodeFeatherGGraphCollection projects a feather source and records the loss', () => {
  const out = encodeFeatherGGraphCollection([{ source, selectors }], { projection: 'undirected-simple' });
  assert.equal(out.kind, 'signgraph.featherG.exportProjection.v1');
  assert.deepEqual(out.graphs['0'], [[0, 1], [0, 2], [1, 2]]);
  assert.equal(out.receipts.length, 1);
  assert.equal(out.receipts[0].edgeGroups.length, 3);
  assert.ok(out.receipts[0].projectionLoss.includes('direction'));
  // The exported graphs decode back as a structural collection.
  assert.equal(decodeFeatherGGraphCollection(out.graphs).graphs[0].vertices.length, 3);
});

test('encodeFeatherGGraphCollection refuses a missing projection and bad entries', () => {
  assert.throws(() => encodeFeatherGGraphCollection([{ source, selectors }]), /must explicitly select projection/);
  assert.throws(() => encodeFeatherGGraphCollection([], { projection: 'undirected-simple' }), /requires 1-128/);
  assert.throws(() => encodeFeatherGGraphCollection([{ source }], { projection: 'undirected-simple' }),
    /needs both source occurrences and predicate selectors/);
});

test('decodeFeatherGEmbeddingCsv attaches descriptors to decoded graphs', () => {
  const graphs = decodeFeatherGGraphCollection({ 0: [[0, 1]], 1: [[0, 1], [1, 2]] });
  const model = { order: 1, evalPoints: 2 };
  const csv = 'id,x_0,x_1,x_2,x_3\n0.0,1,2,3,4\n1,0.5,-1,.25,1e2\n';
  const out = decodeFeatherGEmbeddingCsv(csv, graphs, model);
  assert.equal(out.kind, 'signgraph.featherG.graphDescriptors.v1');
  assert.deepEqual(out.embeddings.map(e => e.graphIndex), [0, 1]);
  assert.deepEqual(out.embeddings[1].values, [0.5, -1, 0.25, 100]);
  assert.equal(out.declaredModel.pooling, 'mean');
});

test('decodeFeatherGEmbeddingCsv refuses mismatched or non-numeric CSV', () => {
  const graphs = decodeFeatherGGraphCollection({ 0: [[0, 1]] });
  const model = { order: 1, evalPoints: 1 };
  assert.throws(() => decodeFeatherGEmbeddingCsv('id,x_0\n0,1\n', graphs, model), /matching declared model width/);
  assert.throws(() => decodeFeatherGEmbeddingCsv('id,x_0,x_1\n0,1,abc\n', graphs, model), /nonnumeric/);
  assert.throws(() => decodeFeatherGEmbeddingCsv('id,x_0,x_1\n0,1,2\n1,1,2\n', graphs, model), /row count/);
  assert.throws(() => decodeFeatherGEmbeddingCsv('id,x_0,x_1\n0,1,2\n', graphs, { order: 0 }), /invalid FEATHER-G model/);
});
