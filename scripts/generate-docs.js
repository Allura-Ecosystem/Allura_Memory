#!/usr/bin/env node
/**
 * API Documentation Generator
 * Extracts JSDoc/TSDoc annotations and generates markdown documentation
 * 
 * Usage:
 *   node scripts/generate-docs.js [options]
 * 
 * Options:
 *   --output=DIR    Output directory (default: docs/archive/allura/generated/api)
 *   --format=TYPE   Output format: markdown, html (default: markdown)
 */

const fs = require("fs");
const path = require("path");

// Configuration
const config = {
  srcDir: path.join(__dirname, "..", "src", "lib"),
  outputDir: path.join(__dirname, "..", "docs", "archive", "allura", "generated", "api"),
  format: "markdown",
};

// Parse CLI args
process.argv.slice(2).forEach((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  if (key === "output") config.outputDir = path.resolve(value);
  if (key === "format") config.format = value;
});

/**
 * Extract JSDoc comments from a TypeScript file
 */
function extractJSDoc(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const docs = [];

  let inDoc = false;
  let currentDoc = null;
  let currentName = null;
  let currentKind = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Start of JSDoc comment
    if (line.startsWith("/**")) {
      inDoc = true;
      currentDoc = { description: [], params: [], returns: null, examples: [], throws: [] };
      continue;
    }

    // End of JSDoc comment
    if (line.endsWith("*/") && inDoc) {
      inDoc = false;
      continue;
    }

    // Inside JSDoc comment
    if (inDoc) {
      const docLine = line.replace(/^\* ?/, "");

      if (docLine.startsWith("@param")) {
        const match = docLine.match(/@param\s+(?:\{([^}]+)\}\s+)?(\w+)\s*(.*)/);
        if (match) {
          currentDoc.params.push({
            name: match[2],
            type: match[1] || "unknown",
            description: match[3].trim(),
          });
        }
      } else if (docLine.startsWith("@returns") || docLine.startsWith("@return")) {
        const match = docLine.match(/@(?:returns?|return)\s+(?:\{([^}]+)\}\s+)?(.*)/);
        if (match) {
          currentDoc.returns = {
            type: match[1] || "void",
            description: match[2].trim(),
          };
        }
      } else if (docLine.startsWith("@example")) {
        currentDoc.examples.push(docLine.replace("@example", "").trim());
      } else if (docLine.startsWith("@throws")) {
        const match = docLine.match(/@throws\s+(?:\{([^}]+)\}\s+)?(.*)/);
        if (match) {
          currentDoc.throws.push({
            type: match[1] || "Error",
            description: match[2].trim(),
          });
        }
      } else if (!docLine.startsWith("@")) {
        currentDoc.description.push(docLine);
      }
      continue;
    }

    // Look for function/class/interface/export declarations after JSDoc
    if (currentDoc && !inDoc) {
      // Function declaration
      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (funcMatch) {
        currentName = funcMatch[1];
        currentKind = "function";
        docs.push({ name: currentName, kind: currentKind, ...currentDoc });
        currentDoc = null;
        continue;
      }

      // Class declaration
      const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
      if (classMatch) {
        currentName = classMatch[1];
        currentKind = "class";
        docs.push({ name: currentName, kind: currentKind, ...currentDoc });
        currentDoc = null;
        continue;
      }

      // Interface declaration
      const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
      if (interfaceMatch) {
        currentName = interfaceMatch[1];
        currentKind = "interface";
        docs.push({ name: currentName, kind: currentKind, ...currentDoc });
        currentDoc = null;
        continue;
      }

      // Type declaration
      const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)/);
      if (typeMatch) {
        currentName = typeMatch[1];
        currentKind = "type";
        docs.push({ name: currentName, kind: currentKind, ...currentDoc });
        currentDoc = null;
        continue;
      }

      // Const/let declaration with function
      const constMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|function)/);
      if (constMatch) {
        currentName = constMatch[1];
        currentKind = "function";
        docs.push({ name: currentName, kind: currentKind, ...currentDoc });
        currentDoc = null;
        continue;
      }
    }
  }

  return docs;
}

/**
 * Generate markdown documentation for a module
 */
