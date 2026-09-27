import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from './LoginScreen';

afterEach(() => vi.unstubAllGlobals());

describe('login screen', () => {
  it('wakes the server on open, says it is waking while it retries, and logs in when it answers', async () => {
    let loginCalls = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/health') return Promise.reject(new TypeError('Failed to fetch'));
      loginCalls++;
      if (loginCalls === 1) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(new Response(JSON.stringify({ token: 't', station: 'עמדה 1' }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const onLogin = vi.fn();
    render(<LoginScreen onLogin={onLogin} />);
    expect(fetchMock).toHaveBeenCalledWith('/api/health', { cache: 'no-store' });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('שם עמדה'), 'עמדה 1');
    await user.type(screen.getByLabelText('קוד גישה'), '1948');
    await user.click(screen.getByRole('button', { name: /כניסה/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('השרת מתעורר');
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith({ token: 't', station: 'עמדה 1', display: false }), { timeout: 3000 });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
