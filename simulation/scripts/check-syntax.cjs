let ts;
try {
  ts = require("typescript");
} catch {
  ts = require("../work/compiler/package/lib/typescript.js");
}
const fs = require("node:fs");
const path = require("node:path");
let count = 0,
  errors = 0;
for (const root of ["frontend/src", "backend/src", "backend/test", "shared"]) {
  for (const file of fs.readdirSync(root, { recursive: true })) {
    if (!/\.tsx?$/.test(file)) continue;
    const name = path.join(root, file);
    const result = ts.transpileModule(fs.readFileSync(name, "utf8"), {
      fileName: name,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
      reportDiagnostics: true,
    });
    for (const d of result.diagnostics ?? []) {
      if (d.category === ts.DiagnosticCategory.Error) {
        console.error(
          name,
          ts.flattenDiagnosticMessageText(d.messageText, "\n"),
        );
        errors++;
      }
    }
    count++;
  }
}
console.log(
  `TypeScript syntax: ${count} files, ${errors} errors. This is not dependency-aware typechecking.`,
);
process.exitCode = errors ? 1 : 0;
