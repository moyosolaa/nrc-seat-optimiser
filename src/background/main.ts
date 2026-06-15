// Service worker. Minimal for now — the passive pipeline runs entirely in the content
// script. This is where active sub-segment querying would live once the auth question is
// settled (it can hold the session token and fan out search-trips calls off the page).

chrome.runtime.onInstalled.addListener(() => {
  console.info('[NRC Seat Optimiser] installed');
});
