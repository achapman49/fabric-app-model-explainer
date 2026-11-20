/**
 * App configuration. No JSX here: tools/seed-fabric.mjs loads this file in Node to export seed rows, so the nav icons
 * use createElement and the logomark uses path strings.
 */
import { createElement } from 'react';
import { BookOpen, CloudSun, FileText, Map as MapIcon, Orbit, Rocket } from 'lucide-react';

import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { connectorServices } from './config/fabric';
import { defs, type Schema } from './model';
import { seed } from './seed';

export const personas: Persona[] = [
  { sub: 'demo-admin', name: 'Alex Rivera', email: 'alex@example.com', isAdmin: true, role: 'Model owner' },
  { sub: 'demo-user', name: 'Sam Taylor', email: 'sam@example.com', isAdmin: false, role: 'Analyst' },
];

export const config: AppConfig<Schema> = {
  appId: 'model-explainer',
  title: 'Semantic Model Explainer',
  tagline: 'Open a semantic model and understand it in two minutes.',
  accent: 'cyan',
  // A star with one planet on a tilted orbit.
  logoPaths: ['M14.8 12a2.8 2.8 0 1 1-5.6 0 2.8 2.8 0 0 1 5.6 0Z', 'M20.66 7A10 4 -30 1 1 3.34 17A10 4 -30 1 1 20.66 7Z', 'M22.2 7a1.55 1.55 0 1 1-3.1 0 1.55 1.55 0 0 1 3.1 0Z'],
  defs,
  personas,
  seed,
  nav: [
    { to: '/', label: 'Sky', end: true, icon: createElement(Orbit) },
    { to: '/star-chart', label: 'Star chart', icon: createElement(MapIcon) },
    { to: '/field-guide', label: 'Field guide', icon: createElement(BookOpen) },
    { to: '/space-weather', label: 'Space weather', icon: createElement(CloudSun) },
    { to: '/probes', label: 'Probes', icon: createElement(Rocket) },
    { to: '/mission-brief', label: 'Mission brief', icon: createElement(FileText) },
  ],
  // Connector-only app: no data service. Identity (Person) uses an in-memory store in Fabric mode too.
  fabric: { data: false, extraServices: connectorServices },
};
