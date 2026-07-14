import { writeFile } from 'node:fs/promises';

const config = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
};

await writeFile('dist/config.js', `window.TODO_CONFIG=${JSON.stringify(config)};\n`);
