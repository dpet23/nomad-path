/** @type {import('prettier').Config} */
export default {
    printWidth: 120,
    tabWidth: 4,
    singleQuote: true,
    quoteProps: 'as-needed',
    arrowParens: 'avoid',
    overrides: [
        {
            files: ['*.md', '*.json', '*.jsonc', '*.yml', '*.yaml'],
            options: { tabWidth: 2 },
        },
    ],
};
