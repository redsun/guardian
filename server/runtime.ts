export function runtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const value = env.PORT ?? '5173';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw Error('PORT must be an integer between 1 and 65535.');
  return {
    port: Number(value),
    host: env.HOST || (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
    production: env.NODE_ENV === 'production',
  };
}
