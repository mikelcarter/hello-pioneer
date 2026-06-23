import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_ANON_KEY ?? '';

if (!url || !key) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_ANON_KEY is not set — build will produce a non-functional page.');
}

mkdirSync('public', { recursive: true });

const html = readFileSync('src/index.html', 'utf8')
  .replace('%%SUPABASE_URL%%', url)
  .replace('%%SUPABASE_ANON_KEY%%', key);

writeFileSync('public/index.html', html);
console.log('Build complete → public/index.html');
