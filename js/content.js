async function load(file) {
  const res = await fetch(file);
  return res.ok ? res.json() : {};
}

function fill(data) {
  document.querySelectorAll('[data-key]').forEach(el => {
    const val = data[el.dataset.key];
    if (val != null) el.textContent = val;
  });
}

(async () => {
  const page = document.body.dataset.page;
  const data = await load(`content/${page}.json`);
  fill(data);

  if (page === 'about' || page === 'research') {
    const pubs = await load('content/publications.json');
    fill(pubs);
  }
})();
