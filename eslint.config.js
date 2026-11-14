import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const layer = (names, why) => ({
  group: names.flatMap((n) => [`**/${n}`, `**/${n}/**`]),
  message: why,
})

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.superpowers', 'docs'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Движок — чистая логика: без React, без браузера, без часов и случайности.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: ['react', 'react-dom'],
        patterns: [layer(['platform', 'app', 'ui'], 'Движок не зависит от platform, app и ui.')],
      }],
      'no-restricted-globals': ['error', 'document', 'window', 'localStorage', 'navigator', 'crypto'],
      'no-restricted-properties': ['error',
        { object: 'Date', property: 'now', message: 'Время приходит в движок параметром.' },
        { object: 'Math', property: 'random', message: 'Случайность приходит в движок параметром.' }],
      'no-restricted-syntax': ['error',
        { selector: "NewExpression[callee.name='Date']", message: 'Время приходит в движок параметром.' }],
    },
  },
  {
    // platform подключается только в app.
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [layer(['platform'], 'ui берёт всё через app, не через platform.')],
      }],
    },
  },
)
