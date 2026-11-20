/** Present an ordered EAVT log as participants and messages. */
import { eavtId, eavtKey, eavtRecord } from "@red-cup-engineering/eavt-engineering-services-section/row";
import { canonicalJson } from "@red-cup-engineering/json-engine";
import { diagramFromCarrierCategory, presentedCategoryDiagram } from "./presented-category.mjs";

export function diagramFromPresentedCategory(category) {
  return diagramFromCarrierCategory(category, "presented category");
}

function labelOf(value) {
  return typeof value === "string" ? value : canonicalJson(value);
}

function participantId(role, value) {
  return `${role}:${canonicalJson(value)}`;
}

function sequenceDiagram(rows, { rowId, title, subject }) {
  const ordered = rows.map(row => eavtRecord(row));
  // A numeric game clock orders tick 9 before tick 10. Other EAVT clocks
  // retain their canonical ordering, including logs with mixed time domains.
  const numericClock = ordered.every(row => typeof row.t === "number");
  ordered.sort((left, right) => {
    const timeOrder = numericClock ? left.t - right.t : canonicalJson(left.t).localeCompare(canonicalJson(right.t));
    return timeOrder || rowId(left).localeCompare(rowId(right));
  });
  const objects = new Map();
  const morphisms = [];
  const addParticipant = (id, label, detail) => {
    if (objects.has(id)) return;
    objects.set(id, Object.freeze({ id, kind: "participant", label, detail }));
  };
  for (const row of ordered) {
    const from = participantId("entity", row.e);
    const to = participantId("attribute", row.a);
    addParticipant(from, labelOf(row.e), `EAVT entity: invocation caller or ${subject} subject.`);
    addParticipant(to, labelOf(row.a), "EAVT attribute: invocation morphism and arguments.");
    morphisms.push(Object.freeze({
      id: `${subject}:${rowId(row)}`,
      from,
      to,
      kind: "message",
      label: labelOf(row.a),
      detail: `value ${labelOf(row.v)} at ${labelOf(row.t)}`,
    }));
  }
  return presentedCategoryDiagram({
    title,
    description: `Participants are EAVT entities and attributes; messages are ${subject} rows ordered by time.`,
    diagramKind: "sequence",
    objects: [...objects.values()],
    morphisms,
  });
}

export function statementSequenceDiagram(rows) {
  return sequenceDiagram(rows, { rowId: eavtKey, title: "statement log sequence", subject: "statement" });
}

export function witnessLedgerSequenceDiagram(rows) {
  return sequenceDiagram(rows, { rowId: eavtId, title: "witness ledger sequence", subject: "witness" });
}
