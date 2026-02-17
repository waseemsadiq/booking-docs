/* WFCS Booking Docs — static pre-authored content (no user input) */
/* Content is loaded from <template> elements in index.html.         */
/* app.js calls loadContent(), which reads CONTENT_DATA set here.   */

(function () {
  'use strict';
  var data = {};
  var templates = document.querySelectorAll('template[data-section]');
  templates.forEach(function (t) {
    data[t.dataset.section] = t.innerHTML;
  });
  window.CONTENT_DATA = data;
}());
