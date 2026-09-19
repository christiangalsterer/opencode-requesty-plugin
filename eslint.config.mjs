import love from 'eslint-config-love'
import importPlugin from 'eslint-plugin-import'
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  love,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    name: 'base',
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    }
  },
  {
    plugins: {
      import: importPlugin,
      'simple-import-sort': simpleImportSortPlugin,
      tseslint
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/init-declarations': 'off',
      complexity: 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'eslint-comments/require-description': 'off',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error'
    }
  },

  {
    ignores: ['dist/**/*.*', '**/*.js', '**/*.mjs']
  },
  {
    name: 'src',
    files: ['src/**/*.ts'],
    ignores: ['test/**/*.ts']
  },
  {
    name: 'test',
    files: ['test/**/*.ts'],
    rules: {
      // you should turn the original rule off *only* for test files
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'eslint-comments/require-description': 'off'
    }
  }
)
