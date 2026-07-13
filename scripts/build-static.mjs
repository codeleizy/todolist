import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await Promise.all(['index.html', 'app.html', 'mvp.html'].map((file) => cp(file, `dist/${file}`)));
await writeFile('dist/config.js', `window.TODO_CONFIG=${JSON.stringify({ supabaseUrl: process.env.SUPABASE_URL || '', supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '' })};`);
