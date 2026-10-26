(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NotamSatelliteLabelLayout = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const overlaps = (a, b, gap = 0) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
  function create() {
    const history = new Map();
    let serial = 0;
    let initialized = false;
    return {
      reset() { history.clear(); initialized = false; },
      activeIds() { return [...history].filter(([, x]) => x.opacity > 0).map(([id]) => id); },
      layout(candidates, { width, height, limit, forceAll = false, now = 0 }) {
        const present = new Set(candidates.map(x => x.id));
        // Never retain a label whose satellite is deselected, behind the Earth,
        // or outside the viewport. Persistence applies only to label placement.
        for (const id of history.keys()) if (!present.has(id)) history.delete(id);
        const ordered = candidates.map(candidate => {
          let memory = history.get(candidate.id);
          if (!memory) { memory = { order: serial++, slot: -1, opacity: 0, lastAt: now, clearSince: null }; history.set(candidate.id, memory); }
          return { candidate, memory };
        }).sort((a, b) => Number(b.candidate.focused) - Number(a.candidate.focused)
          || Number(b.memory.opacity > 0) - Number(a.memory.opacity > 0)
          || (a.memory.opacity > 0 && b.memory.opacity > 0 ? a.memory.order - b.memory.order : a.candidate.priority - b.candidate.priority)
          || String(a.candidate.id).localeCompare(String(b.candidate.id)));
        const placed = [], output = [];
        let accepted = 0, needsAnimation = false;
        for (const { candidate: c, memory: m } of ordered) {
          const preferred = m.slot >= 0 ? [m.slot, ...c.boxes.map((_, i) => i).filter(i => i !== m.slot)] : c.boxes.map((_, i) => i);
          let slot = -1;
          if (forceAll || c.focused || accepted < limit) {
            for (const i of preferred) {
              const box = c.boxes[i];
              if (box.left < 2 || box.right > width - 2 || box.top < 2 || box.bottom > height - 2) continue;
              // A small margin is required to admit a new label. Established
              // labels tolerate subpixel movement instead of blinking at contact.
              const gap = m.opacity > 0 ? -2 : 4;
              if (!forceAll && !c.focused && placed.some(other => overlaps(box, other, gap))) continue;
              slot = i; break;
            }
          }
          let target = slot >= 0;
          if (target) {
            if (m.clearSince === null) m.clearSince = now;
            if (initialized && m.opacity === 0 && !forceAll && !c.focused && now - m.clearSince < 180) {
              target = false; needsAnimation = true;
            }
          } else m.clearSince = null;
          const dt = Math.max(0, Math.min(100, now - m.lastAt));
          m.lastAt = now;
          if (!initialized || forceAll || c.focused) m.opacity = target ? 1 : 0;
          else m.opacity = Math.max(0, Math.min(1, m.opacity + (target ? 1 : -1) * dt / 160));
          if (target) { m.slot = slot; accepted++; }
          const box = c.boxes[m.slot];
          if (box && m.opacity > 0) {
            placed.push(box);
            output.push({ candidate: c, box, slot: m.slot, opacity: m.opacity });
          }
          if (m.opacity > 0 && m.opacity < 1) needsAnimation = true;
        }
        initialized = true;
        return { labels: output, needsAnimation };
      },
    };
  }
  return Object.freeze({ create });
});
