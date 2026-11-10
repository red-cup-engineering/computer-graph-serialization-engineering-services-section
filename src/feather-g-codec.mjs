/**
 * Boundary codecs for FEATHER-G (Rozemberczki–Sarkar CIKM 2020) and SignGraph.
 *
 * FEATHER-G's graph-level wire input is a JSON object mapping consecutive
 * zero-based graph indices to *undirected* edge lists with consecutive local
 * vertex indices. It does not encode typed, directed, witnessed predications.
 *
 * Imports are structural readings, NOT native SignCells, native feather graphs,
 * source admission, or reconstructions of the original directed relations.
 * Exports only readmit supplied SignGraphs or derive the existing conditional
 * feather readout from supplied source occurrences; their sidecars are records
 * of information lost by FEATHER-G, not portable proofs of authenticity.
 */
import { featherGraphOfPredications } from '@red-cup-engineering/signgraph/feather-graph';
import { glueSignGraphs } from '@red-cup-engineering/signgraph/semantic-graph';

const freeze = Object.freeze;
const own = Object.hasOwn;
const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const idSort = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const MAX_GRAPHS = 128;
const MAX_EDGES_PER_GRAPH = 4096;
const MAX_VERTICES = 4097;
const MAX_DIMENSIONS = 32768;
const decodedCollections = new WeakSet();

function fail(why) { throw new TypeError(`FEATHER-G codec: ${why}`); }
function integer(n) { return Number.isSafeInteger(n) && n >= 0; }
function optionsOnly(value, keys, label) {
  if (!isRecord(value) || Object.keys(value).some(key => !keys.includes(key)))
    fail(`${label} has undeclared fields`);
}
const frozenArray = xs => freeze(xs);

function validateEdgeList(raw, label) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_EDGES_PER_GRAPH)
    fail(`${label}: requires 1-${MAX_EDGES_PER_GRAPH} edges; isolated nodes have no representation`);
  const occupied = new Set(), seen = new Set(), normalized = [];
  for (const edge of raw) {
    if (!Array.isArray(edge) || edge.length !== 2 || !integer(edge[0]) || !integer(edge[1]))
      fail(`${label}: each edge needs two nonnegative safe integer endpoints`);
    const [a, b] = edge[0] < edge[1] ? edge : [edge[1], edge[0]];
    if (a === b) fail(`${label}: self-loops are unsupported by this undirected-simple SignGraph projection`);
    if (b >= MAX_VERTICES) fail(`${label}: vertex index exceeds bounded work budget`);
    const key = JSON.stringify([a, b]);
    if (seen.has(key)) fail(`${label}: duplicate undirected edge (FEATHER-G would silently coalesce it)`);
    seen.add(key); occupied.add(a); occupied.add(b);
    normalized.push(frozenArray([a, b]));
  }
  const n = Math.max(...occupied) + 1;
  if (occupied.size !== n) fail(`${label}: vertex indices must start at 0 with no gaps`);
  normalized.sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  return freeze({vertices: frozenArray(Array.from({length: n}, (_,i) => i)), edges: frozenArray(normalized)});
}


/**
 * Copy ONLY inert external FEATHER-G graph wire data before inspecting edge
 * numbers. JSON text is already parsed by the ordinary JSON parser; object
 * inputs must satisfy the same finite ordinary data shape. No accessor-backed
 * source can create a new apparent edge during decoding.
 *
 * This guard is specific to the FEATHER-G external edge-list format and does
 * not replace SignCell's canonical semiotic carrier or source admission.
 * ECMAScript Proxy traps remain executable; a host security boundary is
 * required to accept hostile executable objects from another realm.
 */
