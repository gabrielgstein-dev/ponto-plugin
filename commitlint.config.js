module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'ui',
        'perf',
        'a11y',
        'revert',
        'security',
        'refactor',
        'docs',
        'test',
        'build',
        'ci',
        'chore',
        'deps',
      ],
    ],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
