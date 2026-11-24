import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';

test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

async function restoreTeacher(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('muawin_storage_version', 'real-backend-v4');
    localStorage.setItem('muawin_auth_token', 'mock-teacher-session');
    localStorage.setItem('muawin_user', JSON.stringify({
      id: 'teacher', name: 'Teacher', username: 'teacher', moellimConnected: true,
    }));
    localStorage.setItem('muawin_courses', JSON.stringify([
      { id: 'moellim-42', code: 'Test Course', title: 'Test Course', section: '' },
    ]));
  });
}

test('reviews a class transcript and sends a selected lecture to shared approvals', async ({ page }) => {
  const session = {
    id: 'class-test', course_id: 'moellim-42', course: 'Test Course', timezone: 'Asia/Karachi',
    started_at: '2026-11-24T10:00:00+05:00', ended_at: '2026-11-24T11:00:00+05:00',
  };
  let prepared = false;
  await restoreTeacher(page);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/class-mode/status')) {
      return route.fulfill({ json: { session, active: null, upcoming: null, history: [session] } });
    }
    if (path.endsWith('/suggestions/slides/prepare')) {
      expect(route.request().postDataJSON()).toMatchObject({
        title: 'Lecture slides', week: 2, material: 'Lecture 2.pdf', confirm: true,
      });
      prepared = true;
      return route.fulfill({ json: { id: 'wf-test', status: 'waiting_approval' } });
    }
    if (path.endsWith('/class-mode/sessions/class-test')) {
      const after = new URL(route.request().url()).searchParams.get('after');
      return route.fulfill({ json: {
        session,
        segments: after === '0' ? [{ sequence: 1, text: 'لیکچر کی سلائیڈز', timestamp: session.started_at }] : [],
        chunks: [{ id: 'chunk-1', status: 'completed', result: {
          topics: ['Lecture slides'], key_points: [], important_concepts: [],
        } }],
        suggestions: [{
          id: 'slides', decision: prepared ? 'prepared' : 'proposed', review: null,
          payload: { operation: 'upload_lecture', type: 'resource_upload', intent: 'lms_instruction', name: 'Lecture slides' },
          workflows: prepared ? [{ id: 'wf-test', status: 'waiting_approval', result: null, error: null }] : [],
        }],
      } });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto('/lecture');
  await expect(page.getByRole('heading', { name: 'Class Mode', exact: true })).toBeVisible();
  await expect(page.getByText('لیکچر کی سلائیڈز')).toBeVisible();
  await page.getByLabel('Course week').fill('2');
  await page.getByLabel('Lecture file name in your course folder').fill('Lecture 2.pdf');
  await page.getByLabel('I confirm this Moellim instruction').check();
  await page.getByRole('button', { name: 'Prepare for approval' }).click();
  await expect(page.getByRole('link', { name: 'Review approval' })).toHaveAttribute('href', '/approvals/wf-test');
});

test.describe('Class microphone', () => {
  test('shows listening after connection and renders finalized speech immediately', async ({ page }) => {
    await restoreTeacher(page);
    const session = {
      id: 'class-live', course_id: 'moellim-42', course: 'Test Course', timezone: 'Asia/Karachi',
      started_at: '2026-11-24T10:00:00+05:00', ended_at: null,
    };
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/class-mode/status')) {
        return route.fulfill({ json: { session, active: session, upcoming: null, history: [session] } });
      }
      if (path.endsWith('/class-mode/sessions/class-live')) {
        return route.fulfill({ json: { session, segments: [], chunks: [], suggestions: [] } });
      }
      return route.fulfill({ json: [] });
    });
    let stream: WebSocketRoute | undefined;
    let occupied = false;
    let conflicts = 0;
    let audioFrames = 0;
    await page.routeWebSocket('**/class-mode/sessions/class-live/audio', socket => {
      socket.onMessage(message => {
        const event = JSON.parse(message.toString());
        if (event.token) {
          if (occupied) {
            conflicts += 1;
            socket.close({ code: 4409 });
            return;
          }
          socket.send(JSON.stringify({ type: 'authorized' }));
          stream = socket;
        } else if (event.type === 'audio') {
          audioFrames += 1;
          socket.send(JSON.stringify({ type: 'audio_ack', sequence: event.sequence }));
        } else if (event.type === 'finish') {
          socket.close({ code: 1000 });
        }
      });
    });
    await page.goto('/lecture');
    await page.getByRole('button', { name: 'Start live transcription' }).click();
    await expect(page.getByText('Connecting to live transcription…')).toBeVisible();
    await expect.poll(() => Boolean(stream)).toBe(true);
    stream!.send(JSON.stringify({ type: 'status', status: 'connected' }));
    await expect(page.getByText('Listening… Speak to see the transcript appear here.')).toBeVisible();
    await expect(page.getByText('Microphone level')).toBeVisible();
    await expect.poll(() => audioFrames).toBeGreaterThan(0);
    stream!.send(JSON.stringify({ type: 'transcript', final: true, text: 'Recorded immediately.',
      sequence: 1, timestamp: session.started_at }));
    await expect(page.getByText('Recorded immediately.')).toBeVisible();
    await page.getByRole('button', { name: 'Stop transcription' }).click();
    await expect(page.getByRole('button', { name: 'Start live transcription' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End class' })).toBeVisible();

    occupied = true;
    await page.getByRole('button', { name: 'Start live transcription' }).click();
    await expect(page.getByRole('alert')).toContainText('Transcription is already open for this class.');
    await expect(page.getByRole('button', { name: 'Retry live transcription' })).toBeVisible();
    expect(conflicts).toBe(2);
  });
});
