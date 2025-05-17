// Global test setup
import { beforeAll, afterAll } from 'vitest';
import { getSharedMock, cleanupSharedMock } from './utils/persistent-mock.js';

beforeAll(async () => {
  console.error('[TEST SETUP] Creating shared mock for all tests...');
  await getSharedMock();
});

afterAll(async () => {
  console.error('[TEST SETUP] Cleaning up shared mock...');
  await cleanupSharedMock();
});