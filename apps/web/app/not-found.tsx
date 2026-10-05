export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold">Page not found</h1>
        <a href="/" className="mt-4 inline-block text-tide underline-offset-4 hover:underline">
          Go to Wave
        </a>
      </div>
    </main>
  );
}
