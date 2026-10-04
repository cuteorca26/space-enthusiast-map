(function initTrajectoryEditHistory(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NotamTrajectoryHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTrajectoryEditHistoryApi() {
  "use strict";

  const MAX_HISTORY = 80;

  function clonePoints(points) {
    return (points || []).map((point) => ({ ...point }));
  }

  function cloneCurveControls(curveControls) {
    return Object.fromEntries(Object.entries(curveControls || {}).map(([key, point]) => [key, { ...point }]));
  }

  function snapshot(track) {
    return {
      points: clonePoints(track?.points),
      curveControls: cloneCurveControls(track?.curveControls),
    };
  }

  function signature(value) {
    return JSON.stringify(value || { points: [], curveControls: {} });
  }

  function ensure(track) {
    if (!track) return track;
    if (!Array.isArray(track.manualUndoStack)) track.manualUndoStack = [];
    if (!Array.isArray(track.manualRedoStack)) track.manualRedoStack = [];
    track.manualLocked = Boolean(track.manualLocked);
    return track;
  }

  function apply(track, value) {
    if (!track || !value) return false;
    track.points = clonePoints(value.points);
    track.curveControls = cloneCurveControls(value.curveControls);
    track.pointIds = track.points.map((point) => point.restrictionId).filter(Boolean);
    return true;
  }

  function commit(track, before) {
    ensure(track);
    const current = snapshot(track);
    if (!before || signature(before) === signature(current)) return false;
    track.manualUndoStack.push(before);
    if (track.manualUndoStack.length > MAX_HISTORY) track.manualUndoStack.splice(0, track.manualUndoStack.length - MAX_HISTORY);
    track.manualRedoStack = [];
    return true;
  }

  function undo(track) {
    ensure(track);
    const previous = track.manualUndoStack.pop();
    if (!previous) return false;
    track.manualRedoStack.push(snapshot(track));
    return apply(track, previous);
  }

  function redo(track) {
    ensure(track);
    const next = track.manualRedoStack.pop();
    if (!next) return false;
    track.manualUndoStack.push(snapshot(track));
    return apply(track, next);
  }

  function canUndo(track) {
    ensure(track);
    return track.manualUndoStack.length > 0;
  }

  function canRedo(track) {
    ensure(track);
    return track.manualRedoStack.length > 0;
  }

  return { MAX_HISTORY, apply, canRedo, canUndo, commit, ensure, redo, snapshot, undo };
});
