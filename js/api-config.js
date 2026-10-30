/**
 * Local pages talk to the Flask server on this PC.
 * The Render site talks to itself. Firebase Hosting talks to that same Render service.
 */
(function () {
  var host = window.location.hostname;
  var local = host === "localhost" || host === "127.0.0.1";
  if (local) {
    window.TOMATO_INSIGHT_API_BASE = "http://127.0.0.1:8765";
  } else if (/\.onrender\.com$/i.test(host)) {
    window.TOMATO_INSIGHT_API_BASE = window.location.origin;
  } else {
    window.TOMATO_INSIGHT_API_BASE = "https://tomatoinsighttestdeployment.onrender.com";
  }
})();
