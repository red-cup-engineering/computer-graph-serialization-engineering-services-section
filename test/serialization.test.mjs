import test from 'node:test';
import assert from 'node:assert/strict';
import { statementSequenceDiagram, witnessLedgerSequenceDiagram } from '../src/diagram-sequence.mjs';
import { plantUmlProjector, readPlantUml, writePlantUml } from '../src/plantuml.mjs';
import { presentedCategoryDiagram } from '../src/presented-category.mjs';
import { decodeFeatherGGraphCollection, encodeFeatherGGraphCollection, decodeFeatherGEmbeddingCsv } from '../src/feather-g-codec.mjs';

test('both sequence formats preserve persisted rows, witnesses and numeric tick order', () => {
  const rows = [
    {e:'crew',a:'deliver',v:{name:'Café "Ferry"'},t:10},
    {e:'crew',a:'load',v:'boxes',t:9},
  ];
  for (const project of [statementSequenceDiagram,witnessLedgerSequenceDiagram]) {
    const graph = project(rows);
    assert.deepEqual(graph.morphisms.map(m => m.label), ['load','deliver']);
    const text = writePlantUml(graph);
    const resource = {path:'route.puml',content:text};
    assert.equal(plantUmlProjector.recognize(resource), true);
    assert.deepEqual(plantUmlProjector.read(resource), [graph]);
    assert.equal(plantUmlProjector.write([graph]), text);
    assert.deepEqual(readPlantUml(text), graph);
    assert.equal(graph.morphisms[0].detail, 'value boxes at 9');
    assert.equal(graph.morphisms[1].detail, 'value {"name":"Café \\"Ferry\\""} at 10');
    assert.deepEqual(project([...rows].reverse()),graph);
  }
  assert.equal(statementSequenceDiagram(rows).morphisms[0].id, 'statement:{"a":"load","e":"crew","t":9,"v":"boxes"}');
  assert.match(witnessLedgerSequenceDiagram(rows).morphisms[0].id, /^witness:ni:\/\/\/sha-256;/u);
  assert.throws(() => presentedCategoryDiagram({objects:[],morphisms:'missing'}));
});

test('FEATHER-G encodes witnessed occurrences, retains the lossy sidecar, and reads the numbered embedding', () => {
  const position = (performed,side) => ({performed,side});
  const first = position('first','token'), second = position('second','claim');
  const source = [
    {occurrence:'w1',sourceRecord:'record-A',cell:{subject:first,predicate:'next',object:second}},
    {occurrence:'w2',sourceRecord:'record-B',cell:{subject:second,predicate:'touch',object:first}},
  ];
  const projected = encodeFeatherGGraphCollection([{
    source, selectors:{axialPredicate:'next',transversePredicate:'touch'},
  }], {projection:'undirected-simple'});
  assert.deepEqual(projected.graphs['0'],[[0,1]]);
  assert.deepEqual(projected.receipts[0].edgeGroups[0].originalDirectedOccurrences.map(e => e.sourceRecord),['record-A','record-B']);
  const received = decodeFeatherGGraphCollection(JSON.stringify(projected.graphs));
  assert.deepEqual(received.graphs[0].vertices,[0,1]);
  const read = decodeFeatherGEmbeddingCsv('id,x_0,x_1\n0.0,0.5,-2',received,{order:1,evalPoints:1});
  assert.deepEqual(read.embeddings[0].values,[0.5,-2]);
  assert.throws(() => decodeFeatherGGraphCollection({'0':[[0,1],[1,0]]}),/duplicate/);
  assert.throws(() => encodeFeatherGGraphCollection([{graph:{}}], {projection:'undirected-simple'}), /readmission failed/);
});
