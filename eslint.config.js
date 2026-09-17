// #53: a linter, and only the half of one that finds BUGS.
//
// The ticket asked for lint and the honest objection to it was recorded: ~10k lines with no config
// means either a permissive setup that catches nothing or hundreds of findings on day one, and
// neither is worth a build step. But that objection is about STYLE. This repo already has a style,
// written down in CLAUDE.md and visible in every file, and it is not something a tool should be
// arguing with.
//
// So the rule list below is the subset that has no opinion about how code looks: a name that is not
// defined, a key written twice, a branch that cannot be reached, a `const` assigned to. Every one of
// them is a thing that is simply wrong, and every one of them is a thing that has shipped in a
// browser game before. Nothing here fires on a formatting choice, so nothing here will ever need a
// disable comment to say "I meant that".
export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['dist/**', 'node_modules/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // the browser surface this game actually touches, listed rather than pulled from a package:
        // a globals dependency for one short list is a dependency for one short list
        window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly',
        localStorage: 'readonly', performance: 'readonly', console: 'readonly', fetch: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        Image: 'readonly', Audio: 'readonly', AudioContext: 'readonly', webkitAudioContext: 'readonly',
        MessageChannel: 'readonly', MutationObserver: 'readonly', ResizeObserver: 'readonly',
        URL: 'readonly', Blob: 'readonly', FileReader: 'readonly', TextDecoder: 'readonly',
        caches: 'readonly', self: 'readonly', Request: 'readonly', Response: 'readonly',
        PointerEvent: 'readonly', KeyboardEvent: 'readonly', Event: 'readonly', CustomEvent: 'readonly',
        getComputedStyle: 'readonly', matchMedia: 'readonly', screen: 'readonly', visualViewport: 'readonly',
        // node, for the tools
        process: 'readonly', Buffer: 'readonly', __dirname: 'readonly', globalThis: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-const-assign': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-sparse-arrays': 'error',
      'no-obj-calls': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
];
