// Loads all JSON content listed in data/index.json. Pure: the caller injects readJson(path),
// which is fetch() in the browser and fs in Node tests / the balance bot.

export async function loadContent(readJson) {
  const index = await readJson('index.json');
  const propsFile = await readJson(index.props);
  const props = new Map(propsFile.props.map((p) => [p.id, p]));
  const maps = new Map();
  for (const file of index.maps) {
    const m = await readJson(file);
    maps.set(m.id, m);
  }
  return { index, props, maps };
}

export function browserReadJson(base = 'data/') {
  return async (path) => {
    const res = await fetch(base + path);
    if (!res.ok) throw new Error(`Failed to load ${base + path}: ${res.status}`);
    return res.json();
  };
}
