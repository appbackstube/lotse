import configuredRepository from "./repository.js?v=macos-downloads-1";

export function getRepositoryUrl(hostname, pathname, configured = "") {
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.origin === "https://github.com" && /^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password) {
        return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
      }
    } catch { /* An invalid optional override falls back to the GitHub Pages address. */ }
  }
  const owner = hostname.match(/^([\w-]+)\.github\.io$/i)?.[1];
  if (!owner) return null;
  const repository = pathname.split("/").filter(Boolean)[0];
  const name = !repository || repository === "index.html" ? `${owner}.github.io` : repository;
  return /^[\w.-]+$/.test(name) ? `https://github.com/${owner}/${name}` : null;
}

if (typeof document !== "undefined") {
  const tabs = [...document.querySelectorAll("[data-task-view]")];
  const selectTab = (selected) => {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !active;
    }
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (index + 1) % tabs.length;
      if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectTab(tabs[next]);
      tabs[next].focus();
    });
  });
  const mobileLayout = matchMedia("(max-width: 760px)");
  const setOrientation = () => document.querySelector("[role=tablist]").setAttribute("aria-orientation", mobileLayout.matches ? "horizontal" : "vertical");
  setOrientation();
  mobileLayout.addEventListener("change", setOrientation);

  const dialog = document.querySelector(".image-dialog");
  const dialogImage = dialog.querySelector("img");
  document.querySelectorAll("[data-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      const image = button.querySelector("img");
      dialogImage.src = image.src;
      dialogImage.alt = image.alt;
      dialog.showModal();
    });
  });
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  document.querySelectorAll('a[href="#setup"]').forEach((link) => {
    link.addEventListener("click", () => { document.getElementById("setup").open = true; });
  });
  const repository = getRepositoryUrl(location.hostname, location.pathname, configuredRepository);
  if (repository) {
    document.querySelectorAll("[data-repository]").forEach((link) => {
      link.href = repository;
      link.hidden = false;
    });
    document.querySelectorAll("[data-release-asset]").forEach((link) => {
      link.href = `${repository}/releases/latest/download/${encodeURIComponent(link.dataset.releaseAsset)}`;
    });
    document.querySelector("[data-downloads]").hidden = false;
    document.querySelector("[data-local-start]").hidden = true;
  }
}
