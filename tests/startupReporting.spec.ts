import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import type runExtension from "roamjs-components/util/runExtension";

type StartupReport = {
  domain: string;
  path: string;
  data: Record<string, unknown>;
};

test("startup error reports omit the graph name", async () => {
  const packageFile = require.resolve("roamjs-components/util/runExtension");
  const exports: { default?: typeof runExtension } = {};
  const graphName = "private-fixture-graph";
  const reports: StartupReport[] = [];
  const mockModules = {
    "../dom/addStyle": () => ({ remove: () => {} }),
    "react-dom": {},
    "./env": {
      getNodeEnv: () => "production",
      getRoamJSExtensionIdEnv: () => "giphy",
      getRoamJSVersionEnv: () => "test",
    },
    "./extensionApiContext": { provideExtensionApi: () => {} },
    "./apiPost": async (report: StartupReport) => {
      reports.push(report);
    },
    "../components/Toast": () => {},
    tslib: require("tslib"),
  };
  runInNewContext(readFileSync(packageFile, "utf8"), {
    exports,
    require: (name: keyof typeof mockModules) => {
      if (!(name in mockModules)) throw new Error(`Unexpected import ${name}`);
      return mockModules[name];
    },
    window: { roamAlphaAPI: { graph: { name: graphName } } },
    document: { body: { addEventListener: () => {} } },
    process: { env: { VERSION: "test" } },
    console: { error: () => {} },
  });

  const extension = exports.default!(async () => {
    throw new Error("synthetic startup failure");
  });
  extension.onload({
    extensionAPI: { settings: { getAll: () => ({ fixture: true }) } },
    extension: { version: "test" },
  } as Parameters<typeof extension.onload>[0]);

  await expect.poll(() => reports.length).toBe(1);
  const [report] = reports;
  expect(report.domain).toBe("https://api.samepage.network");
  expect(report.path).toBe("errors");
  expect(report.data).toMatchObject({
    method: "extension-error",
    data: { settings: { fixture: true } },
  });
  expect(report.data).not.toHaveProperty("notebookUuid");
  expect(JSON.stringify(report.data)).not.toContain(graphName);
});
