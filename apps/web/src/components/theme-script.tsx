/**
 * Applies the stored/system theme before first paint.
 *
 * Runs synchronously in <head> because doing it in an effect produces a
 * white flash on every load for dark-mode users. `suppressHydrationWarning`
 * on <html> covers the class this adds.
 */
export function ThemeScript() {
  const script = `
(function(){try{
  var stored = localStorage.getItem('evrute-theme');
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = stored ? stored === 'dark' : prefersDark;
  document.documentElement.classList.toggle('dark', dark);
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
