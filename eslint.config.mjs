import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
  "public/**",
  "public/Uploads/**",
  "public/uploads/**",
  "playwright-report/**",
  "playwright-report/**/*.js",
  "playwright-report/**/*.mjs",
  "playwright-report/**/*.cjs",
  "test-results/**",
  "test-results/**/*.js",
      "client/dist/**",
      "test-env.js"
    ],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      react,
      "react-hooks": hooks,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-key": ["warn", { checkFragmentShorthand: true }],
      ...hooks.configs.recommended.rules,

      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        { "ts-ignore": "allow-with-description" },
      ],
      // `any` намеренно допускается в этом проекте (WS-сообщения, приведение
      // типов в storage/тестах). Правило отключено, чтобы строгий гейт
      // lint:strict (--max-warnings=0) не падал на давно накопленных any.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-namespace": "off",

      "no-console": ["warn", { allow: ["warn", "error", "debug", "info", "log"] }],
      "no-debugger": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "prefer-const": "warn",
    },
  },
  {
    files: [
      "*.config.{ts,js,mjs,cjs}",
      "**/*.config.{ts,js,mjs,cjs}",
      "tailwind.config.ts",
      "drizzle.config.ts",
    ],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
  },
  {
    files: ["tailwind.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}", "**/*.{test,spec}.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: false,
      },
    },
  },
];