function inertFeatherGCollection(source) {
  const proto = source !== null && typeof source === 'object'
    ? Object.getPrototypeOf(source) : undefined;
  if (proto !== Object.prototype && proto !== null)
    fail('graph collection must be an ordinary source JSON record');
  const records = Object.getOwnPropertyDescriptors(source);
  const keys = Reflect.ownKeys(records);
  if (keys.length < 1 || keys.length > MAX_GRAPHS ||
      keys.some(key => typeof key !== 'string' ||
        !Object.hasOwn(records[key], 'value') || !records[key].enumerable))
    fail('graph indices must be enumerable inert JSON data properties');
  const copied = Object.create(null);
  for (const key of keys) {
    const edges = records[key].value;
    if (!Array.isArray(edges) || Object.getPrototypeOf(edges) !== Array.prototype ||
        edges.length < 1 || edges.length > MAX_EDGES_PER_GRAPH)
      fail('edge lists must be ordinary bounded JSON arrays');
    const edgeProps = Object.getOwnPropertyDescriptors(edges);
    if (Reflect.ownKeys(edgeProps).length !== edges.length + 1)
      fail('edge lists cannot be sparse or decorated');
    const copyEdges = [];
    for (let index = 0; index < edges.length; index++) {
      const descriptor = edgeProps[String(index)];
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor,'value'))
        fail('edge entries must be inert enumerable array elements');
      const pair = descriptor.value;
      if (!Array.isArray(pair) || Object.getPrototypeOf(pair) !== Array.prototype ||
          pair.length !== 2)
        fail('edges must be ordinary two-endpoint arrays');
      const slots = Object.getOwnPropertyDescriptors(pair);
      if (Reflect.ownKeys(slots).length !== 3 ||
          !['0','1'].every(index => slots[index] &&
            slots[index].enumerable && Object.hasOwn(slots[index], 'value')))
        fail('edge endpoints must be inert dense array elements');
      copyEdges.push(frozenArray([slots['0'].value,slots['1'].value]));
    }
    Object.defineProperty(copied,key,{
      value:frozenArray(copyEdges),enumerable:true,
      configurable:false,writable:false
    });
  }
  return freeze(copied);
}

/**
 * Read the FEATHER-G reference graph-level JSON format into a typed SignGraph
 * structural projection. The imported indices are not SignCell identifiers,
 * and unordered input pairs do not assert source-directed predications.
 */
export function decodeFeatherGGraphCollection(input) {
  let parsed = input;
  if (typeof input === 'string') {
    try { parsed = JSON.parse(input); } catch { fail('graphs must be valid JSON'); }
  }
  if (!isRecord(parsed)) fail('graph collection must be an object');
  parsed = inertFeatherGCollection(parsed);
  const keys = Object.keys(parsed);
  if (keys.length < 1 || keys.length > MAX_GRAPHS ||
      keys.some((key, i) => !own(parsed, String(i))))
    fail(`graph IDs must be consecutive 0..N-1 with 1-${MAX_GRAPHS} graphs`);
  const graphs = keys.map((_, index) => {
    const graph = validateEdgeList(parsed[String(index)], `graph ${index}`);
    return freeze({
      kind: 'signgraph.featherG.externalTopology.v1', graphIndex: index,
      directed: false, vertices: graph.vertices,
      incidences: frozenArray(graph.edges.map((pair, edgeIndex) => freeze({
        externalEdgeIndex: edgeIndex, endpoints: pair, directed: false,
      }))),
      sourceQualification: 'external structural data only; native source and witnesses absent',
    });
  });
  const result = freeze({
    kind: 'signgraph.featherG.structuralCollection.v1',
    graphs: frozenArray(graphs),
    sourceQualification: 'unwitnessed FEATHER-G wire input; not a native admitted SignGraph',
  });
  decodedCollections.add(result);
  return result;
}

function admittedSignGraph(graph) {
  const result = glueSignGraphs(graph);
  if (!result.ok) fail(`source SignGraph readmission failed: ${result.refusal.message}`);
  if (result.value.obstructions.length) fail('source SignGraph has unresolved gluing obstructions');
  return result.value.graph;
}

