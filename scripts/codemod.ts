import type { Transform } from "codemod:ast-grep";
import type { SgNode, SgRoot, Edit } from "@codemod.com/jssg-types/main";
import type TS from "codemod:ast-grep/langs/typescript";

type Language = TS;
type Node = SgNode<Language>;
type Root = SgRoot<Language>;

/**
 * Cypress to Playwright Migration Codemod
 */

// Maps Cypress assertion methods to Playwright assertion methods
const ASSERTION_MAP: Record<string, { method: string; argsTransform?: string }> = {
  "be.visible": { method: "toBeVisible" },
  "exist": { method: "toBeAttached" },
  "have.text": { method: "toHaveText" },
  "contain": { method: "toContainText" },
  "have.value": { method: "toHaveValue" },
  "have.class": { method: "toHaveClass", argsTransform: "regex" },
  "have.attr": { method: "toHaveAttribute" },
  "be.disabled": { method: "toBeDisabled" },
  "be.enabled": { method: "toBeEnabled" },
  "be.checked": { method: "toBeChecked" },
  "have.length": { method: "toHaveCount" },
  "have.css": { method: "toHaveCSS" },
};

// Maps Cypress action methods to Playwright methods
const ACTION_MAP: Record<string, string> = {
  type: "fill",
  clear: "clear",
  check: "check",
  uncheck: "uncheck",
  click: "click",
  dblclick: "dblclick",
  focus: "focus",
  blur: "blur",
  select: "selectOption",
  scrollIntoView: "scrollIntoViewIfNeeded",
};

interface TransformContext {
  edits: Edit[];
  hasCypressCode: boolean;
  processedNodes: Set<number>;
}

function getStringContent(node: Node | null): string | null {
  if (!node) return null;
  if (!node.is("string") && !node.is("template_string")) {
    return null;
  }

  const fragment = node.find({ rule: { kind: "string_fragment" } });
  if (fragment) {
    return fragment.text();
  }

  const text = node.text();
  if (text.startsWith("'") || text.startsWith('"') || text.startsWith("`")) {
    return text.slice(1, -1);
  }
  return text;
}

function isCyCommand(node: Node): boolean {
  if (!node.is("call_expression")) return false;

  const callee = node.field("function");
  if (!callee) return false;

  if (callee.is("member_expression")) {
    const obj = callee.field("object");
    if (obj?.text() === "cy") return true;
    if (obj?.is("call_expression")) {
      return isCyCommand(obj);
    }
  }

  return false;
}

function findCyChainMethods(node: Node): Array<{ method: string; args: Node | null; callNode: Node }> {
  const chain: Array<{ method: string; args: Node | null; callNode: Node }> = [];

  let current: Node | null = node;
  while (current?.is("call_expression")) {
    const callee = current.field("function");
    if (!callee?.is("member_expression")) break;

    const prop = callee.field("property");
    const obj = callee.field("object");
    const args = current.field("arguments");

    if (prop) {
      chain.unshift({
        method: prop.text(),
        args: args ?? null,
        callNode: current,
      });
    }

    if (obj?.text() === "cy") {
      break;
    }

    current = obj?.is("call_expression") ? obj : null;
  }

  return chain;
}

function transformTriggerToPlaywright(args: Node | null): string {
  if (!args) return "hover()";

  const children = args.children().filter((c) => c.isNamed());
  if (children.length === 0) return "hover()";

  const eventArg = children[0];
  const eventName = getStringContent(eventArg ?? null);

  switch (eventName) {
    case "mouseover":
    case "mouseenter":
      return "hover()";
    case "mousedown":
      return "dispatchEvent('mousedown')";
    case "mouseup":
      return "dispatchEvent('mouseup')";
    case "focus":
      return "focus()";
    case "blur":
      return "blur()";
    default:
      return `dispatchEvent('${eventName ?? "unknown"}')`;
  }
}

