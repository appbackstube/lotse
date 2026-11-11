(() => {
  let errorCount = 0;
  const report = (message) => {
    if (errorCount++ < 10) parent.postMessage({ type: "task-sandbox-error", message: String(message).slice(0, 2000) }, "*");
  };
  addEventListener("error", (event) => report(event.message || (event.target instanceof Element ? "Could not load " + event.target.tagName + " resource" : "Preview error")), true);
  addEventListener("unhandledrejection", (event) => report(event.reason));

  const openLink = (event) => {
    if (!event.isTrusted || event.defaultPrevented || (event.type === "click" ? event.button !== 0 : event.button !== 1)) return;
    const link = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
    if (!link || link.hasAttribute("download")) return;
    const href = link.getAttribute("href")?.trim();
    if (!href || href.startsWith("#")) return;
    try {
      const url = new URL(href, location.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin === new URL(location.href).origin || url.username || url.password) return;
      event.preventDefault();
      parent.postMessage({ type: "task-sandbox-open-link", url: url.href }, "*");
    } catch { /* Invalid URLs must not be passed to the browser opener. */ }
  };
  addEventListener("click", openLink);
  addEventListener("auxclick", openLink);
  parent.postMessage({ type: "task-sandbox-ready" }, "*");
})();
