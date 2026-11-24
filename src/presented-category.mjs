import { schemaFrom } from "@red-cup-engineering/json-schema-engineering-services-section/contracts";

export const presentedCategoryDiagramSchema = {
  $id: "relating/writing/diagram/presented-category",
  type: "object",
  required: ["kind", "objects", "morphisms"],
  properties: {
    kind: { const: "relating.diagram.presented-category" },
    diagramKind: { enum: ["class", "state-machine", "sequence"] },
    title: { type: "string" },
    description: { type: "string" },
    objects: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "kind", "label"],
        properties: {
          id: { type: "string", minLength: 1 },
          kind: { type: "string", minLength: 1 },
          label: { type: "string", minLength: 1 },
          detail: { type: "string" },
          href: { type: "string" },
        },
        additionalProperties: true,
      },
    },
    morphisms: {
      type: "array",
      items: {
        type: "object",
        required: ["from", "to", "kind", "label"],
        properties: {
          id: { type: "string" },
          from: { type: "string", minLength: 1 },
          to: { type: "string", minLength: 1 },
          kind: { type: "string", minLength: 1 },
          label: { type: "string", minLength: 1 },
        },
        additionalProperties: true,
      },
    },
  },
  title: "PresentedCategoryDiagram",
  description: "A diagram as a presented category: objects/nodes and morphisms/edges.",
  additionalProperties: true,
};

export const presentedCategoryDiagramCarrier = schemaFrom(presentedCategoryDiagramSchema);

export function isPresentedCategoryDiagram(value) {
  return presentedCategoryDiagramCarrier.validate(value);
}

export function requireRecord(value, context) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${context}: expected object`);
  }
  return value;
}

function stringField(record, key, fallback = "") {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

export function objectFrom(value, index) {
  const record = requireRecord(value, `diagram object ${index}`);
  const id = stringField(record, "id");
  const kind = stringField(record, "kind", "object");
  const label = stringField(record, "label", id);
  if (id === "") throw new TypeError(`diagram object ${index}: id is required`);
  return Object.freeze({ ...record, id, kind, label });
}

export function morphismFrom(value, index) {
  const record = requireRecord(value, `diagram morphism ${index}`);
  const from = stringField(record, "from");
  const to = stringField(record, "to");
  const kind = stringField(record, "kind", "edge");
  const label = stringField(record, "label", kind);
  if (from === "" || to === "") throw new TypeError(`diagram morphism ${index}: from and to are required`);
  return Object.freeze({ ...record, from, to, kind, label });
}

/** Admit the graph presentation with its persisted diagram kind and schema address. */
export function presentedCategoryDiagram(input) {
  const value = Object.freeze({
    kind: "relating.diagram.presented-category",
    ...(input.diagramKind === undefined ? {} : { diagramKind: input.diagramKind }),
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.description === undefined ? {} : { description: input.description }),
    objects: Object.freeze(input.objects.map(objectFrom)),
    morphisms: Object.freeze(input.morphisms.map(morphismFrom)),
  });
  return presentedCategoryDiagramCarrier.assert(value, "presented category diagram");
}

export function diagramFromCarrierCategory(category, defaultTitle = "carrier category") {
  const record = requireRecord(category, defaultTitle);
  const objects = Array.isArray(record["objects"]) ? record["objects"] : [];
  const morphisms = Array.isArray(record["morphisms"]) ? record["morphisms"] : [];
  return presentedCategoryDiagram({
    title: stringField(record, "title", defaultTitle),
    description: stringField(record, "packageName"),
    diagramKind: "class",
    objects,
    morphisms,
  });
}