function parseAssertionArgs(args: Node | null): { assertion: string; isNegated: boolean; restArgs: string[] } {
  if (!args) return { assertion: "", isNegated: false, restArgs: [] };

  const children = args.children().filter((c) => c.isNamed());
  if (children.length === 0) return { assertion: "", isNegated: false, restArgs: [] };

  const firstArg = children[0];
  let assertion = getStringContent(firstArg ?? null) ?? firstArg?.text() ?? "";
  let isNegated = false;

  if (assertion.startsWith("not.")) {
    isNegated = true;
    assertion = assertion.slice(4);
  }

  const restArgs = children.slice(1).map((c) => c.text());

  return { assertion, isNegated, restArgs };
}

function transformCyGetChain(chain: Array<{ method: string; args: Node | null; callNode: Node }>): string {
  if (chain.length === 0) return "";

  const firstMethod = chain[0];
  if (!firstMethod) return "";

  let result = "";
  let currentLocator = "";
  let isAssertion = false;
  let assertionExpr = "";

  for (let i = 0; i < chain.length; i++) {
    const item = chain[i];
    if (!item) continue;

    const { method, args } = item;

    if (method === "get") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const selector = argsChildren[0]?.text() ?? "''";
      const selectorContent = getStringContent(argsChildren[0] ?? null);

      // Check if it's an alias reference (starts with @)
      if (selectorContent?.startsWith("@")) {
        result = `// TODO: Migrate cy.get('${selectorContent}') - use the const variable directly`;
        return result;
      }

      currentLocator = `page.locator(${selector})`;
    } else if (method === "contains") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      if (argsChildren.length >= 2) {
        if (currentLocator) {
          currentLocator = `${currentLocator}.getByText(${argsChildren[0]?.text()})`;
        } else {
          const selector = argsChildren[0]?.text();
          const text = argsChildren[1]?.text();
          currentLocator = `page.locator(${selector}).filter({ hasText: ${text} })`;
        }
      } else if (argsChildren.length === 1) {
        if (currentLocator) {
          currentLocator = `${currentLocator}.getByText(${argsChildren[0]?.text()})`;
        } else {
          currentLocator = `page.getByText(${argsChildren[0]?.text()})`;
        }
      }
    } else if (method === "first") {
      currentLocator = `${currentLocator}.first()`;
    } else if (method === "last") {
      currentLocator = `${currentLocator}.last()`;
    } else if (method === "eq") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const index = argsChildren[0]?.text() ?? "0";
      currentLocator = `${currentLocator}.nth(${index})`;
    } else if (method === "find") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const childSelector = argsChildren[0]?.text() ?? "''";
      currentLocator = `${currentLocator}.locator(${childSelector})`;
    } else if (method === "parent") {
      currentLocator = `${currentLocator}.locator('..')`;
    } else if (method === "children") {
      currentLocator = `${currentLocator}.locator('> *')`;
    } else if (method === "should") {
      const { assertion, isNegated, restArgs } = parseAssertionArgs(args);
      const mapping = ASSERTION_MAP[assertion];

      if (mapping) {
        let playwrightArgs = restArgs.join(", ");

        if (mapping.argsTransform === "regex" && restArgs.length > 0) {
          const classValue = restArgs[0];
          if (classValue) {
            const classContent = classValue.replace(/^['"]|['"]$/g, "");
            playwrightArgs = `/${classContent}/`;
          }
        }

        const negation = isNegated ? ".not" : "";
        const argsStr = playwrightArgs ? `(${playwrightArgs})` : "()";
        assertionExpr = `await expect(${currentLocator})${negation}.${mapping.method}${argsStr}`;
        isAssertion = true;
      } else {
        assertionExpr = `await expect(${currentLocator})./* TODO: migrate '${assertion}' */ toPass()`;
        isAssertion = true;
      }
    } else if (ACTION_MAP[method]) {
      const playwrightMethod = ACTION_MAP[method];
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const argsText = argsChildren.map((c) => c.text()).join(", ");
      result = `await ${currentLocator}.${playwrightMethod}(${argsText})`;
    } else if (method === "trigger") {
      const triggerResult = transformTriggerToPlaywright(args);
      result = `await ${currentLocator}.${triggerResult}`;
    } else if (method === "visit") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const argsText = argsChildren.map((c) => c.text()).join(", ");
      result = `await page.goto(${argsText})`;
    } else if (method === "reload") {
      result = "await page.reload()";
    } else if (method === "go") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const direction = getStringContent(argsChildren[0] ?? null);

      if (direction === "back") {
        result = "await page.goBack()";
      } else if (direction === "forward") {
        result = "await page.goForward()";
      } else {
        result = `await page.goBack(); // TODO: Verify - was cy.go(${argsChildren[0]?.text() ?? ""})`;
      }
    } else if (method === "wait") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const waitArg = argsChildren[0]?.text() ?? "0";
      const waitContent = getStringContent(argsChildren[0] ?? null);

      if (waitContent?.startsWith("@")) {
        result = `// TODO: Migrate cy.wait('${waitContent}') - use page.waitForResponse() or similar`;
      } else {
        result = `await page.waitForTimeout(${waitArg})`;
      }
    } else if (method === "url") {
      currentLocator = "page";
    } else if (method === "title") {
      currentLocator = "page";
    } else if (method === "location") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const part = getStringContent(argsChildren[0] ?? null);
      if (part) {
        currentLocator = `new URL(page.url()).${part}`;
      } else {
        currentLocator = "new URL(page.url())";
      }
    } else if (method === "hash") {
      currentLocator = "new URL(page.url()).hash";
    } else if (method === "task") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const taskName = getStringContent(argsChildren[0] ?? null) ?? "";
      result = `// TODO: Migrate cy.task('${taskName}') - Playwright uses fixtures or global setup`;
    } else if (method === "clearCookies") {
      result = "await page.context().clearCookies()";
    } else if (method === "clearLocalStorage") {
      result = "await page.evaluate(() => localStorage.clear())";
    } else if (method === "screenshot") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      if (argsChildren.length > 0) {
        const nameContent = getStringContent(argsChildren[0] ?? null) ?? "screenshot";
        result = `await page.screenshot({ path: '${nameContent}.png' })`;
      } else {
        result = "await page.screenshot()";
      }
    } else if (method === "viewport") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      if (argsChildren.length >= 2) {
        const width = argsChildren[0]?.text() ?? "1280";
        const height = argsChildren[1]?.text() ?? "720";
        result = `await page.setViewportSize({ width: ${width}, height: ${height} })`;
      }
    } else if (method === "intercept") {
      // intercept may be followed by .as(), so return immediately with full TODO
      return `// TODO: Migrate cy.intercept - use page.route() in Playwright`;
    } else if (method === "as") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const aliasName = argsChildren[0]?.text() ?? "";
      result = `// TODO: Migrate ${currentLocator}.as(${aliasName}) - Playwright uses const variables instead of aliases`;
    } else if (method === "then") {
      result = `// TODO: Migrate ${currentLocator}.then() - use locator.evaluate() or similar in Playwright`;
    } else if (method === "log") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const logArgs = argsChildren.map((c) => c.text()).join(", ");
      result = `console.log(${logArgs})`;
    } else if (method === "and") {
      // .and() is same as .should() - handle as assertion
      const { assertion, isNegated, restArgs } = parseAssertionArgs(args);
      const mapping = ASSERTION_MAP[assertion];

      if (mapping) {
        let playwrightArgs = restArgs.join(", ");

        if (mapping.argsTransform === "regex" && restArgs.length > 0) {
          const classValue = restArgs[0];
          if (classValue) {
            const classContent = classValue.replace(/^['"]|['"]$/g, "");
            playwrightArgs = `/${classContent}/`;
          }
        }

        const negation = isNegated ? ".not" : "";
        const argsStr = playwrightArgs ? `(${playwrightArgs})` : "()";

        // If we already have an assertion, append this one
        if (isAssertion && assertionExpr) {
          assertionExpr = `${assertionExpr};\n    await expect(${currentLocator})${negation}.${mapping.method}${argsStr}`;
        } else {
          assertionExpr = `await expect(${currentLocator})${negation}.${mapping.method}${argsStr}`;
          isAssertion = true;
        }
      }
    }
  }

  if (isAssertion) {
    return assertionExpr;
  }

  return result || (currentLocator ? `${currentLocator}` : "");
}

