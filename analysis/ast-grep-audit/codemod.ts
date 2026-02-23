import type { SgRoot, Edit } from "codemod:ast-grep";
import type TS from "codemod:ast-grep/langs/typescript";

/**
 * JSSG Codemod: console.log → console.debug
 *
 * Replaces `console.log(...)` with `console.debug(...)` in TypeScript files.
 * `console.debug` is semantically more precise for development-only performance
 * tracing and other diagnostic logging, since it maps to the browser's "Verbose"
 * log level and is filtered out by default in production DevTools settings.
 *
 * Scope: production source files only (not .test.ts / .spec.ts).
 */
async function transform(root: SgRoot<TS>): Promise<string | null> {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // Find all console.log calls
  const consoleLogs = rootNode.findAll({
    rule: {
      kind: "call_expression",
      all: [
        {
          has: {
            field: "function",
            kind: "member_expression",
            all: [
              {
                has: {
                  field: "object",
                  kind: "identifier",
                  regex: "^console$",
                },
              },
              {
                has: {
                  field: "property",
                  kind: "property_identifier",
                  regex: "^log$",
                },
              },
            ],
          },
        },
      ],
    },
  });

  for (const callExpr of consoleLogs) {
    // Only rewrite the callee member expression (console.log → console.debug)
    const callee = callExpr.field("function");
    if (!callee) continue;

    const prop = callee.find({
      rule: {
        kind: "property_identifier",
        regex: "^log$",
      },
    });
    if (!prop) continue;

    edits.push(prop.replace("debug"));
  }

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
}

export default transform;
