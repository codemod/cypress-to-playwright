import type { Transform } from "codemod:ast-grep";
import type { SgNode, SgRoot, Edit } from "@codemod.com/jssg-types/main";
import type TS from "codemod:ast-grep/langs/typescript";

type Language = TS;
type Node = SgNode<Language>;
type Root = SgRoot<Language>;

/**
 * Cypress Config to Playwright Config Migration
 *
 * Transforms cypress.config.ts to playwright.config.ts structure.
 * This creates a new Playwright config based on Cypress config values.
 */

interface ConfigValues {
  baseUrl?: string;
  viewportWidth?: string;
  viewportHeight?: string;
  defaultTimeout?: string;
  video?: string;
  screenshotOnFailure?: string;
  retries?: string;
  specPattern?: string;
}

function getPropertyValue(node: Node, propertyName: string): string | null {
  // Find pair nodes that have a property_identifier matching the name
  const pairs = node.findAll({
    rule: { kind: "pair" },
  });

  for (const pair of pairs) {
    const key = pair.find({
      rule: { kind: "property_identifier", regex: `^${propertyName}$` },
    });

    if (key) {
      // Get all named children and find the value (not the property_identifier)
      const children = pair.children().filter((c) => c.isNamed());
      const valueNode = children.find((c) => !c.is("property_identifier"));
      return valueNode?.text() ?? null;
    }
  }
  return null;
}

function extractE2eConfig(rootNode: Node): ConfigValues {
  const config: ConfigValues = {};

  // Find defineConfig call
  const defineConfigCall = rootNode.find({
    rule: {
      kind: "call_expression",
      has: {
        field: "function",
        regex: "^defineConfig$",
      },
    },
  });

  if (!defineConfigCall) {
    return config;
  }

  const args = defineConfigCall.field("arguments");
  if (!args) return config;

  const configObject = args.find({ rule: { kind: "object" } });
  if (!configObject) return config;

  // Get top-level config values
  config.baseUrl = getPropertyValue(configObject, "baseUrl") ?? undefined;
  config.viewportWidth = getPropertyValue(configObject, "viewportWidth") ?? undefined;
  config.viewportHeight = getPropertyValue(configObject, "viewportHeight") ?? undefined;
  config.defaultTimeout = getPropertyValue(configObject, "defaultCommandTimeout") ?? undefined;
  config.video = getPropertyValue(configObject, "video") ?? undefined;
  config.screenshotOnFailure = getPropertyValue(configObject, "screenshotOnRunFailure") ?? undefined;
  config.retries = getPropertyValue(configObject, "retries") ?? undefined;

  // Look for e2e config block
  const e2eProperty = configObject.find({
    rule: {
      kind: "pair",
      has: {
        field: "key",
        regex: "^e2e$",
      },
    },
  });

  if (e2eProperty) {
    const e2eValue = e2eProperty.field("value");
    if (e2eValue?.is("object")) {
      config.baseUrl = config.baseUrl ?? getPropertyValue(e2eValue, "baseUrl") ?? undefined;
      config.specPattern = getPropertyValue(e2eValue, "specPattern") ?? undefined;
    }
  }

  return config;
}

function generatePlaywrightConfig(config: ConfigValues): string {
  const lines: string[] = [
    `import { defineConfig, devices } from '@playwright/test';`,
    ``,
    `/**`,
    ` * Playwright configuration - migrated from Cypress`,
    ` * @see https://playwright.dev/docs/test-configuration`,
    ` */`,
    `export default defineConfig({`,
  ];

  // Test directory
  lines.push(`  testDir: './tests',`);

  // Timeout
  if (config.defaultTimeout) {
    lines.push(`  timeout: ${config.defaultTimeout},`);
  } else {
    lines.push(`  timeout: 30000,`);
  }

  // Retries
  if (config.retries) {
    lines.push(`  retries: ${config.retries},`);
  }

  // Reporter
  lines.push(`  reporter: 'html',`);

  // Use section
  lines.push(`  use: {`);

  if (config.baseUrl) {
    lines.push(`    baseURL: ${config.baseUrl},`);
  }

  // Viewport
  if (config.viewportWidth && config.viewportHeight) {
    lines.push(`    viewport: { width: ${config.viewportWidth}, height: ${config.viewportHeight} },`);
  }

  // Video
  if (config.video === "true") {
    lines.push(`    video: 'on',`);
  } else if (config.video === "false") {
    lines.push(`    video: 'off',`);
  } else {
    lines.push(`    video: 'on-first-retry',`);
  }

  // Screenshot
  if (config.screenshotOnFailure === "true") {
    lines.push(`    screenshot: 'only-on-failure',`);
  }

  // Trace
  lines.push(`    trace: 'on-first-retry',`);

  lines.push(`  },`);

  // Projects for different browsers
  lines.push(`  projects: [`);
  lines.push(`    {`);
  lines.push(`      name: 'chromium',`);
  lines.push(`      use: { ...devices['Desktop Chrome'] },`);
  lines.push(`    },`);
  lines.push(`    // Uncomment to add more browsers:`);
  lines.push(`    // {`);
  lines.push(`    //   name: 'firefox',`);
  lines.push(`    //   use: { ...devices['Desktop Firefox'] },`);
  lines.push(`    // },`);
  lines.push(`    // {`);
  lines.push(`    //   name: 'webkit',`);
  lines.push(`    //   use: { ...devices['Desktop Safari'] },`);
  lines.push(`    // },`);
  lines.push(`  ],`);

  // Web server (if baseUrl suggests local server)
  if (config.baseUrl?.includes("localhost") || config.baseUrl?.includes("127.0.0.1")) {
    lines.push(`  // Configure web server to start before tests`);
    lines.push(`  // webServer: {`);
    lines.push(`  //   command: 'npm run start',`);
    lines.push(`  //   url: ${config.baseUrl},`);
    lines.push(`  //   reuseExistingServer: !process.env.CI,`);
    lines.push(`  // },`);
  }

  lines.push(`});`);

  return lines.join("\n");
}

const transform: Transform<Language> = async (root: Root): Promise<string | null> => {
  const rootNode = root.root();
  const fullText = rootNode.text();

  // Check if this is a Cypress config file
  if (!fullText.includes("cypress") && !fullText.includes("defineConfig")) {
    return null;
  }

  // Extract configuration values
  const config = extractE2eConfig(rootNode);

  // Generate Playwright config
  const playwrightConfig = generatePlaywrightConfig(config);

  return playwrightConfig;
};

export default transform;
