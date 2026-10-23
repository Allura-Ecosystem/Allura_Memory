
// https://github.com/francoismassart/eslint-plugin-tailwindcss/pull/381
// import eslintPluginTailwindcss from "eslint-plugin-tailwindcss"
import eslintPluginNext from "@next/eslint-plugin-next"
import eslintPluginImport from "eslint-plugin-import"
import eslintPluginReactHooks from "eslint-plugin-react-hooks"
import eslintPluginStorybook from "eslint-plugin-storybook"
import typescriptEslint from "typescript-eslint"
import * as fs from "fs"

const eslintIgnore = [
  // Immutable historical exports: every lint entrypoint first validates their inventory.
  "docs/design/command-center/project/support.js",
  "docs/design/command-center/project/_ds/allura-design-system-d83f547a-10de-4c68-9b53-504f3a74662a/_ds_bundle.js",
  ".git/",
  ".next/",
  ".worktrees/",
  ".agents/",
  ".claude/",
  ".opencode/",
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  "archive/",
  "benchmark/",
  "docker/",
  "k6/",
  "packages/",
  "ralph/",
  "scripts/",
  "supabase/",
  "templates/",
  "skills/",
  "public/",
  "tests/load/",
  "docs/branding/",
  "report-bundle-size.js",
  "*.min.js",
  "*.config.js",
  "*.d.ts",
]

const config = typescriptEslint.config(
  {
    ignores: eslintIgnore,
  },
  ...eslintPluginStorybook.configs["flat/recommended"],
  //  https://github.com/francoismassart/eslint-plugin-tailwindcss/pull/381
  // ...eslintPluginTailwindcss.configs["flat/recommended"],
  typescriptEslint.configs.recommended,
  eslintPluginImport.flatConfigs.recommended,
  {
    plugins: {
      "@next/next": eslintPluginNext,
    },
    rules: {
      ...eslintPluginNext.configs.recommended.rules,
      ...eslintPluginNext.configs["core-web-vitals"].rules,
    },
  },
  {
    plugins: {
      "react-hooks": eslintPluginReactHooks,
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
    },
  },
  // Relax rules for test files
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    settings: {
      tailwindcss: {
        callees: ["classnames", "clsx", "ctl", "cn", "cva"],
      },

      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "sort-imports": [
        "error",
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
        },
      ],
      "import/order": [
        "warn",
        {
          groups: ["external", "builtin", "internal", "sibling", "parent", "index"],
          pathGroups: [
            ...getDirectoriesToSort().map((singleDir) => ({
              pattern: `${singleDir}/**`,
              group: "internal",
            })),
            {
              pattern: "env",
              group: "internal",
            },
            {
              pattern: "theme",
              group: "internal",
            },
            {
              pattern: "public/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["internal"],
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
    },
  }
)

function getDirectoriesToSort() {
  const ignoredSortingDirectories = [".git", ".next", ".vscode", "node_modules"]
  return fs
    .readdirSync(process.cwd())
    .filter((file) => fs.statSync(process.cwd() + "/" + file).isDirectory())
    .filter((f) => !ignoredSortingDirectories.includes(f))
}

export default config
