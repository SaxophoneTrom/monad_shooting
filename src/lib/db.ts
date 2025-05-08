import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // 環境変数からURLを取得
});

export default pool;