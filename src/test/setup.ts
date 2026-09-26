import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // Server tests run in the plain Node environment, which has no localStorage
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
