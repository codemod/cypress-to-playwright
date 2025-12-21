import type { Transform } from "codemod:ast-grep";
import type { SgNode, SgRoot, Edit } from "@codemod.com/jssg-types/main";
import type TS from "codemod:ast-grep/langs/typescript";

type Language = TS;
type Node = SgNode<Language>;
type Root = SgRoot<Language>;

/**
 * Cypress to Playwright Migration Codemod
 *
 * Uses semantic analysis to ensure we only transform actual Cypress code,
 * not code that happens to use similar naming patterns.
 */

// Maps Cypress assertion methods to Playwright assertion methods
const ASSERTION_MAP: Record<string, { method: string; argsTransform?: string }> = {
  // Visibility
  "be.visible": { method: "toBeVisible" },
  "be.hidden": { method: "toBeHidden" },
  "be.invisible": { method: "toBeHidden" },

  // Existence
  "exist": { method: "toBeAttached" },
  "be.exist": { method: "toBeAttached" },

  // Text content
  "have.text": { method: "toHaveText" },
  "contain": { method: "toContainText" },
  "contain.text": { method: "toContainText" },
  "include.text": { method: "toContainText" },

  // Form elements
  "have.value": { method: "toHaveValue" },
  "be.disabled": { method: "toBeDisabled" },
  "be.enabled": { method: "toBeEnabled" },
  "be.checked": { method: "toBeChecked" },
  "be.selected": { method: "toBeChecked" },
  "be.focused": { method: "toBeFocused" },
  "have.focus": { method: "toBeFocused" },
  "be.empty": { method: "toBeEmpty" },

  // Attributes and classes
  "have.class": { method: "toHaveClass", argsTransform: "regex" },
  "have.attr": { method: "toHaveAttribute" },
  "have.id": { method: "toHaveId" },
  "have.prop": { method: "toHaveJSProperty" },
  "have.css": { method: "toHaveCSS" },
  "have.data": { method: "toHaveAttribute" }, // data-* attributes

  // Count
  "have.length": { method: "toHaveCount" },
  "have.length.gt": { method: "toHaveCount" }, // needs special handling
  "have.length.gte": { method: "toHaveCount" },
  "have.length.lt": { method: "toHaveCount" },
  "have.length.lte": { method: "toHaveCount" },

  // Equality (for values/text)
  "eq": { method: "toHaveText" },
  "equal": { method: "toHaveText" },
  "include": { method: "toContainText" },
  "match": { method: "toHaveText" }, // regex match

  // State
  "be.readonly": { method: "toHaveAttribute" }, // needs 'readonly' arg
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
  confirmedCyGlobalNodes: Set<number>;
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

/**
 * Check if a `cy` identifier is the Cypress global (not a local variable).
 * Uses semantic analysis when available, falls back to heuristics.
 */
function isCypressGlobal(cyNode: Node): boolean {
  // Use semantic analysis to check definition
  const def = cyNode.definition();

  if (def) {
    // If it has a local or import definition, it's NOT the Cypress global
    // The Cypress `cy` global should have no definition in the file
    if (def.kind === "local") {
      return false;
    }
    if (def.kind === "import") {
      // Check if it's imported from cypress
      const defText = def.node.text();
      if (!defText.includes("cypress")) {
        return false;
      }
    }
  }

  // If no definition found, it's likely the global
  // But also check the parent scope for local declarations
  const ancestors = cyNode.ancestors();
  for (const ancestor of ancestors) {
    // Check if there's a variable declaration for 'cy' in this scope
    if (ancestor.is("statement_block") || ancestor.is("program")) {
      const localCyDeclarations = ancestor.findAll({
        rule: {
          any: [
            { pattern: "const cy = $VALUE" },
            { pattern: "let cy = $VALUE" },
            { pattern: "var cy = $VALUE" },
            { pattern: "function cy($$$PARAMS) { $$$BODY }" },
          ],
        },
      });

      if (localCyDeclarations.length > 0) {
        // Check if the declaration is before this usage
        for (const decl of localCyDeclarations) {
          if (decl.range().start.index < cyNode.range().start.index) {
            return false; // There's a local declaration before this usage
          }
        }
      }
    }
  }

  return true;
}

function isCyCommand(node: Node, ctx: TransformContext): boolean {
  if (!node.is("call_expression")) return false;

  const callee = node.field("function");
  if (!callee) return false;

  if (callee.is("member_expression")) {
    const obj = callee.field("object");

    if (obj?.text() === "cy" && obj.is("identifier")) {
      // Verify it's the Cypress global
      if (!isCypressGlobal(obj)) {
        return false;
      }
      ctx.confirmedCyGlobalNodes.add(obj.id());
      return true;
    }

    if (obj?.is("call_expression")) {
      return isCyCommand(obj, ctx);
    }
  }

  return false;
}

/**
 * Check if a file contains actual Cypress cy.* commands.
 * This is used to determine if we should transform test functions.
 */
function fileHasCypressCommands(rootNode: Node): boolean {
  // Find any cy.* member expressions
  const cyMemberExprs = rootNode.findAll({
    rule: {
      kind: "member_expression",
      has: {
        field: "object",
        kind: "identifier",
        regex: "^cy$",
      },
    },
  });

  // For each cy reference, verify it's the global
  for (const expr of cyMemberExprs) {
    const obj = expr.field("object");
    if (obj && isCypressGlobal(obj)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a describe/it/etc call looks like a test framework call.
 * Handles two patterns:
 * - describe/it/context/specify: (string, callback)
 * - before/beforeEach/after/afterEach: (callback) OR (string, callback)
 */
function isTestFrameworkCall(node: Node): boolean {
  if (!node.is("call_expression")) return false;

  const callee = node.field("function");
  if (!callee?.is("identifier")) return false;

  const funcName = callee.text();
  const args = node.field("arguments");
  if (!args) return false;

  const argsChildren = args.children().filter((c) => c.isNamed());

  // Hooks (before, beforeEach, after, afterEach) can have just a callback
  const isHook = ["before", "beforeEach", "after", "afterEach"].includes(funcName);

  if (isHook) {
    // Hooks can have: (callback) or (string, callback)
    if (argsChildren.length === 1) {
      const firstArg = argsChildren[0];
      // Single arg should be a function
      return firstArg?.is("arrow_function") || firstArg?.is("function_expression") || false;
    } else if (argsChildren.length >= 2) {
      const firstArg = argsChildren[0];
      const secondArg = argsChildren[1];
      // If two args, first should be string, second should be function
      const firstIsString = firstArg?.is("string") || firstArg?.is("template_string");
      const secondIsFunc = secondArg?.is("arrow_function") || secondArg?.is("function_expression");
      return (firstIsString && secondIsFunc) || false;
    }
    return false;
  }

  // describe/it/context/specify require (string, callback)
  if (argsChildren.length < 2) return false;

  const firstArg = argsChildren[0];
  const secondArg = argsChildren[1];

  // First arg should be a string
  if (!firstArg?.is("string") && !firstArg?.is("template_string")) {
    return false;
  }

  // Second arg should be a function
  if (!secondArg?.is("arrow_function") && !secondArg?.is("function_expression")) {
    return false;
  }

  return true;
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
    } else if (method === "request") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      if (argsChildren.length === 1) {
        // Simple GET request: cy.request('/api/users')
        const url = argsChildren[0]?.text() ?? "''";
        result = `await page.request.get(${url})`;
      } else if (argsChildren.length >= 2) {
        // cy.request('POST', '/api/users', body) or cy.request({ method, url, body })
        const firstArg = argsChildren[0];
        if (firstArg?.is("object")) {
          result = `await page.request.fetch(/* TODO: migrate cy.request with options object */)`;
        } else {
          const methodArg = getStringContent(firstArg ?? null)?.toUpperCase() ?? "GET";
          const url = argsChildren[1]?.text() ?? "''";
          const body = argsChildren[2]?.text();
          const playwrightMethod = methodArg.toLowerCase();
          if (body) {
            result = `await page.request.${playwrightMethod}(${url}, { data: ${body} })`;
          } else {
            result = `await page.request.${playwrightMethod}(${url})`;
          }
        }
      }
    } else if (method === "fixture") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const fixturePath = getStringContent(argsChildren[0] ?? null) ?? "";
      result = `// TODO: Migrate cy.fixture('${fixturePath}') - use import or fs.readFileSync in Playwright`;
    } else if (method === "wrap") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const value = argsChildren[0]?.text() ?? "null";
      // cy.wrap just wraps a value for chaining - in Playwright just use the value directly
      currentLocator = value;
    } else if (method === "invoke") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const methodName = getStringContent(argsChildren[0] ?? null) ?? "";
      const invokeArgs = argsChildren.slice(1).map((c) => c.text()).join(", ");
      if (invokeArgs) {
        result = `await ${currentLocator}.evaluate((el) => el.${methodName}(${invokeArgs}))`;
      } else {
        result = `await ${currentLocator}.evaluate((el) => el.${methodName}())`;
      }
    } else if (method === "its") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const propPath = getStringContent(argsChildren[0] ?? null) ?? "";
      // .its() accesses a property - convert to evaluate
      currentLocator = `await ${currentLocator}.evaluate((el) => el.${propPath})`;
    } else if (method === "scrollTo") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const position = getStringContent(argsChildren[0] ?? null);
      if (position === "bottom") {
        result = `await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))`;
      } else if (position === "top") {
        result = `await page.evaluate(() => window.scrollTo(0, 0))`;
      } else if (argsChildren.length >= 2) {
        const x = argsChildren[0]?.text() ?? "0";
        const y = argsChildren[1]?.text() ?? "0";
        result = `await page.evaluate(() => window.scrollTo(${x}, ${y}))`;
      } else {
        result = `await page.evaluate(() => window.scrollTo(0, 0)); // TODO: Verify scroll position`;
      }
    } else if (method === "window") {
      // cy.window() returns the window object
      currentLocator = "page";
    } else if (method === "document") {
      // cy.document() returns the document
      currentLocator = "page";
    } else if (method === "focused") {
      // cy.focused() gets the currently focused element
      currentLocator = `page.locator(':focus')`;
    } else if (method === "siblings") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      if (argsChildren.length > 0) {
        const selector = argsChildren[0]?.text() ?? "";
        currentLocator = `${currentLocator}.locator(\`~ ${selector.replace(/^['"]|['"]$/g, '')}\`)`;
      } else {
        currentLocator = `${currentLocator}.locator('~ *')`;
      }
    } else if (method === "next") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      if (argsChildren.length > 0) {
        const selector = argsChildren[0]?.text() ?? "";
        currentLocator = `${currentLocator}.locator(\`+ ${selector.replace(/^['"]|['"]$/g, '')}\`)`;
      } else {
        currentLocator = `${currentLocator}.locator('+ *')`;
      }
    } else if (method === "prev") {
      // CSS doesn't have a previous sibling selector - need XPath or evaluate
      currentLocator = `${currentLocator}.locator('xpath=preceding-sibling::*[1]')`;
    } else if (method === "filter") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const selector = argsChildren[0]?.text() ?? "''";
      currentLocator = `${currentLocator}.filter({ has: page.locator(${selector}) })`;
    } else if (method === "not") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const selector = argsChildren[0]?.text() ?? "''";
      currentLocator = `${currentLocator}.filter({ hasNot: page.locator(${selector}) })`;
    } else if (method === "within") {
      // cy.within() scopes subsequent commands - just keep the locator
      // The callback inside within needs special handling
      result = `// TODO: Migrate .within() - scope subsequent locators to this element`;
    } else if (method === "each") {
      result = `// TODO: Migrate .each() - use for loop with locator.all() in Playwright`;
    } else if (method === "spread") {
      result = `// TODO: Migrate .spread() - use destructuring in Playwright`;
    } else if (method === "exec") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const command = argsChildren[0]?.text() ?? "''";
      result = `// TODO: Migrate cy.exec(${command}) - use child_process or test fixtures in Playwright`;
    } else if (method === "readFile") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const filePath = argsChildren[0]?.text() ?? "''";
      result = `// TODO: Migrate cy.readFile(${filePath}) - use fs.readFileSync in Playwright`;
    } else if (method === "writeFile") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const filePath = argsChildren[0]?.text() ?? "''";
      result = `// TODO: Migrate cy.writeFile(${filePath}) - use fs.writeFileSync in Playwright`;
    } else if (method === "getCookie") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const cookieName = argsChildren[0]?.text() ?? "''";
      result = `await page.context().cookies().then(cookies => cookies.find(c => c.name === ${cookieName}))`;
    } else if (method === "getCookies") {
      result = `await page.context().cookies()`;
    } else if (method === "setCookie") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const name = argsChildren[0]?.text() ?? "''";
      const value = argsChildren[1]?.text() ?? "''";
      result = `await page.context().addCookies([{ name: ${name}, value: ${value}, url: page.url() }])`;
    } else if (method === "clearCookie") {
      const argsChildren = args?.children().filter((c) => c.isNamed()) ?? [];
      const cookieName = getStringContent(argsChildren[0] ?? null) ?? "";
      result = `// TODO: Migrate cy.clearCookie('${cookieName}') - use page.context().clearCookies() with filter`;
    } else if (method === "pause") {
      result = `await page.pause(); // Opens Playwright Inspector for debugging`;
    } else if (method === "debug") {
      result = `await page.pause(); // cy.debug() equivalent - opens Playwright Inspector`;
    } else if (method === "hover") {
      result = `await ${currentLocator}.hover()`;
    } else if (method === "rightclick") {
      result = `await ${currentLocator}.click({ button: 'right' })`;
    } else if (method === "submit") {
      // Form submit - Playwright doesn't have direct submit, use evaluate
      result = `await ${currentLocator}.evaluate((form) => form.submit())`;
    } else if (method === "scrollIntoView") {
      result = `await ${currentLocator}.scrollIntoViewIfNeeded()`;
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
    confirmedCyGlobalNodes: new Set(),
  };

  // CRITICAL: First check if this file actually has Cypress commands
  // Only transform test functions if there are real cy.* calls
  const hasCyCommands = fileHasCypressCommands(rootNode);

  if (!hasCyCommands) {
    // No Cypress commands found - don't transform anything
    return null;
  }

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
    // Verify this looks like a test framework call (string, callback pattern)
    if (!isTestFrameworkCall(testFunc)) {
      continue;
    }

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

    if (isCyCommand(callExpr, ctx)) {
      // Check if this is the outermost cy chain
      const parent = callExpr.parent();
      if (parent?.is("member_expression")) {
        const grandparent = parent.parent();
        if (grandparent?.is("call_expression") && isCyCommand(grandparent, ctx)) {
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
