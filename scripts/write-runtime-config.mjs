import { writeFile } from 'node:fs/promises';

// These are public client credentials. Vercel environment variables take precedence;
// the fallback keeps locally-built Android packages connected to the same MVP project.
const config = {
  supabaseUrl: process.env.SUPABASE_URL || 'https://woudvgqablgbdssjacsy.supabase.co',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || 'sb_publishable_xo7pyQAYymE1lkX5Hq_8cw_gm1Y01M7'
};

await writeFile('dist/config.js', `window.TODO_CONFIG=${JSON.stringify(config)};\n`);
