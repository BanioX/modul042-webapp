const { Pool, types } = require('pg');

// DATE-Spalten als 'YYYY-MM-DD' liefern statt als JS-Date (sonst Zeitzonen-Verschiebung)
types.setTypeParser(1082, (value) => value);

function createPool() {
  return new Pool({
    host: process.env.DB_HOST || 'db',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'webapp_db',
    user: process.env.DB_USER || 'webapp_user',
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000,
    max: 15,
  });
}

module.exports = { createPool };
