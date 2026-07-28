export function todayIso() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function monthStartIso(dateIso = todayIso()) {
  return `${dateIso.slice(0, 7)}-01`;
}
