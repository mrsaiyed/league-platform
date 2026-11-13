// Next.js calls register() once when the server starts, before it serves anyone.
// The app starts here (startup.ts): settings checked, and in staging and production
// the database login role checked (T-30, T-60). A problem stops the server.
// `next build` calls it too, and is not a server: nothing starts then.
export async function register(): Promise<void> {
  const { isBuildPhase } = await import('./server/config.ts');
  if (isBuildPhase()) return;
  const { webPorts } = await import('./server/container.ts');
  try {
    await webPorts();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'The web app cannot start.');
    process.exit(1);
  }
}
