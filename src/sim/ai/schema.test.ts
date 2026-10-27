import { describe, expect, it } from "vitest";
import { optionalParamCount, strictSchemaProblems, validateInput, type ObjectSchema } from "./schema";

const schema: ObjectSchema = {
  type: "object",
  properties: {
    character: { type: "string", description: "who" },
    sequence: { type: "integer", enum: [0, 1, 2, 3, 4, 5, 6], description: "S" },
    ratio: { type: "number", description: "x" },
    pretty: { type: "boolean", description: "b" },
    mode: { type: "string", enum: ["any", "equipped", "unequipped"], description: "m" },
    names: { type: "array", items: { type: "string" }, description: "n" },
    tags: { type: "array", items: { type: "string", enum: ["a", "b"] }, description: "t" },
  },
  required: ["character"],
  additionalProperties: false,
};

describe("validateInput", () => {
  it("accepts a valid input and returns a clean copy", () => {
    const r = validateInput(schema, { character: "Aemeath", sequence: 2, ratio: 0.5, pretty: false, names: ["x"], tags: ["a"] });
    expect(r).toEqual({ ok: true, value: { character: "Aemeath", sequence: 2, ratio: 0.5, pretty: false, names: ["x"], tags: ["a"] } });
  });

  it("matches string enums case-insensitively and returns the canonical value", () => {
    expect(validateInput(schema, { character: "x", mode: "UNEQUIPPED", tags: ["B"] })).toEqual({ ok: true, value: { character: "x", mode: "unequipped", tags: ["b"] } });
  });

  it("drops optional nulls, rejects missing required fields", () => {
    expect(validateInput(schema, { character: "x", sequence: null })).toEqual({ ok: true, value: { character: "x" } });
    const r = validateInput(schema, { sequence: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual(["character is required"]);
    expect(validateInput(schema, { character: null }).ok).toBe(false);
  });

  it("rejects wrong types, out-of-enum values and unknown keys (a truncated or invented input)", () => {
    const r = validateInput(schema, { character: 3, sequence: 2.5, ratio: Number.NaN, pretty: "yes", mode: "all", names: "x", tags: ["c", 1], extra: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual([
        'unknown property "extra"',
        "character must be a string",
        "sequence must be an integer",
        "ratio must be a number",
        "pretty must be true or false",
        "mode must be one of any, equipped, unequipped",
        "names must be an array",
        "tags[0] must be one of a, b",
        "tags[1] must be a string",
      ]);
    }
    expect(validateInput(schema, { character: "x", sequence: 7 }).ok).toBe(false);
  });

  it("rejects non-objects (the tolerant stream parser can hand back anything)", () => {
    for (const bad of [null, undefined, "x", 3, [], [{ character: "x" }]]) expect(validateInput(schema, bad).ok).toBe(false);
  });
});

describe("strictSchemaProblems", () => {
  it("flags what strict tool use rejects", () => {
    expect(strictSchemaProblems(schema)).toEqual([]);
    expect(optionalParamCount(schema)).toBe(6);
    const bad = {
      type: "object",
      properties: { n: { type: "integer", description: "", minimum: 1 }, u: { type: ["string", "null"], description: "u" } },
      required: ["missing"],
      additionalProperties: true,
    } as unknown as ObjectSchema;
    expect(strictSchemaProblems(bad)).toEqual([
      "additionalProperties must be false",
      'required "missing" is not a property',
      "n needs a description",
      "n.minimum is not supported under strict",
      "u uses a union type",
    ]);
  });
});
