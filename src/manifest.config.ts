import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

const icons = {
  '16': 'icons/icon-16.png',
  '32': 'icons/icon-32.png',
  '48': 'icons/icon-48.png',
  '128': 'icons/icon-128.png',
};

export default defineManifest({
  manifest_version: 3,
  name: 'Giraffied — Sprint Board for Azure DevOps',
  short_name: 'Giraffied',
  version: pkg.version,
  description:
    'A fast, Linear-style sprint taskboard for Azure DevOps. Drag cards across columns, reorder swimlanes, keep your sprint in flow.',
  author: { email: 'guzmanoj@altack.com' },
  homepage_url: 'https://github.com/altack/giraffied',
  minimum_chrome_version: '114',
  icons,
  action: {
    default_title: 'Open Giraffied',
    default_icon: icons,
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['storage'],
  host_permissions: ['https://dev.azure.com/*'],
});
