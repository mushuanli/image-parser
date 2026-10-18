import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';
import {resolve} from 'node:path';

export default defineConfig({
    build: {lib: {entry: {index: resolve(__dirname, 'src/index.ts'), ui: resolve(__dirname, 'src/ui.ts'), vfs: resolve(__dirname, 'src/vfs.ts')},
        formats: ['es', 'cjs'], fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`},
        sourcemap: true, cssCodeSplit: false, rollupOptions: {external: ['scanic', '@itookit/vfs-core'],
            output: {assetFileNames: asset => asset.name?.endsWith('.css') ? 'style.css' : '[name][extname]'}}},
    plugins: [dts({entryRoot: 'src', outDir: 'dist'})],
});
