# TeX worker

`worker.js` uses JSON Lines on stdin/stdout. By default it imports
`../../tex.gaato.net/dist/math-renderer.js` and resolves `sharp` from the same
submodule's `node_modules` via `createRequire`. Build that submodule first:

```sh
pnpm --dir tex.gaato.net install --frozen-lockfile
pnpm --dir tex.gaato.net build
```

Packaged layouts can override `TEX_RENDERER_MODULE` with the renderer module
path and `TEX_GAATO_PACKAGE` with the corresponding `package.json` path.
