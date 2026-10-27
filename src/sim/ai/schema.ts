// Wuthering Tools+ AI — the tool input schemas and a small validator for them. Pure.
//
// Our tool schemas are flat on purpose: an object of strings, integers, numbers, booleans and string
// arrays, with `enum`s, `required` and `additionalProperties: false` — the subset strict tool use accepts
// (no minimum / maximum / minLength: the API rejects numeric and string constraints under `strict`, so
// bounds are enums or clamps inside the tool). With `eager_input_streaming` the API no longer validates
// tool input and the SDK's tolerant parser can hand back a truncated object, so every input is checked
// here before a tool runs; a failure becomes an `is_error` tool_result.

export type SchemaProp =
  | { type: "string"; description: string; enum?: readonly string[] }
  | { type: "integer"; description: string; enum?: readonly number[] }
  | { type: "number"; description: string }
  | { type: "boolean"; description: string }
  | { type: "array"; description: string; items: { type: "string"; enum?: readonly string[] } };

export interface ObjectSchema {
  type: "object";
  properties: Record<string, SchemaProp>;
  required: readonly string[];
  additionalProperties: false;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Claude may return an enum value that differs only in capitalisation: match case-insensitively, return the canonical one. */
function matchEnum(value: string, options: readonly string[]): string | null {
  if (options.includes(value)) return value;
  const lower = value.toLowerCase();
  return options.find((o) => o.toLowerCase() === lower) ?? null;
}

function checkProp(name: string, prop: SchemaProp, value: unknown, errors: string[]): unknown {
  switch (prop.type) {
    case "string": {
      if (typeof value !== "string") return void errors.push(`${name} must be a string`);
      if (prop.enum) {
        const hit = matchEnum(value, prop.enum);
        if (hit == null) return void errors.push(`${name} must be one of ${prop.enum.join(", ")}`);
        return hit;
      }
      return value;
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value)) return void errors.push(`${name} must be an integer`);
      if (prop.enum && !prop.enum.includes(value)) return void errors.push(`${name} must be one of ${prop.enum.join(", ")}`);
      return value;
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return void errors.push(`${name} must be a number`);
      return value;
    }
    case "boolean": {
      if (typeof value !== "boolean") return void errors.push(`${name} must be true or false`);
      return value;
    }
    case "array": {
      if (!Array.isArray(value)) return void errors.push(`${name} must be an array`);
      const out: string[] = [];
      value.forEach((item, i) => {
        if (typeof item !== "string") return void errors.push(`${name}[${i}] must be a string`);
        if (prop.items.enum) {
          const hit = matchEnum(item, prop.items.enum);
          if (hit == null) return void errors.push(`${name}[${i}] must be one of ${prop.items.enum.join(", ")}`);
          out.push(hit);
        } else out.push(item);
      });
      return out;
    }
  }
}

/** Checks a tool input against its schema; on success returns a clean copy (enum case fixed, optional nulls dropped). */
export function validateInput<T = Record<string, unknown>>(schema: ObjectSchema, input: unknown): ValidationResult<T> {
  if (!isPlainObject(input)) return { ok: false, errors: ["input must be a JSON object"] };
  const errors: string[] = [];
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (!(key in schema.properties)) errors.push(`unknown property "${key}"`);
  }
  for (const [name, prop] of Object.entries(schema.properties)) {
    const value = input[name];
    const required = schema.required.includes(name);
    if (value === undefined || value === null) {
      if (required) errors.push(`${name} is required`);
      continue;
    }
    const before = errors.length;
    const clean = checkProp(name, prop, value, errors);
    if (errors.length === before) out[name] = clean;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: out as T };
}

/** What would make the API reject a schema under `strict: true` (a test runs it over every tool). */
export function strictSchemaProblems(schema: ObjectSchema): string[] {
  const problems: string[] = [];
  if (schema.type !== "object") problems.push("root must be an object");
  if (schema.additionalProperties !== false) problems.push("additionalProperties must be false");
  if (!Array.isArray(schema.required)) problems.push("required must be listed");
  for (const r of schema.required ?? []) if (!(r in schema.properties)) problems.push(`required "${r}" is not a property`);
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (!prop.description) problems.push(`${name} needs a description`);
    for (const banned of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern", "maxItems"]) {
      if (banned in prop) problems.push(`${name}.${banned} is not supported under strict`);
    }
    if (Array.isArray((prop as { type: unknown }).type)) problems.push(`${name} uses a union type`);
  }
  return problems;
}

/** Parameters not listed in `required` (strict tool use allows 24 across all strict tools of a request). */
export const optionalParamCount = (schema: ObjectSchema): number => Object.keys(schema.properties).filter((k) => !schema.required.includes(k)).length;
