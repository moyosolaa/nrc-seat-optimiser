// MAIN-world entry: installs the fetch/XHR interceptor before the page's scripts run.
// Wired by manifest.json as a document_start, world:MAIN content script.

import { installInterceptor } from './intercept';

installInterceptor();