function originalIncidences(input) {
  optionsOnly(input, ['graph', 'source', 'selectors'], 'source entry');
  if (own(input, 'graph')) {
    if (own(input, 'source') || own(input, 'selectors')) fail('source entry cannot mix SignGraph and feather source');
    const g = admittedSignGraph(input.graph);
    // The closed SignCell graph includes original witness and other cells that
    // are not vertices of the endpoint-induced FEATHER-G projection. Record
    // their exclusion explicitly instead of exporting them as phantom isolates.
    const endpoints = new Set(g.edges.flatMap(({edge}) => [edge.subject.id, edge.object.id]));
    return {
      sourceKind: 'sign.graph', sourceId: g.id,
      vertices: [...endpoints],
      excludedSourceCells: g.cells.filter(c => !endpoints.has(c.id)).map(c => freeze({id:c.id,type:c.type})),
      relations: g.edges.map(({id, edge}) => ({
        from: edge.subject.id, to: edge.object.id,
        identity: id, predicate: edge.predicate, witness: edge.witness.id,
      })),
    };
  }
  if (!own(input, 'source') || !own(input, 'selectors'))
    fail('feather source entry needs both source occurrences and predicate selectors');
  const g = featherGraphOfPredications(input.source, input.selectors);
  return {
    sourceKind: g.kind, sourceId: null, excludedSourceCells: [],
    vertices: g.positions.map(p => p.key),
    relations: g.predications.map(p => ({
      from: p.subject, to: p.object,
      identity: p.occurrence, predicate: p.predicate, sourceRecord: p.sourceRecord,
    })),
  };
}

/**
 * Project source-admitted SignGraphs or conditional original feather sources to
 * the FEATHER-G JSON graph input. `projection` is intentionally explicit: the
 * external format erases direction, predicates, source roles and parallelism.
 * Every original occurrence has a sidecar receipt but the graph JSON alone is
 * never a lossless transport. This does not compute the FEATHER-G embedding.
 */
export function encodeFeatherGGraphCollection(inputs, {projection} = {}) {
  if (projection !== 'undirected-simple')
    fail('must explicitly select projection: "undirected-simple"');
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > MAX_GRAPHS)
    fail(`requires 1-${MAX_GRAPHS} original graph entries`);
  const graphs = Object.create(null), receipts = [];
  for (let index = 0; index < inputs.length; index++) {
    const original = originalIncidences(inputs[index]);
    const vertices = [...original.vertices].sort(idSort);
    if (new Set(vertices).size !== vertices.length) fail(`graph ${index}: duplicate source positions`);
    const n = vertices.length;
    if (n < 2 || n > MAX_VERTICES)
      fail(`graph ${index}: FEATHER-G cannot represent isolated or oversized native positions`);
    const vertexIndex = new Map(vertices.map((id,i)=>[id,i]));
    const originalByPair = new Map();
    for (const rel of original.relations) {
      const a = vertexIndex.get(rel.from), b = vertexIndex.get(rel.to);
      if (a === undefined || b === undefined) fail(`graph ${index}: foreign endpoint in source`);
      if (a === b) fail(`graph ${index}: self-loop requires a separate loop-preserving projection; this codec refuses it`);
      const pair = a < b ? [a,b] : [b,a];
      const key = JSON.stringify(pair);
      if (!originalByPair.has(key)) originalByPair.set(key, {pair, original: []});
      originalByPair.get(key).original.push(freeze({...rel}));
    }
    if (originalByPair.size > MAX_EDGES_PER_GRAPH)
      fail(`graph ${index}: FEATHER-G work budget exceeded`);
    const groups = [...originalByPair.values()].sort((a,b)=>a.pair[0]-b.pair[0] || a.pair[1]-b.pair[1]);
    const candidate = groups.map(g => g.pair);
    const checked = validateEdgeList(candidate, `graph ${index}`);
    if (checked.vertices.length !== n)
      fail(`graph ${index}: isolated native positions cannot be represented by the FEATHER-G format`);
    graphs[String(index)] = frozenArray(checked.edges);
    receipts.push(freeze({
      graphIndex: index, sourceKind: original.sourceKind, sourceId: original.sourceId,
      vertexIndex: frozenArray(vertices),
      excludedSourceCells: frozenArray(original.excludedSourceCells),
      edgeGroups: frozenArray(groups.map(group => freeze({
        unorderedEndpoints: frozenArray([...group.pair]),
        originalDirectedOccurrences: frozenArray(group.original),
      }))),
      projectionLoss: frozenArray(['direction', 'predicate and role types', 'witness and source-record identity', 'parallel occurrence distinctions', 'non-endpoint source cells (listed separately)']),
      sourceQualification: original.sourceKind === 'sign.graph'
        ? 'SignCell graph readmitted locally; portable sidecar is not a substitute for re-admission'
        : 'conditional source-position readout; witness/source admission is not proven',
    }));
  }
  return freeze({
    kind: 'signgraph.featherG.exportProjection.v1',
    graphs: freeze(graphs), receipts: frozenArray(receipts),
    note: 'Pass only .graphs as the FEATHER-G graph-input JSON; retain .receipts separately. Neither an embedding nor a JSON reimport proves native predication.',
  });
}

