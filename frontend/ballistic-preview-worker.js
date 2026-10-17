importScripts("/frontend/ballistics.js?v=physics-13");
onmessage = ({ data }) => {
  try { postMessage({ key: data.key, result: NotamBallistics.propagateStage(data.options) }); }
  catch (error) { postMessage({ key: data.key, error: error.message }); }
};
