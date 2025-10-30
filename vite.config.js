import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import { nodePolyfills } from 'vite-plugin-node-polyfills'; // 1. 플러그인을 import

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // nodePolyfills(), // 2. 플러그인을 여기에 추가합니다.
  ],
  // 3. 'resolve.alias' 관련 설정은 모두 제거합니다.
});