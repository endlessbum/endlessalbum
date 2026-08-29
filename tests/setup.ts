process.env.NODE_ENV = process.env.NODE_ENV || 'test';

if (process.env.DATABASE_URL) {
  delete process.env.DATABASE_URL;
}

if (!(globalThis as any).window) {
  (globalThis as any).window = { location: { protocol: 'http:', host: 'localhost:5000', port: '5000' } } as any;
}
