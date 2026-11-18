(() => {
  const script = document.currentScript;
  if (!script || !matchMedia(script.dataset.media).matches) return;

  let theme = document.documentElement.dataset.theme;
  if (theme !== "light" && theme !== "dark") {
    try {
      theme = localStorage.getItem("theme");
    } catch {
      // A blocked preference store falls back to the system theme.
    }
  }
  const isDark =
    theme === "dark" ||
    (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const href = isDark ? script.dataset.dark : script.dataset.light;
  if (!href) return;

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.type = "image/avif";
  link.fetchPriority = "high";
  link.href = href;
  document.head.append(link);
})();
