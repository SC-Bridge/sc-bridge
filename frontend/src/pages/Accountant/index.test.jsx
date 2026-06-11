import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AccountantSettings from './index';

// Helper that sets up a mocked fetch returning the preferences shape.
function mockPreferences(prefs) {
  global.fetch = vi.fn(async (url, init) => {
    if (typeof url === 'string' && url.includes('/api/settings/preferences')) {
      if (!init || init.method === 'GET' || init.method === undefined) {
        return new Response(JSON.stringify(prefs), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (init.method === 'PUT') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
  });
}

beforeEach(() => {
  // default — empty preferences
  mockPreferences({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/accountant/settings']}>
      <AccountantSettings />
    </MemoryRouter>,
  );
}

describe('AccountantSettings — render', () => {
  it('shows a loading skeleton while preferences fetch is pending', async () => {
    let resolveFetch;
    global.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve(
              new Response(JSON.stringify({}), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }),
            );
        }),
    );
    renderPage();
    expect(screen.getByTestId('accountant-settings-loading')).toBeInTheDocument();
    resolveFetch();
    await waitFor(() =>
      expect(
        screen.queryByTestId('accountant-settings-loading'),
      ).not.toBeInTheDocument(),
    );
  });

  it("defaults to 'easy' when no accountantTier is persisted", async () => {
    mockPreferences({});
    renderPage();
    const easyRadio = await screen.findByRole('radio', { name: /easy/i });
    expect(easyRadio).toBeChecked();
  });

  it('hydrates the selected tier from the server', async () => {
    mockPreferences({ accountantTier: 'advanced' });
    renderPage();
    const advancedRadio = await screen.findByRole('radio', { name: /advanced/i });
    expect(advancedRadio).toBeChecked();
  });

  describe('modules panel', () => {
    it('on easy tier, only Core Financials is marked available', async () => {
      mockPreferences({ accountantTier: 'easy' });
      renderPage();
      await screen.findByRole('radio', { name: /easy/i });
      expect(screen.getByTestId('module-core-financials-available')).toBeInTheDocument();
      expect(screen.getByTestId('module-finance-locked')).toBeInTheDocument();
      expect(screen.getByTestId('module-reports-locked')).toBeInTheDocument();
      expect(screen.getByTestId('module-orders-locked')).toBeInTheDocument();
    });

    it('on advanced tier, Core Financials + Orders available', async () => {
      mockPreferences({ accountantTier: 'advanced' });
      renderPage();
      await screen.findByRole('radio', { name: /advanced/i });
      expect(screen.getByTestId('module-core-financials-available')).toBeInTheDocument();
      expect(screen.getByTestId('module-orders-available')).toBeInTheDocument();
      expect(screen.getByTestId('module-finance-locked')).toBeInTheDocument();
      expect(screen.getByTestId('module-reports-locked')).toBeInTheDocument();
    });

    it('on industrial tier, all four modules available', async () => {
      mockPreferences({ accountantTier: 'industrial' });
      renderPage();
      await screen.findByRole('radio', { name: /industrial/i });
      expect(screen.getByTestId('module-core-financials-available')).toBeInTheDocument();
      expect(screen.getByTestId('module-finance-available')).toBeInTheDocument();
      expect(screen.getByTestId('module-reports-available')).toBeInTheDocument();
      expect(screen.getByTestId('module-orders-available')).toBeInTheDocument();
    });
  });
});

describe('AccountantSettings — notifications', () => {
  it('saves the verification threshold (min 10) via preferences', async () => {
    mockPreferences({ accountantTier: 'easy', accountantVerifyThreshold: '10' });
    renderPage();

    const input = await screen.findByLabelText(/verification threshold/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('min', '10');

    await userEvent.clear(input);
    await userEvent.type(input, '25');
    await userEvent.tab(); // blur triggers save

    await waitFor(() => {
      const putCall = global.fetch.mock.calls.find(
        ([u, init]) =>
          typeof u === 'string' &&
          u.includes('/api/settings/preferences') &&
          init?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(putCall[1].body)).toMatchObject({ accountantVerifyThreshold: '25' });
    });
  });
});

describe('AccountantSettings — interaction', () => {
  it('selecting industrial fires PUT with accountantTier=industrial', async () => {
    const fetchSpy = vi.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/api/settings/preferences')) {
        if (!init || init.method === undefined || init.method === 'GET') {
          return new Response(JSON.stringify({}), { status: 200 });
        }
        if (init.method === 'PUT') {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
      }
      throw new Error(`Unexpected fetch: ${init?.method} ${url}`);
    });
    global.fetch = fetchSpy;

    renderPage();
    const industrialRadio = await screen.findByRole('radio', { name: /industrial/i });
    await userEvent.click(industrialRadio);

    await waitFor(() => {
      const putCall = fetchSpy.mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall[1].body);
      expect(body).toEqual({ accountantTier: 'industrial' });
    });
  });

  it('reverts the selection when PUT fails and shows an error', async () => {
    let putCount = 0;
    global.fetch = vi.fn(async (url, init) => {
      if (typeof url === 'string' && url.includes('/api/settings/preferences')) {
        if (!init || init.method === undefined || init.method === 'GET') {
          return new Response(JSON.stringify({ accountantTier: 'easy' }), { status: 200 });
        }
        if (init.method === 'PUT') {
          putCount += 1;
          return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
        }
      }
      throw new Error(`Unexpected fetch: ${init?.method} ${url}`);
    });

    renderPage();
    const advancedRadio = await screen.findByRole('radio', { name: /advanced/i });
    await userEvent.click(advancedRadio);

    await waitFor(() => expect(putCount).toBe(1));

    // Selection reverts to 'easy'
    const easyRadio = await screen.findByRole('radio', { name: /easy/i });
    expect(easyRadio).toBeChecked();
    expect(advancedRadio).not.toBeChecked();

    // Error visible
    expect(await screen.findByTestId('accountant-settings-error')).toBeInTheDocument();
  });
});