const numberText = text => /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) ||
  /^-(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text);

/**
 * Read the reference FEATHER-G embedding CSV (`id,x_0,...`) as numerical
 * descriptors attached to the matching structural graph indices. The reference
 * implementation may serialize graph ids as `0.0`; these are accepted. The
 * descriptor is NOT a reversible graph encoding or a scientific source proof.
 */
export function decodeFeatherGEmbeddingCsv(csv, graphCollection, model = {}) {
  optionsOnly(model, ['order','evalPoints','thetaMax','pooling'], 'FEATHER-G model metadata');
  const {order=5, evalPoints=25, thetaMax=2.5, pooling='mean'} = model;
  if (!Number.isSafeInteger(order) || order < 1 || !Number.isSafeInteger(evalPoints) || evalPoints < 1 ||
      !Number.isFinite(thetaMax) || thetaMax <= 0 || !['mean','max','min'].includes(pooling))
    fail('invalid FEATHER-G model configuration');
  const width = 2 * order * evalPoints;
  if (width < 1 || width > MAX_DIMENSIONS) fail('embedding width exceeds bounded work budget');
  // A branded in-process readout may be consumed directly; its JSON clone
  // is NOT an admitted readout. Never invoke caller-controlled getters on
  // `kind` or `graphs` before deciding this source boundary.
  const kindSlot = isRecord(graphCollection)
    ? Object.getOwnPropertyDescriptor(graphCollection, 'kind') : undefined;
  if (kindSlot && (!kindSlot.enumerable || !Object.hasOwn(kindSlot, 'value')))
    fail('graph IDs require inert original readout data, not accessors');
  const kind = kindSlot?.value;
  if (kind === 'signgraph.featherG.structuralCollection.v1' &&
      !decodedCollections.has(graphCollection))
    fail('graph IDs must originate from an admitted in-process structural readout');
  let input = graphCollection;
  if (kind === 'signgraph.featherG.exportProjection.v1') {
    const graphsSlot = Object.getOwnPropertyDescriptor(graphCollection, 'graphs');
    if (!graphsSlot || !graphsSlot.enumerable || !Object.hasOwn(graphsSlot, 'value'))
      fail('graph IDs require inert exported graph data');
    input = graphsSlot.value;
  }
  const decoded = decodedCollections.has(graphCollection)
    ? graphCollection : decodeFeatherGGraphCollection(input);
  if (typeof csv !== 'string') fail('embedding CSV must be text');
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift()?.split(',');
  if (!header || header.length !== width + 1 || header[0] !== 'id' ||
      header.slice(1).some((cell, i) => cell !== `x_${i}`))
    fail('embedding CSV must have id,x_0,... columns matching declared model width');
  if (lines.length !== decoded.graphs.length) fail('embedding row count does not match graph collection');
  const embeddings = [];
  for (let i=0;i<lines.length;i++) {
    const row = lines[i].split(',');
    const id = row.shift();
    if (row.length !== width || !new RegExp(`^${i}(?:\\.0+)?$`).test(id))
      fail(`embedding row ${i} has wrong id or width`);
    const values = row.map(raw => {
      if (!numberText(raw)) fail(`embedding row ${i} has a nonnumeric descriptor`);
      const value = Number(raw);
      if (!Number.isFinite(value)) fail(`embedding row ${i} has a nonfinite descriptor`);
      return value;
    });
    embeddings.push(freeze({graphIndex:i, values:frozenArray(values)}));
  }
  return freeze({
    kind: 'signgraph.featherG.graphDescriptors.v1',
    graphs: decoded, embeddings: frozenArray(embeddings),
    declaredModel: freeze({model:'FEATHER-G',order,evalPoints,thetaMax,pooling}),
    qualification: 'numeric, noninvertible graph descriptors; declared model settings are supplied, not inferred from CSV',
  });
}
