module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-case': [2, 'always', ['lower-case', 'pascal-case', 'start-case']],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
