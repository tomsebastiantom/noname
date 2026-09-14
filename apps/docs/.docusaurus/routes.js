import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/docs',
    component: ComponentCreator('/docs', '5d4'),
    routes: [
      {
        path: '/docs',
        component: ComponentCreator('/docs', '989'),
        routes: [
          {
            path: '/docs',
            component: ComponentCreator('/docs', '3ca'),
            routes: [
              {
                path: '/docs/',
                component: ComponentCreator('/docs/', '56e'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/architecture/extension-lifecycle',
                component: ComponentCreator('/docs/architecture/extension-lifecycle', '702'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/architecture/package-boundaries',
                component: ComponentCreator('/docs/architecture/package-boundaries', 'c42'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/concepts/documents-and-layouts',
                component: ComponentCreator('/docs/concepts/documents-and-layouts', '31e'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/concepts/evidence-and-provenance',
                component: ComponentCreator('/docs/concepts/evidence-and-provenance', 'ee0'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/concepts/machines-and-xstate',
                component: ComponentCreator('/docs/concepts/machines-and-xstate', 'cca'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/concepts/seeding',
                component: ComponentCreator('/docs/concepts/seeding', 'b73'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/concepts/system-overview',
                component: ComponentCreator('/docs/concepts/system-overview', '3ea'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/decisions/ADR-0001-domain-vs-extension',
                component: ComponentCreator('/docs/decisions/ADR-0001-domain-vs-extension', '385'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/decisions/ADR-0002-xstate-transition-authority',
                component: ComponentCreator('/docs/decisions/ADR-0002-xstate-transition-authority', '5dc'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/decisions/ADR-0005-evidence-provenance-kernel',
                component: ComponentCreator('/docs/decisions/ADR-0005-evidence-provenance-kernel', '347'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/decisions/ADR-0006-commerce-ui-ownership',
                component: ComponentCreator('/docs/decisions/ADR-0006-commerce-ui-ownership', '7d9'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/decisions/ADR-0007-seeding-and-fixture-boundaries',
                component: ComponentCreator('/docs/decisions/ADR-0007-seeding-and-fixture-boundaries', '2bc'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/get-started/build-your-first-store',
                component: ComponentCreator('/docs/get-started/build-your-first-store', '127'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/get-started/local-development',
                component: ComponentCreator('/docs/get-started/local-development', '5d2'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/history/audit-reports',
                component: ComponentCreator('/docs/history/audit-reports', 'efc'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/history/implementation-records',
                component: ComponentCreator('/docs/history/implementation-records', 'c26'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/history/overview',
                component: ComponentCreator('/docs/history/overview', '75c'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/how-to/create-an-extension',
                component: ComponentCreator('/docs/how-to/create-an-extension', 'a09'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/how-to/seed-a-commerce-demo',
                component: ComponentCreator('/docs/how-to/seed-a-commerce-demo', '4f5'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/how-to/verify-a-checkout',
                component: ComponentCreator('/docs/how-to/verify-a-checkout', '2ec'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/operations/local-stack',
                component: ComponentCreator('/docs/operations/local-stack', '4b0'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/operations/troubleshooting',
                component: ComponentCreator('/docs/operations/troubleshooting', '344'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/docs/reference/',
                component: ComponentCreator('/docs/reference/', '06f'),
                exact: true,
                sidebar: "reference"
              },
              {
                path: '/docs/reference/api/capabilities',
                component: ComponentCreator('/docs/reference/api/capabilities', '6df'),
                exact: true,
                sidebar: "reference"
              },
              {
                path: '/docs/reference/api/evidence',
                component: ComponentCreator('/docs/reference/api/evidence', 'e36'),
                exact: true,
                sidebar: "reference"
              },
              {
                path: '/docs/reference/api/machines',
                component: ComponentCreator('/docs/reference/api/machines', 'd78'),
                exact: true,
                sidebar: "reference"
              },
              {
                path: '/docs/reference/packages/fixtures',
                component: ComponentCreator('/docs/reference/packages/fixtures', 'f0b'),
                exact: true,
                sidebar: "reference"
              },
              {
                path: '/docs/reference/packages/seeding',
                component: ComponentCreator('/docs/reference/packages/seeding', '8a1'),
                exact: true,
                sidebar: "reference"
              },
              {
                path: '/docs/reference/permissions',
                component: ComponentCreator('/docs/reference/permissions', 'fa8'),
                exact: true,
                sidebar: "reference"
              },
              {
                path: '/docs/reference/seed-profiles',
                component: ComponentCreator('/docs/reference/seed-profiles', 'fb0'),
                exact: true,
                sidebar: "reference"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '/',
    component: ComponentCreator('/', 'e5f'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