function generateMarkdown(moduleName, docs) {
  const lines = [];

  lines.push(`# ${moduleName}`);
  lines.push("");
  lines.push(`> API documentation for \`${moduleName}\` module.`);
  lines.push("");

  // Group by kind
  const functions = docs.filter((d) => d.kind === "function");
  const classes = docs.filter((d) => d.kind === "class");
  const interfaces = docs.filter((d) => d.kind === "interface");
  const types = docs.filter((d) => d.kind === "type");

  // Functions
  if (functions.length > 0) {
    lines.push("## Functions");
    lines.push("");

    for (const fn of functions) {
      lines.push(`### \`${fn.name}\``);
      lines.push("");

      if (fn.description.length > 0) {
        lines.push(fn.description.join(" ").trim());
        lines.push("");
      }

      if (fn.params.length > 0) {
        lines.push("**Parameters:**");
        lines.push("");
        lines.push("| Name | Type | Description |");
        lines.push("|------|------|-------------|");
        for (const param of fn.params) {
          lines.push(`| \`${param.name}\` | \`${param.type}\` | ${param.description} |`);
        }
        lines.push("");
      }

      if (fn.returns) {
        lines.push("**Returns:**");
        lines.push("");
        lines.push(`\`${fn.returns.type}\` - ${fn.returns.description}`);
        lines.push("");
      }

      if (fn.throws.length > 0) {
        lines.push("**Throws:**");
        lines.push("");
        for (const thr of fn.throws) {
          lines.push(`- \`${thr.type}\` - ${thr.description}`);
        }
        lines.push("");
      }

      if (fn.examples.length > 0) {
        lines.push("**Example:**");
        lines.push("");
        for (const ex of fn.examples) {
          lines.push("```typescript");
          lines.push(ex);
          lines.push("```");
        }
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }
  }

  // Classes
  if (classes.length > 0) {
    lines.push("## Classes");
    lines.push("");

    for (const cls of classes) {
      lines.push(`### \`${cls.name}\``);
      lines.push("");

      if (cls.description.length > 0) {
        lines.push(cls.description.join(" ").trim());
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }
  }

  // Interfaces
  if (interfaces.length > 0) {
    lines.push("## Interfaces");
    lines.push("");

    for (const iface of interfaces) {
      lines.push(`### \`${iface.name}\``);
      lines.push("");

      if (iface.description.length > 0) {
        lines.push(iface.description.join(" ").trim());
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }
  }

  // Types
  if (types.length > 0) {
    lines.push("## Type Definitions");
    lines.push("");

    for (const type of types) {
      lines.push(`### \`${type.name}\``);
      lines.push("");

      if (type.description.length > 0) {
        lines.push(type.description.join(" ").trim());
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Generate index page
 */
function generateIndex(modules) {
  const lines = [];

  lines.push("# API Documentation");
  lines.push("");
  lines.push("> Unified Knowledge System - Auto-generated API reference");
  lines.push("");
  lines.push("## Modules");
  lines.push("");
  lines.push("| Module | Description |");
  lines.push("|--------|-------------|");

  for (const mod of modules) {
    lines.push(`| [\`${mod.name}\`](./${mod.name}.md) | ${mod.description} |`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*Generated automatically from JSDoc annotations.*");
  lines.push("");

  return lines.join("\n");
}

/**
 * Process all modules
 */
function main() {
  console.log("📚 Generating API Documentation");
  console.log("================================");
  console.log(`Source: ${config.srcDir}`);
  console.log(`Output: ${config.outputDir}`);
  console.log("");

  // Ensure output directory
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  // Get all subdirectories (modules)
  const modules = fs
    .readdirSync(config.srcDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const moduleDocs = [];

  for (const moduleName of modules) {
    console.log(`Processing: ${moduleName}`);

    const modulePath = path.join(config.srcDir, moduleName);
    const files = fs.readdirSync(modulePath).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

    const allDocs = [];

    for (const file of files) {
      const filePath = path.join(modulePath, file);
      try {
        const docs = extractJSDoc(filePath);
        allDocs.push(...docs);
      } catch (err) {
        console.warn(`  ⚠️ Error processing ${file}: ${err.message}`);
      }
    }

    if (allDocs.length > 0) {
      // Get description from first doc or use module name
      const description = allDocs[0]?.description?.[0] || `${moduleName} module`;

      const markdown = generateMarkdown(moduleName, allDocs);
      const outputPath = path.join(config.outputDir, `${moduleName}.md`);
      fs.writeFileSync(outputPath, markdown);

      moduleDocs.push({ name: moduleName, description: description.slice(0, 80) + "..." });
      console.log(`  ✅ ${allDocs.length} items documented`);
    }
  }

  // Generate index
  const indexContent = generateIndex(moduleDocs);
  fs.writeFileSync(path.join(config.outputDir, "index.md"), indexContent);

  console.log("");
  console.log(`✅ Generated documentation for ${moduleDocs.length} modules`);
  console.log(`📁 Output: ${config.outputDir}`);
}

main();
