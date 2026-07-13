import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await Promise.all([
  cp('mvp.html', 'dist/index.html'),
  cp('mvp.html', 'dist/mvp.html'),
  cp('app.html', 'dist/app.html')
]);
await writeFile('dist/config.js', `window.TODO_CONFIG=${JSON.stringify({ supabaseUrl: process.env.SUPABASE_URL || '', supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '' })};`);