function transformUrlAssertion(chain: Array<{ method: string; args: Node | null; callNode: Node }>): string {
  const shouldItem = chain.find((c) => c.method === "should");
  if (!shouldItem) return "";

  const { assertion, isNegated, restArgs } = parseAssertionArgs(shouldItem.args);

  if (assertion === "include" && restArgs.length > 0) {
    const urlPart = restArgs[0];
    if (urlPart) {
      const urlContent = urlPart.replace(/^['"]|['"]$/g, "").replace(/\//g, "\\/");
      const negation = isNegated ? ".not" : "";
      return `await expect(page)${negation}.toHaveURL(/${urlContent}/)`;
    }
  } else if (assertion === "eq" && restArgs.length > 0) {
    const negation = isNegated ? ".not" : "";
    return `await expect(page)${negation}.toHaveURL(${restArgs[0]})`;
  }

  return "";
}

function transformTitleAssertion(chain: Array<{ method: string; args: Node | null; callNode: Node }>): string {
  const shouldItem = chain.find((c) => c.method === "should");
  if (!shouldItem) return "";

  const { assertion, isNegated, restArgs } = parseAssertionArgs(shouldItem.args);

  if ((assertion === "eq" || assertion === "equal") && restArgs.length > 0) {
    const negation = isNegated ? ".not" : "";
    return `await expect(page)${negation}.toHaveTitle(${restArgs[0]})`;
  } else if (assertion === "include" && restArgs.length > 0) {
    const titlePart = restArgs[0];
    if (titlePart) {
      const titleContent = titlePart.replace(/^['"]|['"]$/g, "");
      const negation = isNegated ? ".not" : "";
      return `await expect(page)${negation}.toHaveTitle(/${titleContent}/)`;
    }
  }

  return "";
}

function transformLocationAssertion(chain: Array<{ method: string; args: Node | null; callNode: Node }>): string {
  const locationItem = chain.find((c) => c.method === "location");
  const shouldItem = chain.find((c) => c.method === "should");

  if (!locationItem || !shouldItem) return "";

  const argsChildren = locationItem.args?.children().filter((c) => c.isNamed()) ?? [];
  const part = getStringContent(argsChildren[0] ?? null);

  const { assertion, restArgs } = parseAssertionArgs(shouldItem.args);

  if ((assertion === "eq" || assertion === "equal") && restArgs.length > 0) {
    if (part) {
      return `expect(new URL(page.url()).${part}).toBe(${restArgs[0]})`;
    }
  }

  return "";
}

function transformHashAssertion(chain: Array<{ method: string; args: Node | null; callNode: Node }>): string {
  const shouldItem = chain.find((c) => c.method === "should");
  if (!shouldItem) return "";

  const { assertion, restArgs } = parseAssertionArgs(shouldItem.args);

  if ((assertion === "eq" || assertion === "equal") && restArgs.length > 0) {
    return `expect(new URL(page.url()).hash).toBe(${restArgs[0]})`;
  }

  return "";
}

function transformCyExpression(node: Node, ctx: TransformContext): void {
  if (ctx.processedNodes.has(node.id())) return;

  const chain = findCyChainMethods(node);
  if (chain.length === 0) return;

  const firstMethod = chain[0];
  if (!firstMethod) return;

  let result = "";

  if (firstMethod.method === "url") {
    result = transformUrlAssertion(chain);
  } else if (firstMethod.method === "title") {
    result = transformTitleAssertion(chain);
  } else if (firstMethod.method === "location") {
    result = transformLocationAssertion(chain);
  } else if (firstMethod.method === "hash") {
    result = transformHashAssertion(chain);
  } else {
    result = transformCyGetChain(chain);
  }

  if (result) {
    ctx.edits.push(node.replace(result));
    ctx.hasCypressCode = true;
    ctx.processedNodes.add(node.id());
  }
}

function hasNestedCyCommands(node: Node): boolean {
  const cyMatches = node.findAll({
    rule: {
      kind: "member_expression",
      has: {
        field: "object",
        kind: "identifier",
        regex: "^cy$",
      },
    },
  });

  return cyMatches.length > 0;
}

const transform: Transform<Language> = async (root: Root): Promise<string | null> => {
  const rootNode = root.root();

  const ctx: TransformContext = {
    edits: [],
    hasCypressCode: false,
    processedNodes: new Set(),
  };

  // Test function mapping
  // needsAsync: whether to add async keyword
  // needsPage: whether to add { page } parameter
  const testFunctionMap: Record<string, { newName: string; needsAsync: boolean; needsPage: boolean }> = {
    describe: { newName: "test.describe", needsAsync: false, needsPage: false },
    context: { newName: "test.describe", needsAsync: false, needsPage: false },
    it: { newName: "test", needsAsync: true, needsPage: true },
    specify: { newName: "test", needsAsync: true, needsPage: true },
    before: { newName: "test.beforeAll", needsAsync: true, needsPage: false },
    beforeEach: { newName: "test.beforeEach", needsAsync: true, needsPage: true },
    after: { newName: "test.afterAll", needsAsync: true, needsPage: false },
    afterEach: { newName: "test.afterEach", needsAsync: true, needsPage: true },
  };

  // Find test functions and transform their identifiers and callbacks
  const testFunctions = rootNode.findAll({
    rule: {
      kind: "call_expression",
      has: {
        field: "function",
        kind: "identifier",
        regex: "^(describe|it|before|beforeEach|after|afterEach|context|specify)$",
      },
    },
  });

  for (const testFunc of testFunctions) {
    const callee = testFunc.field("function");
    if (!callee) continue;

    const funcName = callee.text();
    const mapping = testFunctionMap[funcName];

    if (mapping) {
      // Replace the function identifier
      ctx.edits.push(callee.replace(mapping.newName));
      ctx.hasCypressCode = true;

      // Find the callback and transform it
      const args = testFunc.field("arguments");
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const callback = argsChildren.find((c) => c.is("arrow_function") || c.is("function_expression"));

      if (callback) {
        const needsAsync = mapping.needsAsync;
        const needsPage = mapping.needsPage;

        // Skip transformation for describe - it doesn't need async
        if (!needsAsync) {
          continue;
        }

        // Get the callback parameters
        const params = callback.field("parameters");

        if (params) {
          // Replace the parameters
          if (needsPage) {
            ctx.edits.push(params.replace("async ({ page })"));
          } else {
            ctx.edits.push(params.replace("async ()"));
          }
        } else {
          // Arrow function with single parameter (no parens)
          const param = callback.field("parameter");
          if (param) {
            if (needsPage) {
              ctx.edits.push(param.replace("async ({ page })"));
            } else {
              ctx.edits.push(param.replace("async ()"));
            }
          }
        }
      }
    }
  }

  // Find and transform all cy expressions
  const allCallExpressions = rootNode.findAll({
    rule: {
      kind: "call_expression",
    },
  });

  for (const callExpr of allCallExpressions) {
    if (ctx.processedNodes.has(callExpr.id())) continue;

    if (isCyCommand(callExpr)) {
      // Check if this is the outermost cy chain
      const parent = callExpr.parent();
      if (parent?.is("member_expression")) {
        const grandparent = parent.parent();
        if (grandparent?.is("call_expression") && isCyCommand(grandparent)) {
          continue;
        }
      }

      transformCyExpression(callExpr, ctx);
    }
  }

  if (!ctx.hasCypressCode) {
    return null;
  }

  // Commit all edits
  let newSource = rootNode.commitEdits(ctx.edits);

  // Add the Playwright import at the beginning
  if (!newSource.includes("from '@playwright/test'") && !newSource.includes('from "@playwright/test"')) {
    newSource = `import { test, expect } from '@playwright/test';\n\n${newSource}`;
  }

  return newSource;
};

export default transform;
