import { Type, type TSchema } from "@sinclair/typebox";
import type { EndpointSpec, ParamSpec } from "./endpoints.generated.js";

// Enums larger than this get dropped from the TypeBox schema and folded
// into the field description as a short note. Keeps the LLM-visible
// tool schema small; the HasData API still rejects invalid values.
const INLINE_ENUM_LIMIT = 30;

function describeWithEnum(desc: string, values: (string | number | boolean)[]): string {
  const preview = values.slice(0, 8).map((v) => String(v)).join(", ");
  const suffix = ` (accepted values include: ${preview}${values.length > 8 ? ", …" : ""}; ${values.length} total — see https://docs.hasdata.com)`;
  return (desc || "").concat(desc.endsWith(".") ? "" : desc ? "." : "", suffix);
}

function buildFieldSchema(spec: ParamSpec): TSchema {
  const desc = spec.description ?? "";
  const common: Record<string, unknown> = {};
  if (desc) common.description = desc;
  if (spec.default !== undefined) common.default = spec.default;

  switch (spec.type) {
    case "string": {
      if (spec.enum && spec.enum.length > 0 && spec.enum.length <= INLINE_ENUM_LIMIT) {
        return Type.Union(
          spec.enum.map((v) => Type.Literal(v as string)),
          common,
        );
      }
      if (spec.enum && spec.enum.length > INLINE_ENUM_LIMIT) {
        common.description = describeWithEnum(desc, spec.enum);
      }
      return Type.String(common);
    }
    case "integer":
      return Type.Integer(common);
    case "number":
      return Type.Number(common);
    case "boolean":
      return Type.Boolean(common);
    case "array": {
      const itemType = spec.items?.type ?? "string";
      let items: TSchema;
      if (spec.items?.enum && spec.items.enum.length > 0 && spec.items.enum.length <= INLINE_ENUM_LIMIT) {
        items = Type.Union(spec.items.enum.map((v) => Type.Literal(v as string)));
      } else if (itemType === "integer") {
        items = Type.Integer();
      } else if (itemType === "number") {
        items = Type.Number();
      } else if (itemType === "boolean") {
        items = Type.Boolean();
      } else {
        if (spec.items?.enum && spec.items.enum.length > INLINE_ENUM_LIMIT) {
          common.description = describeWithEnum(desc, spec.items.enum);
        }
        items = Type.String();
      }
      return Type.Array(items, common);
    }
    case "object":
      return Type.Record(Type.String(), Type.Unknown(), common);
    default:
      return Type.Unknown(common);
  }
}

export function buildParamsSchema(ep: EndpointSpec): TSchema {
  const required = new Set(ep.required);
  const props: Record<string, TSchema> = {};
  for (const [name, spec] of Object.entries(ep.properties)) {
    const base = buildFieldSchema(spec);
    props[name] = required.has(name) ? base : Type.Optional(base);
  }
  return Type.Object(props, {
    additionalProperties: false,
    description: `Parameters for the HasData ${ep.slug} endpoint (${ep.cost} credits per call).`,
  });
}

export function buildActionBranch(ep: EndpointSpec): TSchema {
  return Type.Object(
    {
      action: Type.Literal(ep.slug, {
        description: `${ep.title} — ${ep.description}`,
      }),
      params: buildParamsSchema(ep),
    },
    {
      title: ep.slug,
      description: ep.description,
      additionalProperties: false,
    },
  );
}