// Portable PM2 ecosystem config — no Windows-specific cmd/pnpm shims,
// no .vbs wrappers, works identically on Linux/mac/Windows.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');

// Direct entry points avoid the pnpm .cmd shim chain that allocates a
// visible console on Windows. The dev commands below are the same ones
// defined in package.json scripts; no rebuild artifacts needed for dev.

module.exports = {
  apps: [
    {
      name: 'noname-server',
      script: 'node',
      args: path.join('packages', 'server', 'node_modules', 'tsx', 'dist', 'cli.mjs') + ' watch src/index.ts',
      cwd: __dirname,
      env: {
        DSH_PERMISSION_MODE: 'danger-full-access',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        REQUIRE_EDGE_HMAC: 'false',
        WORKER_SERVER_SECRET: 'MpafgdbDKihG1zkRl7onvjBFcPyJLtmH',
        ZITADEL_ISSUER: 'http://localhost:8080',
        DATABASE_URL: 'postgres://noname:noname_dev@localhost:5432/app',
        REDIS_URL: 'redis://localhost:6379',
        CLICKHOUSE_URL: 'http://localhost:8123',
        KETO_GRPC_INSECURE: 'true',
        NPM_CONFIG_CACHE: path.join(__dirname, '.tools', 'npm-cache'),
        NPM_CONFIG_PREFIX: path.join(__dirname, '.tools', 'npm-global'),
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      log_file: path.join(__dirname, '.tools', 'pm2', 'noname-server.log'),
      out_file: path.join(__dirname, '.tools', 'pm2', 'noname-server.out'),
      error_file: path.join(__dirname, '.tools', 'pm2', 'noname-server.err'),
    },
    {
      name: 'noname-edge',
      script: 'node',
      args: path.join('node_modules', 'wrangler', 'bin', 'wrangler.js') + ' dev src/index.ts',
      cwd: path.join(__dirname, 'packages', 'workers'),
      env: {
        DSH_PERMISSION_MODE: 'danger-full-access',
        WORKER_SERVER_SECRET: 'MpafgdbDKihG1zkRl7onvjBFcPyJLtmH',
        ZITADEL_ISSUER: 'http://localhost:8080',
        ZITADEL_CLIENT_ID: '387316757292908554',
        ZITADEL_PROJECT_ID: '387316756252721162',
        NPM_CONFIG_CACHE: path.join(__dirname, '.tools', 'npm-cache'),
        NPM_CONFIG_PREFIX: path.join(__dirname, '.tools', 'npm-global'),
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 15000,
      log_file: path.join(__dirname, '.tools', 'pm2', 'noname-edge.log'),
      out_file: path.join(__dirname, '.tools', 'pm2', 'noname-edge.out'),
      error_file: path.join(__dirname, '.tools', 'pm2', 'noname-edge.err'),
    },
    {
      name: 'noname-client',
      script: 'node',
      args: path.join('node_modules', '@rspack', 'cli', 'bin', 'rspack.js') + ' serve',
      cwd: path.join(__dirname, 'packages', 'client'),
      env: {
        DSH_PERMISSION_MODE: 'danger-full-access',
        NPM_CONFIG_CACHE: path.join(__dirname, '.tools', 'npm-cache'),
        NPM_CONFIG_PREFIX: path.join(__dirname, '.tools', 'npm-global'),
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      log_file: path.join(__dirname, '.tools', 'pm2', 'noname-client.log'),
      out_file: path.join(__dirname, '.tools', 'pm2', 'noname-client.out'),
      error_file: path.join(__dirname, '.tools', 'pm2', 'noname-client.err'),
    },
  ],
};
