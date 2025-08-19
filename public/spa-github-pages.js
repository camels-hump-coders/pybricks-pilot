// GitHub Pages SPA routing hack
// This script handles redirects from 404.html for client-side routing
((l) => {
  if (l.search[1] === "/") {
    var decoded = l.search
      .slice(1)
      .split("&")
      .map((s) => s.replace(/~and~/g, "&"))
      .join("?");
    window.history.replaceState(
      null,
      null,
      l.pathname.slice(0, -1) + decoded + l.hash,
    );
  }
})(window.location);
