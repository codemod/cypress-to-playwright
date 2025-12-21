import type { Transform } from "codemod:ast-grep";
import type { SgNode, SgRoot, Edit } from "@codemod.com/jssg-types/main";
import type TS from "codemod:ast-grep/langs/typescript";

type Language = TS;
type Node = SgNode<Language>;
type Root = SgRoot<Language>;

/**
 * Custom Cypress Command Detection
 *
 * Scans Cypress support files for custom commands and generates
 * migration hints for converting them to Playwright fixtures/helpers.
 */

interface CustomCommand {
  name: string;
  hasOptions: boolean;
  bodyPreview: string;
}

function extractCustomCommands(rootNode: Node): CustomCommand[] {
  const commands: CustomCommand[] = [];

  // Find Cypress.Commands.add() calls
  const addCommandCalls = rootNode.findAll({
    rule: {
      kind: "call_expression",
      has: {
        field: "function",
        kind: "member_expression",
        has: {
          field: "property",
          regex: "^add$",
        },
      },
    },
  });

  for (const call of addCommandCalls) {
    const callee = call.field("function");
    if (!callee?.text().includes("Cypress.Commands.add")) {
      continue;
    }

    const args = call.field("arguments");
    if (!args) continue;

    const argsChildren = args.children().filter((c) => c.isNamed());

    // First arg is command name
    const nameArg = argsChildren[0];
    if (!nameArg?.is("string")) continue;

    const commandName = nameArg.text().replace(/^['"]|['"]$/g, "");

    // Check if there's an options object (prevSubject, etc.)
    let hasOptions = false;
    let bodyNode = argsChildren[1];

    if (argsChildren[1]?.is("object")) {
      hasOptions = true;
      bodyNode = argsChildren[2];
    }

    // Get a preview of the function body
    let bodyPreview = "";
    if (bodyNode?.is("arrow_function") || bodyNode?.is("function_expression")) {
      const body = bodyNode.field("body");
      if (body) {
        bodyPreview = body.text().slice(0, 100);
        if (body.text().length > 100) {
          bodyPreview += "...";
        }
      }
    }

    commands.push({
      name: commandName,
      hasOptions,
      bodyPreview,
    });
  }

  return commands;
}

function generateMigrationGuide(commands: CustomCommand[]): string {
  if (commands.length === 0) {
    return `// No custom Cypress commands found in this file.\n`;
  }

  const lines: string[] = [
    `// ============================================`,
    `// CUSTOM CYPRESS COMMANDS DETECTED`,
    `// ============================================`,
    `//`,
    `// The following custom commands were found and need manual migration.`,
    `// In Playwright, custom commands are typically implemented as:`,
    `//   1. Test fixtures (recommended for reusable functionality)`,
    `//   2. Page Object Models (for page-specific helpers)`,
    `//   3. Utility functions (for simple helpers)`,
    `//`,
    `// See: https://playwright.dev/docs/test-fixtures`,
    `//`,
    `// ============================================`,
    ``,
  ];

  for (const cmd of commands) {
    lines.push(`// Command: ${cmd.name}`);
    if (cmd.hasOptions) {
      lines.push(`//   - Has options (prevSubject, etc.) - may need special handling`);
    }
    lines.push(`//   - Body preview: ${cmd.bodyPreview.replace(/\n/g, " ")}`);
    lines.push(`//`);
  }

  lines.push(`// ============================================`);
  lines.push(`// PLAYWRIGHT FIXTURE TEMPLATE`);
  lines.push(`// ============================================`);
  lines.push(``);
  lines.push(`/*`);
  lines.push(`// Create a file: tests/fixtures.ts`);
  lines.push(``);
  lines.push(`import { test as base } from '@playwright/test';`);
  lines.push(``);

  // Generate fixture template for each command
  if (commands.length > 0) {
    lines.push(`type CustomFixtures = {`);
    for (const cmd of commands) {
      lines.push(`  ${cmd.name}: (/* params */) => Promise<void>;`);
    }
    lines.push(`};`);
    lines.push(``);
    lines.push(`export const test = base.extend<CustomFixtures>({`);
    for (const cmd of commands) {
      lines.push(`  ${cmd.name}: async ({ page }, use) => {`);
      lines.push(`    await use(async (/* params */) => {`);
      lines.push(`      // TODO: Migrate the '${cmd.name}' command logic here`);
      lines.push(`      // Original: Cypress.Commands.add('${cmd.name}', ...)`);
      lines.push(`    });`);
      lines.push(`  },`);
    }
    lines.push(`});`);
    lines.push(``);
    lines.push(`export { expect } from '@playwright/test';`);
  }

  lines.push(`*/`);
  lines.push(``);

  // Keep original file content but add comments
  return lines.join("\n");
}

const transform: Transform<Language> = async (root: Root): Promise<string | null> => {
  const rootNode = root.root();

  // Check if this file has Cypress.Commands.add
  const hasCypressCommands = rootNode.find({
    rule: {
      kind: "member_expression",
      regex: "Cypress\\.Commands",
    },
  });

  if (!hasCypressCommands) {
    return null;
  }

  // Extract custom commands
  const commands = extractCustomCommands(rootNode);

  // Generate migration guide
  const guide = generateMigrationGuide(commands);

  // Prepend the guide to the original file
  const originalContent = rootNode.text();

  return guide + "\n// ============================================\n// ORIGINAL CYPRESS COMMANDS FILE:\n// ============================================\n\n" + originalContent;
};

export default transform;
