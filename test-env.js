import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Текущая директория:', process.cwd());
console.log('Файл .env предполагается рядом с package.json:', path.resolve('.env'));

const maskUrl = (url) => {
  if (!url) return 'undefined';
  try {
    const u = new URL(url);
    const user = u.username ? (u.username.length > 2 ? u.username.slice(0, 2) + '***' : '***') : '';
    const host = u.hostname;
    const db = u.pathname?.slice(1) || '';
    return `${u.protocol}//${user}:${'***'}@${host}/${db}`;
  } catch {
    return (url ?? '').slice(0, 20) + '...';
  }
};

console.log('\nПеременные окружения:');
console.log('DATABASE_URL:', maskUrl(process.env.DATABASE_URL));
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
