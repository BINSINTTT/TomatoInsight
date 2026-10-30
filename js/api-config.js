/**
 * Local pages talk to the Flask server on this PC.
 * The published site talks to the Render web service.
 * Name that Render service "tomato-insight-api".
 */
(function () {
  var host = window.location.hostname;
  var local = host === "localhost" || host === "127.0.0.1";
  window.TOMATO_INSIGHT_API_BASE = local
    ? "http://127.0.0.1:8765"
    : "https://tomato-insight-api.onrender.com";
})();
