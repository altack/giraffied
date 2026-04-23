import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Giraffied — Modern Sprint Board for Azure DevOps',
  version: pkg.version,
  description: pkg.description,
  action: {
    default_title: 'Open Giraffied',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['storage'],
  host_permissions: ['https://dev.azure.com/*'],
  web_accessible_resources: [
    {
      resources: ['index.html'],
      matches: ['<all_urls>'],
    },
  ],
});
