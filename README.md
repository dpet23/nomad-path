# leaflet-map

Simple library for creating a Leaflet map.


## Development

### Prerequisites

* [Git](https://git-scm.com/)
* [Node.js 18](https://nodejs.org/en/download/releases/) with [npm](https://www.npmjs.com/)

### Structure

The main config files are:

| File | Summary |
| ---- | ------- |
| `package.json` | Main config and list of dependencies |
| `tsconfig.json` | TypeScript configuration |
| `.editorconfig`, `.eslint.json`, `.prettierrc` | Code style settings |

### Common commands

Use the Node Package Manager (`npm`) to manage the dependencies and run commands.

| Command | Description |
| ------- | ----------- |
| `npm install` | Install all dependencies from `package.json` to the local `node_modules` folder |
| `npm install <package> [--save-dev]` | Install a package & add it to the runtime or development dependencies |
| `npm uninstall <package>` | Uninstall a package & remove it from the dependencies list |
| `npm ci` | Install all dependencies from `package-lock.json` (for automated environments) |
| `npm run lint` | Run [ESLint](https://www.npmjs.com/package/eslint) over the `src` files (includes [Prettier](https://www.npmjs.com/package/eslint-plugin-prettier) and [SonarJS](https://www.npmjs.com/package/eslint-plugin-sonarjs)) |
| `npm version [major\|minor\|patch]` | Version bump _(in `package.json`)_ |
| `npm run build` | Build the library for production to the `dist` folder |

`npx` is used to execute npm packages that haven't been installed globally.
`nvm` can be used to manage the current version of Node.
