import type { AuxiliarySource } from "@/components/workbench/auxiliary-sidebar/AuxiliarySidebar";
import type { InspectorFileSystem } from "@/components/workbench/auxiliary-sidebar/panels/FileExplorer";
import {
  componentActivityExamples,
  componentFixtureCwd,
  componentFixtureFiles,
} from "./conversation-component-examples";

function fixtureFileSystem(files: Record<string, string>): InspectorFileSystem {
  return {
    async readFile(path) {
      if (files[path] === undefined)
        throw new Error("示例文件不存在，请检查路径。");
      return files[path];
    },
    async listDir(path) {
      const prefix = `${path.replace(/\/$/, "")}/`;
      const entries = new Map<string, { name: string; isDirectory: boolean }>();
      for (const file of Object.keys(files)) {
        if (!file.startsWith(prefix)) continue;
        const [name, ...rest] = file.slice(prefix.length).split("/");
        entries.set(name, { name, isDirectory: rest.length > 0 });
      }
      return [...entries.values()];
    },
  };
}
export const componentInspectorSource: AuxiliarySource = {
  sessionId: "component-gallery",
  workspacePath: componentFixtureCwd,
  fileSystem: fixtureFileSystem(componentFixtureFiles),
  readThread: {
    schemaVersion: 2,
    thread: {
      id: "component-gallery",
      title: "组件展示",
      preview: "",
      cwd: componentFixtureCwd,
      status: { type: "idle" },
    },
    page: {
      order: "newest_first",
      limit: 100,
      nextCursor: null,
      hasMore: false,
    },
    turns: [
      {
        id: "component-gallery-items",
        zone: "workspace",
        status: "completed",
        error: null,
        items: componentActivityExamples.map((example) => example.item),
      },
      {
        id: "component-gallery-earlier",
        zone: "workspace",
        status: "completed",
        error: null,
        items: [
          {
            id: "earlier-changes",
            type: "fileChange",
            status: "completed",
            settled: true,
            changes: [
              {
                path: "example.css",
                kind: "update",
                diff: {
                  text: "@@ -1 +1 @@\n-color: white;\n+color: #fff;",
                  truncated: false,
                },
              },
              {
                path: "src/theme.ts",
                kind: "update",
                diff: {
                  text: "@@ -3 +3 @@\n-  text: '#fff',\n+  text: 'var(--text-1)',",
                  truncated: false,
                },
              },
              {
                path: "src/ui/index.ts",
                kind: "add",
                diff: {
                  text: "@@ -0,0 +1,2 @@\n+// UI 组件入口示例\n+export { Button } from './button';",
                  truncated: false,
                },
              },
            ],
          },
        ],
      },
    ],
  },
};
export const detailsInspectorFileSystem = fixtureFileSystem({
  "/fixture/src/example.ts":
    "const first = 1;\nconst second = 2;\nconst answer = 42;\n",
});
