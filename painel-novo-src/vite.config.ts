// Painel novo (React). Fonte aqui; o build vai pra ../painel-novo, servido pelo Hosting em /painel-novo/.
// Um JS só, sem pedaço carregado depois: o painel fica aberto a noite toda e, depois de um deploy, um pedaço
// com hash antigo daria 404 no meio do serviço.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/painel-novo/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, fs: { allow: ['..'] } }, // a regra pura (pedido.js, estoque.js...) fica na raiz do site
  build: {
    outDir: '../painel-novo', emptyOutDir: true,
    chunkSizeWarningLimit: 1500, // quase tudo é o SDK do Firebase (o painel antigo já baixava o mesmo)
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
