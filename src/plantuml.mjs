import { restrict } from "@red-cup-engineering/computer-content-engineering-services-section/typed-resource-classification";
import { stringProjector } from "@red-cup-engineering/computer-content-engineering-services-section/text-projector";
import { canonical, parse } from "@red-cup-engineering/json-engine";
import { presentedCategoryDiagram, requireRecord } from "./presented-category.mjs";

const META = "' relating.diagram ";
const OBJECT = "' object ";
const MORPHISM = "' morphism ";
const shape = Object.freeze({ class: "class", "state-machine": "state", sequence: "participant" });
const label = (text) => text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\r\n", "\\n").replaceAll("\n", "\\n").replaceAll("\r", "\\n");

/** Write the graph with a local alias per object and exact graph records in comments. */
export function writePlantUml(diagram) {
  const diagramKind = diagram.diagramKind ?? "class";
  const lines = [
    "@startuml",
    META + canonical({ kind: diagram.kind, diagramKind, title: diagram.title ?? "", description: diagram.description ?? "" }),
    ...diagram.objects.map((object) => OBJECT + canonical(object)),
    ...diagram.morphisms.map((morphism) => MORPHISM + canonical(morphism)),
  ];
  const aliases = new Map(diagram.objects.map(({ id }) => id).sort().map((id, index) => [id, `n${index}`]));
  if (aliases.size !== diagram.objects.length) throw new TypeError("diagram PlantUML: object identities must be distinct");
  const arrow = diagramKind === "sequence" ? "->" : "-->";
  for (const object of diagram.objects) {
    lines.push(`${shape[diagramKind]} "${label(object.label)}" as ${aliases.get(object.id)}`);
  }
  for (const morphism of diagram.morphisms) {
    const from = aliases.get(morphism.from), to = aliases.get(morphism.to);
    if (from === undefined || to === undefined) throw new TypeError("diagram PlantUML: morphism must connect declared objects");
    lines.push(`${from} ${arrow} ${to} : ${label(morphism.label)}`);
  }
  return `${[...lines, "@enduml"].join("\n")}\n`;
}

/** Read a presented-category projection using its original graph records. */
export function readPlantUml(source) {
  let metadata;
  const objects = [], morphisms = [];
  for (const line of source.split(/\r?\n/u)) {
    if (line.startsWith(META) && metadata === undefined)
      metadata = requireRecord(parse(line.slice(META.length)), "plantuml metadata");
    if (line.startsWith(OBJECT)) objects.push(parse(line.slice(OBJECT.length)));
    if (line.startsWith(MORPHISM)) morphisms.push(parse(line.slice(MORPHISM.length)));
  }
  const { title, description, diagramKind } = metadata ?? {};
  return presentedCategoryDiagram({
    title: typeof title === "string" ? title : "",
    description: typeof description === "string" ? description : "",
    diagramKind: diagramKind === "state-machine" || diagramKind === "sequence" ? diagramKind : "class",
    objects,
    morphisms,
  });
}

export const plantUmlProjector = restrict(stringProjector, {
  type: "plantuml",
  corner: "assertion",
  rung: "strict",
  recognize: (resource) => resource.path.endsWith(".puml") || resource.content.trimStart().startsWith("@startuml"),
  read: (resource) => [readPlantUml(resource.content)],
  write: (items) => items.map(writePlantUml).join("\n"),
});
