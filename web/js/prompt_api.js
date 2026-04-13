/**
 * Prompt Studio — REST API client.
 */

const BASE = "/arbo-tools";

export async function fetchJSON(url, options = {}) {
  const resp = await fetch(url, options);
  return resp.json();
}

export async function listCategories() {
  return fetchJSON(`${BASE}/prompts/categories`);
}

export async function addCategory(path) {
  return fetchJSON(`${BASE}/prompts/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export async function listPrompts(category = "") {
  return fetchJSON(`${BASE}/prompts/filter?category=${encodeURIComponent(category)}`);
}

export async function loadPrompt(path) {
  return fetchJSON(`${BASE}/prompts/load?path=${encodeURIComponent(path)}`);
}

export async function savePrompt(name, category, positive, negative) {
  return fetchJSON(`${BASE}/prompts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category, positive, negative }),
  });
}

export async function deletePrompt(path) {
  return fetchJSON(`${BASE}/prompts/${encodeURIComponent(path)}`, { method: "DELETE" });
}

export async function renamePrompt(oldPath, newName) {
  return fetchJSON(`${BASE}/prompts/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_path: oldPath, new_name: newName }),
  });
}

export async function movePrompt(srcPath, destCategory) {
  return fetchJSON(`${BASE}/prompts/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ src_path: srcPath, dest_category: destCategory }),
  });
}

export async function renameCategory(oldPath, newName) {
  return fetchJSON(`${BASE}/prompts/categories/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_path: oldPath, new_name: newName }),
  });
}

export async function deleteCategory(path) {
  return fetchJSON(`${BASE}/prompts/categories/${encodeURIComponent(path)}`, { method: "DELETE" });
}

export async function moveCategory(srcPath, destPath) {
  return fetchJSON(`${BASE}/prompts/categories/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ src_path: srcPath, dest_path: destPath }),
  });
}

export async function getTreeData() {
  return fetchJSON(`${BASE}/prompts/tree`);
}
